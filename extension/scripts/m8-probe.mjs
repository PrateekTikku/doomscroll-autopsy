/**
 * M8 probe: the Should-tier features in the real extension (headless Chrome, throwaway profile), seeded with the
 * replayed persona history from `npm run eval:m5`:
 *   GRU trains in the offscreen document (WebGPU if available) and is evaluated against Markov (promotion per D-20);
 *   the attention map draws from vectors and selects territories;
 *   (topic tags come from real embeddings and feed the naming prompt;
 *   (later items add: breathing step, forget one capture.)
 * Usage: npm run eval:m5 && npm run build && npm run probe:m8   (HEADED=1, OUT=dir, EXT=folder)
 * Writes ../docs/showcase/M8/m8-probe.json and screenshots next to it.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = process.env.EXT ? resolve(process.env.EXT) : resolve(here, '../.output/chrome-mv3');
const seedPath = resolve(here, '../.output/probe-seed.json');
const outDir = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M8');
mkdirSync(outDir, { recursive: true });
if (!existsSync(seedPath)) throw new Error('Run `npm run eval:m5` first (it writes .output/probe-seed.json).');

const server = createServer((req, res) => {
  if (req.url === '/seed.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(readFileSync(seedPath));
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-m8-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(
  chromePath,
  [...(process.env.HEADED ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--window-size=1280,1100', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);
const out = chrome.stdio[3];
const inp = chrome.stdio[4];
let id = 0;
let buf = '';
const pending = new Map();
const exceptions = [];
inp.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled' && process.env.DEBUG && ['error', 'warning'].includes(msg.params.type)) {
      console.log('console.' + msg.params.type, JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)).slice(0, 400));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? 'exception');
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const m = { id: ++id, method, params };
    if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, res);
    out.write(JSON.stringify(m) + '\0');
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
}
async function waitFor(sessionId, expression, what, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const v = await evaluate(sessionId, expression).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}
async function openPage(url) {
  const { result } = await send('Target.createTarget', { url });
  const { result: att } = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  await send('Runtime.enable', {}, att.sessionId);
  await send('Page.enable', {}, att.sessionId);
  return { targetId: result.targetId, sessionId: att.sessionId };
}
async function shot(sessionId, name, full = false) {
  let clip;
  if (full) {
    const m = await send('Page.getLayoutMetrics', {}, sessionId);
    const c = m.result.cssContentSize ?? m.result.contentSize;
    clip = { x: 0, y: 0, width: c.width, height: Math.min(c.height, 6000), scale: 1 };
  }
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) }, sessionId);
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
}
const results = { date: new Date().toISOString(), checks: {} };
const fail = [];
const check = (name, ok, detail) => {
  results.checks[name] = { ok, detail };
  console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
  if (!ok) fail.push(name);
};

// Same phrases as lib/metrics/validate.ts OUTSIDE_BROWSER.
const OUTSIDE = String.raw`\b(offline|off[- ]?screen|off the (screen|browser|computer)|away from (the |your )?(keyboard|screen|computer|browser|desk)|time away|while (you were )?away|outside (of )?(the |your )?(browser|chrome|computer)|phone|smartphone|mobile|tablet|other apps?|desktop apps?|in person|commut\w*|meetings?|lunch|dinner|sleep\w*|touch grass|go outside|take a walk|walk\b|exercis\w*|gym)\b`;

// Helpers that run inside the dashboard page.
const IDB = `
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = async (store) => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
`;
const clickText = (text, selector = 'button') =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`;
const typeInto = (label, value) =>
  `(() => { const el = document.querySelector('[aria-label=${JSON.stringify(label)}]'); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
const msg = (type, payload) =>
  `chrome.runtime.sendMessage({ target: 'background', type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload)} }).then((r) => JSON.stringify(r))`;

try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const dash = await openPage(`chrome-extension://${extId}/dashboard.html`);
  const s = dash.sessionId;
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
  await sleep(2500);

  // ---- Seed: the replayed history, shifted so its last day is today ----
  const seeded = await evaluate(
    s,
    `(async () => { ${IDB}
      const seed = await (await fetch('${base}/seed.json')).json();
      const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
      const lastBin = Math.max(...seed.bins.map((b) => b.binStart));
      const shiftDays = Math.round((startOfDay(Date.now()) - startOfDay(lastBin)) / 86400000);
      const shift = (ts) => { const d = new Date(ts); d.setDate(d.getDate() + shiftDays); return d.getTime(); };
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction(['bins', 'territories', 'nudges'], 'readwrite');
        for (const b of seed.bins) tx.objectStore('bins').put({ ...b, binStart: shift(b.binStart) });
        for (const t of seed.territories) tx.objectStore('territories').put({ ...t, centroid: new Float32Array(t.centroid) });
        for (const n of seed.nudges) tx.objectStore('nudges').put({ ...n, ts: shift(n.ts) });
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      return { bins: seed.bins.length, territories: seed.territories.length, nudges: seed.nudges.length, shiftDays };
    })()`,
  );
  check('seed loaded', seeded.bins > 5000 && seeded.territories > 3, seeded);
  await send('Page.reload', {}, s);
  await sleep(2500);

  // ---- GRU: train in the offscreen document, evaluate against Markov ----
  const t0 = Date.now();
  // Watch the offscreen document (where TF.js trains) for errors once it exists.
  void (async () => {
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const { result } = await send('Target.getTargets');
      const off = result.targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
      if (off) {
        const { result: att } = await send('Target.attachToTarget', { targetId: off.targetId, flatten: true });
        await send('Runtime.enable', {}, att.sessionId);
        return;
      }
    }
  })();
  const gruRaw = await Promise.race([evaluate(s, `${msg('gru-run', process.env.GRU_BACKEND ? { backend: process.env.GRU_BACKEND } : undefined)}`), sleep(Number(process.env.GRU_WAIT_MS ?? 300000)).then(() => 'null')]);
  const gru = JSON.parse(gruRaw)?.data ?? JSON.parse(gruRaw);
  results.gru = { ...gru, wallMs: Date.now() - t0 };
  check('GRU trains in the extension and is evaluated against Markov', gru && gru.trainWindows > 200 && gru.gruAuc !== undefined && gru.reason, results.gru);
  const stored = JSON.parse(await evaluate(s, `${msg('gru-status', undefined)}`));
  check('GRU verdict is stored and shown in the dashboard', stored && (stored.data ?? stored).reason === gru.reason);
  await send('Page.reload', {}, s);
  await waitFor(s, `document.querySelector('#gru')?.innerText.includes('Markov')`, 'GRU panel');
  await evaluate(s, `document.getElementById('gru').scrollIntoView(); true`);
  await shot(s, 'dashboard-gru.png');
  const mode = JSON.parse(await evaluate(s, `${msg('spiral-status', undefined)}`));
  results.modeAfterGru = (mode.data ?? mode).mode;
  check('the active mode follows the promotion verdict', gru.promoted ? results.modeAfterGru === 'gru' : results.modeAfterGru !== 'gru', results.modeAfterGru);

  // ---- Attention map: vectors around each territory's centroid, drawn and clicked ----
  const planted = await evaluate(
    s,
    `(async () => { ${IDB}
      const territories = await all('territories');
      const db = await idb();
      let n = 0; let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      await new Promise((res, rej) => {
        const tx = db.transaction('samples', 'readwrite');
        for (const t of territories.slice(0, 8)) {
          for (let k = 0; k < 40; k++) {
            const v = Float32Array.from(t.centroid, (x) => x + (rnd() - 0.5) * 0.08);
            let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm); for (let i = 0; i < v.length; i++) v[i] /= norm;
            tx.objectStore('samples').put({ ts: Date.now() - (n + 1) * 60000, origin: 'https://probe.example', path: '/' + t.id.slice(0, 6), isVisual: false, dwellMs: 3000, vector: v, territoryId: t.id, territoryDist: 0.1 });
            n++;
          }
        }
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      return { territories: territories.length, samples: n };
    })()`,
  );
  await send('Page.reload', {}, s);
  await waitFor(s, `document.getElementById('map')`, 'map section');
  await evaluate(s, clickText('Draw map'));
  await waitFor(s, `document.querySelectorAll('#map svg circle').length > 200`, 'map dots', 60000);
  const mapInfo = await evaluate(s, `({ dots: document.querySelectorAll('#map svg circle').length, text: document.getElementById('map-selection').innerText, fills: [...new Set([...document.querySelectorAll('#map svg circle')].map((c) => c.getAttribute('fill')))] })`);
  check('attention map draws one dot per sampled item, coloured by label', mapInfo.dots >= 300 && mapInfo.fills.length >= 2, { planted, mapInfo });
  await evaluate(s, `document.getElementById('map').scrollIntoView(); true`);
  await shot(s, 'dashboard-map.png');
  // Click the first dot's position: the nearest territory is selected and its row exists.
  const clicked = await evaluate(
    s,
    `(() => { const svg = document.querySelector('#map svg'); const c = svg.querySelector('circle'); const r = svg.getBoundingClientRect(); const bb = c.getBoundingClientRect();
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2 })); return true; })()`,
  );
  await sleep(500);
  const selection = await evaluate(s, `({ text: document.getElementById('map-selection').innerText, rows: document.querySelectorAll('tr[id^=territory-]').length })`);
  check('clicking a dot selects its territory (and the territory list has the row)', /^Selected: /.test(selection.text) && selection.rows > 0, selection);
  await shot(s, 'dashboard-map-selected.png');

  // ---- Topic tags with the real embedder, then naming with tags in the prompt ----
  const realTexts = {
    cooking: ['Easy 15 minute pasta carbonara recipe', 'How to bake sourdough bread at home', 'Street food tour: best noodles in Bangkok', 'Chocolate chip cookie recipe step by step', 'Meal prep ideas for the week, healthy dinners'],
    programming: ['Python tutorial: decorators explained with examples', 'API reference: fetch() and the Response object', 'How to debug a memory leak in Node.js', 'Rust ownership and borrowing documentation', 'Code review: refactoring a large pull request'],
  };
  const tagged = await evaluate(
    s,
    `(async () => { ${IDB}
      const texts = ${JSON.stringify(realTexts)};
      const embed = (text) => chrome.runtime.sendMessage({ target: 'offscreen', type: 'embed', payload: { text, image: null } }).then((r) => (r.data ?? r).vector);
      const db = await idb();
      const out = {};
      let t = Date.now() - 3600000;
      for (const [name, list] of Object.entries(texts)) {
        const vecs = [];
        for (const text of list) vecs.push(Float32Array.from(await embed(text)).slice(0, 256));
        const c = new Float32Array(256);
        for (const v of vecs) for (let i = 0; i < 256; i++) c[i] += v[i];
        let n = 0; for (const x of c) n += x * x; n = Math.sqrt(n); for (let i = 0; i < 256; i++) c[i] /= n;
        const id = 'probe-' + name;
        const host = name === 'cooking' ? 'https://www.allrecipes.com' : 'https://docs.python.org';
        await new Promise((res, rej) => {
          const tx = db.transaction(['territories', 'samples', 'bins'], 'readwrite');
          tx.objectStore('territories').put({ id, centroid: c, size: 40, name: name + ' baseline', topicTags: [], suggestedLabel: null, label: null, labelConfirmed: false, allowanceMin: null, createdAt: Date.now(), updatedAt: Date.now() });
          for (let k = 0; k < 40; k++) tx.objectStore('samples').put({ ts: t + k * 20000, origin: host, path: '/' + name + '/' + k, isVisual: false, dwellMs: 20000, vector: vecs[k % vecs.length], territoryId: id, territoryDist: 0.1 });
          for (let k = 0; k < 40; k++) tx.objectStore('bins').put({ binStart: Math.floor((t + k * 30000) / 30000) * 30000, active_s: 30, territoryId: id, away: false, idle: false, nudgeShown: false, nudgeResponse: null, scroll_px_s_mean: 10, items_per_min: 2, mean_dwell_ms: 20000, video_skip_rate: 0, tab_switches: 0, away_s: 0, idle_s: 0 });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        t += 3600000 / 2;
        out[name] = id;
      }
      return out;
    })()`,
  );
  const tagRun = await Promise.race([evaluate(s, `${msg('topics-refresh', undefined)}`), sleep(240000).then(() => 'null')]);
  const tagReport = JSON.parse(tagRun);
  const tagsNow = await evaluate(s, `(async () => { ${IDB} const rows = await all('territories'); return Object.fromEntries(rows.filter((t) => t.id.startsWith('probe-')).map((t) => [t.id, t.topicTags])); })()`);
  results.topicTags = { report: tagReport.data ?? tagReport, tagsNow };
  const cookTags = (tagsNow['probe-cooking'] ?? []).map((x) => x.tag).join(' | ');
  const progTags = (tagsNow['probe-programming'] ?? []).map((x) => x.tag).join(' | ');
  check('topic tags: real embeddings give sensible top-3 tags for cooking and programming territories', /recipe|cook|food|meal|baking|kitchen/i.test(cookTags) && /program|code|software|python|api|develop|debug|documentation/i.test(progTags), { cookTags, progTags });
  check('topic tags: all territories are tagged by the refresh', (tagReport.data ?? tagReport).territories >= 12, tagReport.data ?? tagReport);

  const namedRaw = await Promise.race([evaluate(s, `${msg('gen-name-territories', { force: true })}`), sleep(300000).then(() => 'null')]);
  const named = JSON.parse(namedRaw);
  const rep = named?.data ?? named;
  const mine = (rep?.results ?? []).filter((r) => r.id.startsWith('probe-'));
  results.namingWithTags = mine;
  check('naming with tags in the prompt: the model names both tagged territories after what is in them', mine.length === 2 && mine.every((r) => r.source === 'model' && r.errors.length === 0) && /cook|bak|recipe|food/i.test(mine.find((r) => r.id === 'probe-cooking')?.name ?? '') && /python|program|api|doc|code/i.test(mine.find((r) => r.id === 'probe-programming')?.name ?? ''), mine.map((r) => ({ id: r.id, name: r.name, label: r.label })));

  check('no exceptions in extension pages', exceptions.length === 0, exceptions.slice(0, 5));
} catch (err) {
  check('probe ran to the end', false, String(err?.stack ?? err).slice(0, 800));
} finally {
  results.failed = fail;
  writeFileSync(join(outDir, 'm8-probe.json'), JSON.stringify(results, null, 1));
  chrome.kill();
  server.close();
  console.log(fail.length ? `\n${fail.length} check(s) failed: ${fail.join('; ')}` : '\nAll checks passed.');
  process.exit(fail.length ? 1 : 0);
}
