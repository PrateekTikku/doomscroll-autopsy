/**
 * M7 probe: the release candidate on a fresh Chrome profile. Unzips ../releases/doomscroll-autopsy-<version>.zip
 * into a temp folder, loads it, and checks: the onboarding page opens by itself on install, says what is observed
 * and stored in the honest wording, explains the install warning, lets the user edit the blocklist and pick a
 * sensitivity, starts the model download (state is reported either way; the download needs network), and "done"
 * lands on the dashboard. Then runs the M5 and M4 probes against the same unzipped folder (seeded replay, metrics,
 * forget, wipe, nudges) so the whole checklist is proven on the packaged build.
 * Usage: npm run zip && npm run eval:m5 && npm run probe:m7   (HEADED=1, OUT=dir, SKIP_PROBES=1 to skip m4/m5)
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')).version;
const zip = resolve(here, '../../releases', `doomscroll-autopsy-${version}.zip`);
const outDir = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M7');
mkdirSync(outDir, { recursive: true });
const unzipped = mkdtempSync(join(tmpdir(), 'doomscroll-release-'));
execFileSync('unzip', ['-q', zip, '-d', unzipped]);
const profile = mkdtempSync(join(tmpdir(), 'doomscroll-m7-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(
  chromePath,
  [...(process.env.HEADED ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--window-size=1100,1000', 'about:blank'],
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
const results = { date: new Date().toISOString(), version, zip, checks: {} };
const fail = [];
const check = (name, ok, detail) => {
  results.checks[name] = { ok, detail };
  console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
  if (!ok) fail.push(name);
};
const clickText = (text, selector = 'button') =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`;
const typeInto = (label, value) =>
  `(() => { const el = document.querySelector('[aria-label=${JSON.stringify(label)}]'); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;

try {
  const ext = resolve(unzipped);
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  check('release unzips and loads; version matches', manifest.version === version, { version: manifest.version, extId });
  const files = execFileSync('find', [ext, '-name', '*.onnx*', '-o', '-name', 'ort-wasm*.wasm']).toString();
  check('release carries the writer model and the ORT runtime', /doomscroll-270m/.test(files) && /ort-wasm/.test(files));

  // Onboarding opens by itself on a fresh install.
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    const { result } = await send('Target.getTargets');
    target = result.targetInfos.find((t) => t.url === `chrome-extension://${extId}/onboarding.html`);
    if (!target) await sleep(250);
  }
  check('onboarding opens by itself on install', !!target);
  const { result: att } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const s = att.sessionId;
  await send('Runtime.enable', {}, s);
  await send('Page.enable', {}, s);
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
  await waitFor(s, `document.querySelector('#privacy-claim')`, 'onboarding render');
  const text = await evaluate(s, 'document.body.innerText');
  check('says what is observed and what is stored, with the honest wording', /what it looks at/i.test(text) && /what it keeps/i.test(text) && /never leaves your device/.test(text) && /not anonymous/.test(text) && !/only store anonymous/i.test(text));
  check('explains the install warning', /read and change all your data on all websites/.test(text));
  check('states the limits (WebGPU, size, browser only)', /WebGPU/.test(text) && /Nothing outside it is ever counted or shown/.test(text));
  const OUTSIDE = /\b(off[- ]?screen|away from (the |your )?(keyboard|screen|computer)|time away|while (you were )?away|phone|smartphone|tablet|meetings?|lunch|commut\w*)\b/i;
  check('onboarding never talks about time outside the browser', !OUTSIDE.test(text), OUTSIDE.exec(text)?.[0] ?? null);
  const s0 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1100, height: 1900, scale: 1 } }, s);
  writeFileSync(join(outDir, 'onboarding.png'), Buffer.from(s0.result.data, 'base64'));

  // Blocklist review + sensitivity.
  const before = Number(/(\d+) entries/.exec(await evaluate(s, `document.querySelector('#blocklist').innerText`))?.[1]);
  await evaluate(s, typeInto('Add a site', 'https://www.MyBank.example.com/login?x=1'));
  await evaluate(s, clickText('Add site'));
  await evaluate(s, typeInto('Add a keyword', 'payroll'));
  await evaluate(s, clickText('Add keyword'));
  await sleep(500);
  await evaluate(s, clickText('Strict'));
  await sleep(400);
  const settings = await evaluate(s, `chrome.storage.local.get('settings').then((r) => r.settings)`);
  check('blocklist default list is shown (50+ entries)', before > 50, before);
  check('blocklist edits and sensitivity save from onboarding', settings?.blocklist?.addedDomains?.includes('mybank.example.com') && settings.blocklist.addedKeywords.includes('payroll') && settings.sensitivity === 'strict', settings);

  // Model download: start it and report what happens (needs network to Hugging Face).
  await evaluate(s, clickText('Download and start now'));
  let state = 'not-started';
  const t0 = Date.now();
  let sawProgress = false;
  while (Date.now() - t0 < Number(process.env.DOWNLOAD_WAIT_MS ?? 240000)) {
    const line = await evaluate(s, `document.querySelector('#model-status')?.innerText ?? ''`).catch(() => '');
    state = line;
    if (/Downloading, [1-9]/.test(line)) sawProgress = true;
    if (/^Ready|^Could not start|^Downloaded/.test(line)) break;
    await sleep(1000);
  }
  results.download = { finalLine: state, sawProgress, ms: Date.now() - t0 };
  check('model download starts from onboarding and reaches a clear end state', /^Ready|^Could not start|^Downloaded/.test(state), results.download);
  results.modelReady = /^Ready/.test(state);
  await send('Page.captureScreenshot', { format: 'png' }, s).then((r) => writeFileSync(join(outDir, 'onboarding-model.png'), Buffer.from(r.result.data, 'base64')));

  // Done → dashboard, flag stored.
  await evaluate(s, clickText("I've read this"));
  await waitFor(s, `location.pathname === '/dashboard.html'`, 'dashboard after done');
  const flag = await evaluate(s, `chrome.storage.local.get('onboardedAt').then((r) => typeof r.onboardedAt)`);
  check('done opens the dashboard and remembers it', flag === 'number');
  const popup = await send('Target.createTarget', { url: `chrome-extension://${extId}/popup.html` });
  const { result: pa } = await send('Target.attachToTarget', { targetId: popup.result.targetId, flatten: true });
  await send('Runtime.enable', {}, pa.sessionId);
  await waitFor(pa.sessionId, `[...document.querySelectorAll('a')].some((a) => a.textContent === 'How it works')`, 'popup how-it-works link');
  check('popup links back to the welcome page', true);
  check('no exceptions in extension pages', exceptions.length === 0, exceptions.slice(0, 5));
} catch (err) {
  check('probe ran to the end', false, String(err?.stack ?? err).slice(0, 800));
} finally {
  chrome.kill();
}

if (!process.env.SKIP_PROBES && fail.length === 0) {
  for (const name of ['probe:m5', 'probe:m4']) {
    try {
      execFileSync('npm', ['run', name], { cwd: resolve(here, '..'), env: { ...process.env, EXT: unzipped, OUT: join(outDir, name.replace(':', '-')) }, stdio: 'pipe' });
      check(`${name} passes on the unzipped release`, true);
    } catch (err) {
      check(`${name} passes on the unzipped release`, false, String(err.stdout ?? err).slice(-600));
    }
  }
}
results.failed = fail;
writeFileSync(join(outDir, 'm7-probe.json'), JSON.stringify(results, null, 1));
console.log(fail.length ? `\n${fail.length} check(s) failed: ${fail.join('; ')}` : '\nAll checks passed.');
process.exit(fail.length ? 1 : 0);
