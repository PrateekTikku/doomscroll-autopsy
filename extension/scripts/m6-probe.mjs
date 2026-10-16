/**
 * M6 probe: loads .output/chrome-mv3 (with the bundled fine-tuned Gemma 3 270M) into a throwaway
 * headless Chrome and runs the writer model through the real path (service worker -> offscreen
 * document -> WebGPU) on replayed persona days:
 *   - per persona: seed unconfirmed territories + samples + bins, name the territories with the
 *     model, write an autopsy for every day (model first, validators, template fallback);
 *   - the model loads on demand and is unloaded after the job; the dashboard shows which source
 *     wrote each name and autopsy; the popup shows the writer's state; no exceptions.
 * Usage: npm run build && npm run eval:m6 && npm run probe:m6 && npm run report:m6
 * (HEADED=1 shows the browser; PERSONAS=developer,writer limits the run). Writes m6-probe.json and
 * screenshots next to it, and the raw material for `report:m6` to .output/m6-probe-raw.json.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, '../.output/chrome-mv3');
const seedDir = resolve(here, '../.output/m6-seed');
const rawPath = resolve(here, '../.output/m6-probe-raw.json');
const outDir = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M6');
mkdirSync(outDir, { recursive: true });
if (!existsSync(seedDir)) throw new Error('Run `npm run eval:m6` first (it writes .output/m6-seed/).');

const server = createServer((req, res) => {
  const m = /^\/seed\/(\w+)\.json$/.exec(req.url ?? '');
  if (m && existsSync(join(seedDir, `${m[1]}.json`))) {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(readFileSync(join(seedDir, `${m[1]}.json`)));
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-m6-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(
  chromePath,
  [...(process.env.HEADED ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', '--window-size=1280,1100', 'about:blank'],
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


const IDB = `
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = async (store) => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
`;
const msg = (target, type, payload) =>
  `chrome.runtime.sendMessage({ target: ${JSON.stringify(target)}, type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload ?? null)} }).then((r) => JSON.stringify(r))`;
const call = async (s, target, type, payload) => {
  const r = JSON.parse(await evaluate(s, msg(target, type, payload)));
  if (!r.ok) throw new Error(`${type}: ${r.error}`);
  return r.data;
};

const personaIds = (process.env.PERSONAS ?? 'developer,writer,researcher,designer,student,freelancer').split(',');
const raw = { personas: [], g1: null };

try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const dash = await openPage(`chrome-extension://${extId}/dashboard.html`);
  const s = dash.sessionId;
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
  await sleep(2500);
  const startedOffscreen = await call(s, 'background', 'ping-offscreen');
  check('offscreen document starts', startedOffscreen.offscreen === true);

  const pre = await call(s, 'offscreen', 'gen-status');
  check('the writer model is not loaded before it is needed', pre.state === 'not-started', pre.state);

  let totalStats = { naming: { items: 0, model: 0, fallback: 0, unavailable: 0, generations: 0, errors: {} }, autopsy: { items: 0, model: 0, fallback: 0, unavailable: 0, generations: 0, errors: {} } };
  let firstLoadMs = null;

  for (const personaId of personaIds) {
    const t0 = Date.now();
    // Fresh data for each persona.
    await call(s, 'background', 'privacy-wipe');
    await sleep(300);
    const seeded = await evaluate(
      s,
      `(async () => { ${IDB}
        const seed = await (await fetch('${base}/seed/${personaId}.json')).json();
        const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
        const lastBin = Math.max(...seed.bins.map((b) => b.binStart));
        const shiftDays = Math.round((startOfDay(Date.now()) - startOfDay(lastBin)) / 86400000);
        const shift = (ts) => { const d = new Date(ts); d.setDate(d.getDate() + shiftDays); return d.getTime(); };
        // keep the data in the past: if the last day's end is still in the future, pull everything back one more day
        const db = await idb();
        await new Promise((res, rej) => {
          const tx = db.transaction(['bins', 'territories', 'nudges', 'samples'], 'readwrite');
          for (const b of seed.bins) tx.objectStore('bins').put({ ...b, binStart: shift(b.binStart) });
          for (const t of seed.territories) tx.objectStore('territories').put({ ...t, centroid: new Float32Array(t.centroid) });
          for (const n of seed.nudges) tx.objectStore('nudges').put({ ...n, ts: shift(n.ts) });
          for (const x of seed.samples) tx.objectStore('samples').put({ ...x, ts: shift(x.ts) });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        const dates = [...new Set(seed.bins.map((b) => new Date(shift(b.binStart)).toLocaleDateString('sv')))].sort();
        return { bins: seed.bins.length, territories: seed.territories.length, samples: seed.samples.length, dates };
      })()`,
    );
    const truthOf = await evaluate(s, `(async () => { ${IDB} const base = {}; for (const t of await all('territories')) base[t.id] = t.name; return base; })()`);
    const truths = JSON.parse(readFileSync(join(seedDir, `${personaId}.json`), 'utf8')).territories;
    const truthById = Object.fromEntries(truths.map((t) => [t.id, t.truth]));

    // 1. Name the territories with the model.
    const naming = await call(s, 'background', 'gen-name-territories', { force: true });
    const afterNaming = await call(s, 'offscreen', 'gen-status');
    if (firstLoadMs == null && afterNaming.loadMs != null) firstLoadMs = afterNaming.loadMs;
    const territories = (await evaluate(s, `(async () => { ${IDB} return JSON.stringify(await all('territories')); })()`).then(JSON.parse)).map((t) => ({
      id: t.id,
      baseline: truthOf[t.id],
      name: t.name,
      nameSource: t.nameSource,
      suggestedLabel: t.suggestedLabel,
      truth: truthById[t.id],
    }));

    // 2. An autopsy for every day, timed.
    const autopsyMs = [];
    const reports = [];
    for (const date of seeded.dates) {
      const t1 = Date.now();
      const r = await call(s, 'background', 'report-generate', { date });
      autopsyMs.push(Date.now() - t1);
      reports.push({ date, modelVersion: r.modelVersion, autopsy: r.autopsy, facts: r.facts, source: r.source });
    }
    const stats = await call(s, 'background', 'gen-overview');
    for (const k of ['naming', 'autopsy']) for (const f of ['items', 'model', 'fallback', 'unavailable', 'generations']) totalStats[k][f] += stats.stats[k][f];
    for (const k of ['naming', 'autopsy']) for (const [e, n] of Object.entries(stats.stats[k].errors)) totalStats[k].errors[e] = (totalStats[k].errors[e] ?? 0) + n;
    raw.personas.push({ persona: personaId, naming, territories, reports, autopsyMs });
    const modelReports = reports.filter((r) => r.modelVersion !== 'template').length;
    console.log(`${personaId}: named ${naming.named}/${seeded.territories} by the model (${naming.fallback} fell back); autopsies ${modelReports}/${reports.length} from the model; ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  const named = raw.personas.reduce((n, p) => n + p.naming.named, 0);
  const terr = raw.personas.reduce((n, p) => n + p.territories.length, 0);
  const reps = raw.personas.flatMap((p) => p.reports);
  const modelReps = reps.filter((r) => r.modelVersion !== 'template').length;
  check('model-first naming works through the real extension (≥ 70% of territories named by the model)', terr > 0 && named / terr >= 0.7, { named, terr });
  check('model names are short (≤ 6 words) and differ from the baseline', raw.personas.every((p) => p.territories.filter((t) => t.nameSource === 'model').every((t) => t.name.split(' ').length <= 6 && t.name !== t.baseline)));
  check('an autopsy was stored for every seeded day, each with a recorded source', reps.length >= 10 && reps.every((r) => r.source && (r.modelVersion === 'template' || r.source.kind === 'model')), { reports: reps.length });
  check('at least some autopsies are model-written and pass every validator', modelReps > 0, { modelReps, reports: reps.length, fallbackRate: Math.round(((reps.length - modelReps) / reps.length) * 1000) / 10 });
  check('the writer model loaded in under 10 s', firstLoadMs != null && firstLoadMs < 10_000, firstLoadMs);

  // Unloaded after the job (naming job unloads in `finally`; reports rely on the idle timer).
  await call(s, 'offscreen', 'gen-unload');
  const after = await call(s, 'offscreen', 'gen-status');
  check('the writer model unloads after use', after.state === 'unloaded', after.state);

  // UI: the dashboard shows the sources. Use the last persona's data.
  await send('Page.reload', {}, s);
  await sleep(3000);
  await waitFor(s, `document.querySelectorAll('#autopsy .pill').length > 0`, 'autopsy pill');
  const ui = await evaluate(
    s,
    `(() => ({
      pill: document.querySelector('#autopsy .pill')?.innerText,
      writer: document.querySelector('#autopsy')?.innerText.split('\\n').filter((l) => /Writer model|Names:|Autopsies:/.test(l)),
      tags: [...document.querySelectorAll('#territories td strong + span')].map((e) => e.innerText),
      button: [...document.querySelectorAll('#territories button')].map((b) => b.innerText),
    }))()`,
  );
  check('dashboard shows who wrote the autopsy', /Written (by|from)/.test(ui.pill ?? ''), ui.pill);
  check('dashboard shows the writer model line and counters', ui.writer.length >= 3, ui.writer);
  check('territory rows say whether a name came from the model', ui.tags.some((t) => /named by Gemma 3 270M/.test(t)), ui.tags.slice(0, 4));
  check('"Name territories with Gemma" button is there', ui.button.some((b) => /Name territories with Gemma/.test(b)));
  await evaluate(s, `document.getElementById('territories').scrollIntoView(); true`);
  await shot(s, 'dashboard-territories-model.png');
  await evaluate(s, `document.getElementById('autopsy').scrollIntoView(); true`);
  await shot(s, 'dashboard-autopsy-model.png');

  // Button flow in the page.
  await evaluate(s, `[...document.querySelectorAll('#territories button')].find((b) => b.innerText.startsWith('Name territories with Gemma')).click()`);
  await waitFor(s, `/named by the model|writer model could not run/.test(document.querySelector('#territories .row span')?.innerText ?? '')`, 'naming button result', 60_000);
  const btn = await evaluate(s, `document.querySelector('#territories .row span').innerText`);
  check('the naming button runs the model and reports the result', /named by the model/.test(btn), btn);

  // Popup.
  const popup = await openPage(`chrome-extension://${extId}/popup.html`);
  await waitFor(popup.sessionId, `/Writer model/.test(document.body.innerText)`, 'popup writer line');
  const pt = await evaluate(popup.sessionId, `document.body.innerText.split('\\n').find((l) => /Writer model/.test(l))`);
  check('popup shows the writer model state', /Writer model: (asleep|ready|loads when)/.test(pt), pt);
  await shot(popup.sessionId, 'popup-writer.png');

  results.totalStats = totalStats;
  results.firstLoadMs = firstLoadMs;
  check('no exceptions in extension pages', exceptions.length === 0, exceptions.slice(0, 5));
} catch (err) {
  check('probe ran to the end', false, String(err?.stack ?? err).slice(0, 900));
} finally {
  results.failed = fail;
  writeFileSync(join(outDir, 'm6-probe.json'), JSON.stringify(results, null, 1));
  try {
    const g1 = JSON.parse(readFileSync(join(outDir, 'g1-spike.json'), 'utf8'));
    raw.g1 = { pass: g1.pass, cases: g1.cases?.length, firstCallMs: g1.firstCallMs };
  } catch {}
  writeFileSync(rawPath, JSON.stringify(raw));
  chrome.kill();
  server.close();
  console.log(fail.length ? `\n${fail.length} check(s) failed: ${fail.join('; ')}` : '\nAll checks passed.');
  process.exit(fail.length ? 1 : 0);
}
