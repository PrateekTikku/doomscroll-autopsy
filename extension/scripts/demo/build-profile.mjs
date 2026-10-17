/**
 * Builds the demo profile: a separate Chrome user-data-dir (`.demo/profile`, git-ignored) whose copy of the
 * extension (`.demo/chrome-mv3`) holds two weeks of browsing built from the owner's own history
 * (`npm run demo:seed` → `.output/demo-seed.json`). Everything after the raw records is the real extension:
 * EmbeddingGemma 2 embeds what each page is about, k-means makes the territories, the 270M names them, topic tags,
 * labels, the model writes the autopsies, the GRU trains and Markov is trained.
 * Usage: npm run build && npm run demo:seed && npm run demo:profile        (HEADED=1 to watch)
 * Open it afterwards with `npm run demo:open`.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const demo = resolve(root, '../.demo');
const extDir = join(demo, 'chrome-mv3');
const profile = join(demo, 'profile');
const seedPath = resolve(root, '.output/demo-seed.json');
const content = JSON.parse(readFileSync(resolve(here, 'content.json'), 'utf8'));
if (!existsSync(seedPath)) throw new Error('Run `npm run demo:seed` first.');
if (!existsSync(resolve(root, '.output/chrome-mv3/manifest.json'))) throw new Error('Run `npm run build` first.');

// A fresh copy of the build and a fresh profile every time: the demo data must be reproducible.
rmSync(demo, { recursive: true, force: true });
mkdirSync(demo, { recursive: true });
cpSync(resolve(root, '.output/chrome-mv3'), extDir, { recursive: true });

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(req.url === '/content.json' ? JSON.stringify(content) : readFileSync(seedPath));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(chromePath, [...(process.env.HEADED ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--window-size=1280,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const out = chrome.stdio[3];
const inp = chrome.stdio[4];
let id = 0;
let buf = '';
const pending = new Map();
inp.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
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
async function evaluate(sessionId, expression, timeoutMs = 600000) {
  const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId), sleep(timeoutMs).then(() => ({ result: { exceptionDetails: { text: 'timeout' } } }))]);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 700));
  return r.result?.result?.value;
}
const step = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const msg = (type, payload, target = 'background') => `chrome.runtime.sendMessage({ target: ${JSON.stringify(target)}, type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload)} }).then((r) => { if (r && r.ok === false) throw new Error(JSON.stringify(r.error)); return r?.data ?? r; })`;
const IDB = `
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = async (store) => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
`;

let ok = false;
try {
  const loaded = await send('Extensions.loadUnpacked', { path: extDir });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  step(`extension ${extId} loaded from ${extDir}`);
  const { result: t } = await send('Target.createTarget', { url: `chrome-extension://${extId}/dashboard.html` });
  const { result: a } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = a.sessionId;
  await send('Runtime.enable', {}, s);
  await sleep(3000);

  // Settings: titles are never stored in the demo profile; onboarding counts as done.
  await evaluate(s, `(async () => { const cur = (await chrome.storage.local.get('settings')).settings ?? {}; await chrome.storage.local.set({ settings: { ...cur, storeTitles: false }, onboardedAt: Date.now() - 15 * 86400000 }); return true; })()`);

  step('embedding what each kind of page is about (EmbeddingGemma 2, real model; first run downloads it)');
  const phraseCount = await evaluate(s, `(async () => {
    const pools = await (await fetch('${base}/content.json')).json();
    const embed = (text) => chrome.runtime.sendMessage({ target: 'offscreen', type: 'embed', payload: { text, image: null } }).then((r) => (r.data ?? r).vector);
    // ensure the offscreen document exists
    await chrome.runtime.sendMessage({ target: 'background', type: 'ping-offscreen', payload: undefined });
    const out = {}; let n = 0;
    for (const [pool, phrases] of Object.entries(pools)) {
      out[pool] = [];
      for (const p of phrases) {
        let v = null;
        for (let attempt = 0; attempt < 120 && !v; attempt++) { try { v = await embed(p); } catch { v = null; } if (!v) await new Promise((r) => setTimeout(r, 1000)); }
        if (!v) throw new Error('embedding failed for: ' + p);
        const c = Float32Array.from(v).slice(0, 256); let nrm = 0; for (const x of c) nrm += x * x; nrm = Math.sqrt(nrm);
        out[pool].push(Array.from(c, (x) => x / nrm)); n++;
      }
    }
    window.__phraseVectors = out;
    return n;
  })()`);
  step(`${phraseCount} phrase vectors ready`);

  step('writing items, bins and nudges');
  const written = await evaluate(s, `(async () => { ${IDB}
    const seed = await (await fetch('${base}/seed.json')).json();
    const pools = window.__phraseVectors;
    let a = 12345; const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
    const db = await idb();
    const put = (store, rows) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); for (const r of rows) tx.objectStore(store).put(r); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const labels = {};
    let withVec = 0;
    const rows = seed.samples.map((x) => {
      let vector = null;
      if (rnd() > 0.07) {
        const pool = pools[x.content] ?? pools.search;
        // A page is about a mix of the pool's topics: blend two phrases so a pool forms a connected cloud, not islands.
        const pick = [0, 1].map(() => pool[Math.floor(rnd() * pool.length)]);
        const w = pick.map(() => -Math.log(Math.max(rnd(), 1e-9))); const ws = w.reduce((p, q) => p + q, 0);
        const v = Float32Array.from(pick[0], (_, i) => (pick[0][i] * w[0] + pick[1][i] * w[1]) / ws + (0.3 / 16) * gauss());
        let n = 0; for (const c of v) n += c * c; n = Math.sqrt(n); for (let i = 0; i < v.length; i++) v[i] /= n;
        vector = v; withVec++;
      }
      labels[x.ts + '|' + x.path] = ({ build: 'deep', learn: 'deep', assistant: 'deep', writing: 'deep', web: 'shallow', comms: 'shallow', feed: 'drain', threads: 'drain', stream: 'drain' })[x.content] ?? x.routeLabel;
      const { content, routeLabel, ...rec } = x;
      return { ...rec, vector };
    });
    for (let i = 0; i < rows.length; i += 1500) await put('samples', rows.slice(i, i + 1500));
    for (let i = 0; i < seed.bins.length; i += 3000) await put('bins', seed.bins.slice(i, i + 3000));
    await put('nudges', seed.nudges);
    window.__routeLabels = labels;
    return { samples: rows.length, withVec, bins: seed.bins.length, nudges: seed.nudges.length, window: seed.window, perDay: seed.perDay };
  })()`);
  step(`wrote ${JSON.stringify({ ...written, perDay: undefined })}`);
  writeFileSync(join(demo, 'seed-summary.json'), JSON.stringify(written, null, 1));

  step('clustering the vectors into territories (real k-means)');
  const cl = await evaluate(s, `${msg('territories-recluster', { force: true })}`);
  step(`territories: ${JSON.stringify({ ok: cl.ok, k: cl.k, territories: cl.territories, silhouette: cl.silhouette })}`);
  if (!cl.ok) throw new Error('recluster failed: ' + JSON.stringify(cl));
  await evaluate(s, `${msg('territories-sync', undefined)}`);

  step('topic tags (embedded once), then naming with the fine-tuned 270M');
  const tags = await evaluate(s, `${msg('topics-refresh', undefined)}`);
  step(`tags: ${JSON.stringify(tags)}`);
  const naming = await evaluate(s, `${msg('gen-name-territories', { force: true })}`);
  step(`naming: ${naming.named} named by the model, ${naming.fallback} baseline, ${naming.skipped} skipped`);

  step('confirming labels the way the owner would: what a territory is about decides (two small territories stay as suggestions)');
  const conf = await evaluate(s, `(async () => { ${IDB}
    const labels = window.__routeLabels;
    const samples = await all('samples');
    const votes = {};
    for (const x of samples) { if (!x.territoryId) continue; const l = labels[x.ts + '|' + x.path]; if (!l) continue; ((votes[x.territoryId] ??= {})[l] = (votes[x.territoryId][l] ?? 0) + 1); }
    const terr = await all('territories');
    terr.sort((p, q) => q.size - p.size);
    const db = await idb();
    const keepOpen = new Set(terr.filter((t) => t.size > 0).slice(-2).map((t) => t.id));
    const report = [];
    await new Promise((res, rej) => {
      const tx = db.transaction('territories', 'readwrite');
      for (const t of terr) {
        const v = votes[t.id] ?? {};
        const best = Object.entries(v).sort((p, q) => q[1] - p[1])[0]?.[0] ?? t.suggestedLabel ?? 'shallow';
        const open = keepOpen.has(t.id);
        tx.objectStore('territories').put({ ...t, label: open ? null : best, labelConfirmed: !open, allowanceMin: best === 'drain' ? 15 : t.allowanceMin });
        report.push({ name: t.name, size: t.size, truth: best, suggested: t.suggestedLabel, confirmed: !open, tags: (t.topicTags ?? []).map((x) => x.tag).join(', ') });
      }
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return report;
  })()`);
  writeFileSync(join(demo, 'territories.json'), JSON.stringify(conf, null, 1));
  for (const r of conf) step(`  ${r.name} [${r.size}] ${r.confirmed ? r.truth : 'suggested ' + r.suggested} · ${r.tags}`);
  await evaluate(s, `${msg('territories-sync', undefined)}`);

  step('training the GRU and Markov, then writing every day\'s autopsy with the model');
  const gru = await evaluate(s, `${msg('gru-run', undefined)}`);
  step(`GRU: ${gru ? gru.reason : 'not trained'}`);
  const dates = written.perDay.map((d) => d.date);
  for (const date of dates) {
    const r = await evaluate(s, `${msg('report-generate', { date })}`);
    step(`  ${date}: ${r?.source?.kind ?? '?'} · deep blocks ${r?.facts?.deepBlocks?.count ?? '?'}`);
  }

  const summary = await evaluate(s, `(async () => { ${IDB}
    const out = {}; for (const n of ['samples', 'bins', 'territories', 'nudges', 'reports', 'models']) out[n] = (await all(n)).length;
    const reps = await all('reports'); out.reportSources = reps.map((r) => r.source?.kind ?? 'template');
    const mode = (await all('models')).find((m) => m.name === 'prediction-mode')?.data;
    out.mode = mode?.mode; return out; })()`);
  writeFileSync(join(demo, 'summary.json'), JSON.stringify(summary, null, 1));
  step(`done: ${JSON.stringify(summary)}`);
  for (const [name, view] of [['today', 'dashboard.html'], ['popup', 'popup.html']]) {
    const { result: tt } = await send('Target.createTarget', { url: `chrome-extension://${extId}/${view}` });
    const { result: aa } = await send('Target.attachToTarget', { targetId: tt.targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false }, aa.sessionId);
    await sleep(4000);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: name === 'today' }, aa.sessionId);
    writeFileSync(join(demo, `${name}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  ok = true;
} catch (err) {
  console.error('FAILED:', err);
} finally {
  await send('Browser.close').catch(() => undefined);
  await sleep(2500);
  chrome.kill();
  server.close();
}
console.log(ok ? `\nDemo profile ready at ${demo}. Open it with: npm run demo:open` : '\nDemo profile build failed.');
process.exit(ok ? 0 : 1);
