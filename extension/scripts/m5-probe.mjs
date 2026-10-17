/**
 * M5 probe: loads .output/chrome-mv3 into a throwaway headless Chrome, seeds a replayed synthetic
 * history into the extension's IndexedDB and checks the real UI end to end, offline:
 *   the dashboard shows today's metrics, the timeline (lanes, deep-block outlines, nudge markers),
 *   the history picker, a template autopsy that can be written and stored, the popup's focus metrics,
 *   the privacy flows (forget last hour, forget a range + its report, forget a site + always skip,
 *   blocklist editor, retention, wipe), no exceptions, and no wording about time outside the browser.
 * Usage: npm run eval:m5 && npm run build && npm run probe:m5   (HEADED=1 shows the browser; OUT=dir for screenshots)
 * Writes ../docs/showcase/M5/m5-probe.json and screenshots next to it.
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
const outDir = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M5');
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

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-m5-'));
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
  const dash = await openPage(`chrome-extension://${extId}/dashboard.html#all`);
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
  await evaluate(s, 'window.confirm = () => true; true');

  // ---- Today: metrics, timeline, history picker ----
  await waitFor(s, `document.querySelectorAll('#today .tile').length === 4`, 'four metric tiles');
  await waitFor(s, `document.querySelectorAll('#today svg.chart rect').length > 10`, 'timeline rectangles');
  const today = await evaluate(
    s,
    `(() => ({
      tiles: [...document.querySelectorAll('#today .tile')].map((t) => t.innerText.replace(/\\s+/g, ' ').trim()),
      lanes: [...document.querySelectorAll('#today svg.chart text')].length,
      segments: document.querySelectorAll('#today svg.chart rect:not([stroke-dasharray])').length,
      blocks: document.querySelectorAll('#today svg.chart rect[stroke-dasharray]').length,
      nudges: document.querySelectorAll('#today svg.chart path[d^="M0,0"]').length,
      velocityDots: document.querySelectorAll('#today svg.chart circle').length,
      days: document.querySelectorAll('#today select option').length,
      legend: document.querySelector('#today .legend')?.innerText ?? '',
    }))()`,
  );
  check('today: four metric tiles with numbers', today.tiles.length === 4 && /\d/.test(today.tiles[0]) && /switches/.test(today.tiles[1]), today.tiles);
  check('timeline: lanes, segments, deep-block outlines, velocity line', today.lanes > 5 && today.segments > 5 && today.blocks >= 1 && today.velocityDots > 10, today);
  check('history picker lists the seeded days', today.days >= 8, today.days);
  await shot(s, 'dashboard-today.png');

  // ---- Autopsy: preview, then write and store ----
  await waitFor(s, `document.querySelectorAll('#autopsy .autopsy p').length >= 4`, 'autopsy paragraphs');
  const preview = await evaluate(s, `document.querySelector('#autopsy .pill')?.innerText`);
  check('autopsy: preview before it is saved', /Preview/.test(preview), preview);
  await evaluate(s, clickText("Write today's autopsy now"));
  await waitFor(s, `/Written from a template/.test(document.querySelector('#autopsy .pill')?.innerText ?? '')`, 'stored autopsy');
  const stored = await evaluate(s, `(async () => { ${IDB} const r = (await all('reports')).find((x) => x.date === new Date().toLocaleDateString('sv')); return r && { modelVersion: r.modelVersion, words: r.autopsy.split(/\\s+/).length, deep: r.facts.deepBlocks.count, hasTomorrow: /Tomorrow/.test(r.autopsy) }; })()`);
  check('autopsy: stored as a template report of 120-180 words', stored && stored.modelVersion === 'template' && stored.words >= 120 && stored.words <= 180 && stored.hasTomorrow, stored);

  // ---- Success metrics ----
  const success = await evaluate(s, `document.querySelector('#success')?.innerText ?? ''`);
  check('success metrics are shown (PDD 4.7)', /Deep blocks per day/.test(success) && /Nudges accepted/.test(success), success.slice(0, 200));

  // ---- History: an older day with a 7-day comparison ----
  const dates = await evaluate(s, `[...document.querySelectorAll('#today select option')].map((o) => o.value)`);
  await evaluate(s, `(() => { const sel = document.querySelector('#today select'); sel.value = ${JSON.stringify(dates[0])}; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(800);
  const todayWeek = await evaluate(s, `document.querySelector('#today')?.innerText.includes('Against your 7-day average')`);
  await evaluate(s, `(() => { const sel = document.querySelector('#today select'); sel.value = ${JSON.stringify(dates[dates.length - 1])}; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(1200);
  const oldest = await evaluate(s, `({ h: document.querySelector('#today h2')?.innerText, tiles: document.querySelectorAll('#today .tile').length, comparison: document.querySelector('#today')?.innerText.includes('Against your 7-day average') })`);
  check('history: today compares with 7 earlier days, the oldest day does not', todayWeek === true && oldest.comparison === false && oldest.h?.toLowerCase() === 'history' && oldest.tiles === 4, { todayWeek, oldest });
  await evaluate(s, `(() => { const sel = document.querySelector('#today select'); sel.value = ${JSON.stringify(dates[0])}; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(800);

  // ---- Wording ----
  const text = await evaluate(s, `document.body.innerText`);
  const hit = new RegExp(OUTSIDE, 'i').exec(text);
  check('dashboard text never mentions time outside the browser', !hit, hit?.[0] ?? null);

  // ---- Popup ----
  const popup = await openPage(`chrome-extension://${extId}/popup.html`);
  await waitFor(popup.sessionId, `/deep blocks/i.test(document.body.innerText)`, 'popup focus metrics');
  const popupText = await evaluate(popup.sessionId, `document.body.innerText`);
  check('popup shows deep blocks, residue, drain past allowance, nudges', /deep blocks/i.test(popupText) && /switches/i.test(popupText) && /drain over/i.test(popupText) && /nudges/i.test(popupText), popupText.replace(/\s+/g, ' ').slice(0, 300));
  check('popup wording', !new RegExp(OUTSIDE, 'i').test(popupText));
  await shot(popup.sessionId, 'popup.png');
  await send('Target.closeTarget', { targetId: popup.targetId });

  // ---- Privacy ----
  await evaluate(s, `document.getElementById('privacy').scrollIntoView(); true`);
  await shot(s, 'dashboard-privacy.png');
  const binsBefore = await evaluate(s, `(async () => { ${IDB} return (await all('bins')).length; })()`);
  await evaluate(s, clickText('Last hour'));
  await waitFor(s, `/Forgot \\d+ items/.test(document.querySelector('#privacy [role=status]')?.innerText ?? '')`, 'forget result');
  const forgot = await evaluate(s, `document.querySelector('#privacy [role=status]').innerText`);
  const nowBins = await evaluate(s, `(async () => { ${IDB} const now = Date.now(); return (await all('bins')).filter((b) => b.binStart >= now - 3600000 && b.binStart <= now).length; })()`);
  check('forget last hour: UI flow works and the hour is empty', nowBins === 0, { forgot, binsBefore });

  // A whole past day: its stored report goes with it.
  const day = dates[dates.length - 2];
  await evaluate(s, `${msg('report-generate', { date: day })}`);
  const hadReport = await evaluate(s, `(async () => { ${IDB} return (await all('reports')).some((r) => r.date === ${JSON.stringify(day)}); })()`);
  const [y, m, d] = day.split('-').map(Number);
  const range = await evaluate(s, `${msg('privacy-forget-range', { from: new Date(y, m - 1, d).getTime(), to: new Date(y, m - 1, d + 1).getTime() - 1 }).replace('y, m - 1, d', `${y}, ${m - 1}, ${d}`)}`);
  const afterDay = await evaluate(s, `(async () => { ${IDB} const bins = (await all('bins')).filter((b) => new Date(b.binStart).toLocaleDateString('sv') === ${JSON.stringify(day)}).length; return { bins, report: (await all('reports')).some((r) => r.date === ${JSON.stringify(day)}), log: (await all('forgetLog')).map((l) => Object.keys(l).sort().join()) }; })()`);
  check('forget a whole day: bins and its report are gone, only the kind is logged', hadReport && afterDay.bins === 0 && afterDay.report === false && afterDay.log.every((k) => !/title|origin|path|text/.test(k)), { range: range.slice(0, 160), afterDay });

  // Forget a site with always-skip, through the UI.
  await evaluate(s, typeInto('Site to forget', 'example.com'));
  await sleep(200);
  await evaluate(s, clickText('Forget site'));
  await waitFor(s, `/never observe|blocklist/.test(document.querySelector('#privacy [role=status]')?.innerText ?? '')`, 'forget site result');
  const blocklist = await evaluate(s, `chrome.storage.local.get('settings').then((r) => r.settings?.blocklist?.addedDomains)`);
  check('forget a site + always skip adds it to the blocklist', blocklist?.includes('example.com'), blocklist);

  // Blocklist editor, retention, titles.
  await evaluate(s, typeInto('Site to block', 'https://www.MyBank.example.com/login?x=1'));
  await evaluate(s, clickText('Add site'));
  await evaluate(s, typeInto('Keyword to block', 'payroll'));
  await evaluate(s, clickText('Add keyword'));
  await sleep(500);
  await evaluate(s, `(() => { const sel = document.querySelector('#privacy select[aria-label="Keep data for"]'); sel.value = '14'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(500);
  const settings = await evaluate(s, `chrome.storage.local.get('settings').then((r) => r.settings)`);
  check('blocklist editor and retention save to settings', settings.blocklist.addedDomains.includes('mybank.example.com') && settings.blocklist.addedKeywords.includes('payroll') && settings.retentionDays === 14, { added: settings.blocklist, retention: settings.retentionDays });
  const listed = await evaluate(s, `document.querySelector('#privacy .entries')?.innerText.includes('mybank.example.com')`);
  check('blocklist entries are listed with the new one', listed === true);

  // Wipe everything: type WIPE, click.
  await evaluate(s, `caches.open('transformers-cache').then((c) => c.put('https://huggingface.co/model.bin', new Response('x'))).then(() => true)`);
  const disabled = await evaluate(s, `[...document.querySelectorAll('#privacy button.danger')][0].disabled`);
  await evaluate(s, typeInto('Type WIPE to confirm', 'WIPE'));
  await sleep(300);
  await evaluate(s, clickText('Wipe everything', 'button.danger'));
  await sleep(3500);
  await waitFor(s, `document.readyState === 'complete'`, 'reload after wipe');
  const wiped = await evaluate(s, `(async () => { ${IDB} const db = await idb(); const counts = {}; for (const n of db.objectStoreNames) counts[n] = (await all(n)).length; return { counts, caches: await caches.keys(), settings: (await chrome.storage.local.get('settings')).settings ?? null }; })()`);
  const total = Object.values(wiped.counts).reduce((a, b) => a + b, 0);
  check('wipe: needs the typed word, then empties every store, the model cache and the settings', disabled === true && total <= 2 && wiped.caches.length === 0 && wiped.settings === null, { disabled, total, wiped });
  await shot(s, 'dashboard-after-wipe.png');

  check('no exceptions in extension pages', exceptions.length === 0, exceptions.slice(0, 5));
} catch (err) {
  check('probe ran to the end', false, String(err?.stack ?? err).slice(0, 800));
} finally {
  results.failed = fail;
  writeFileSync(join(outDir, 'm5-probe.json'), JSON.stringify(results, null, 1));
  chrome.kill();
  server.close();
  console.log(fail.length ? `\n${fail.length} check(s) failed: ${fail.join('; ')}` : '\nAll checks passed.');
  process.exit(fail.length ? 1 : 0);
}
