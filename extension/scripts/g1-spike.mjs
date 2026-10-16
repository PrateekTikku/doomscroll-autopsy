/**
 * M6 spike G1: does the bundled fine-tuned 270M load and generate inside the extension's offscreen
 * document (local chrome-extension:// files, fp16 on WebGPU), and does it reproduce T2's browser
 * output byte for byte? Usage: npm run build && node scripts/g1-spike.mjs [N=5]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, '../.output/chrome-mv3');
const cases = JSON.parse(readFileSync(resolve(here, '../../training/data/runs/run1/cases_eval.json'), 'utf8'));
const RUN = process.env.RUN ?? 'run3'; // the run whose export is bundled (see scripts/copy-model.mjs)
const t2 = JSON.parse(readFileSync(resolve(here, `../../training/data/runs/${RUN}/browser_eval${RUN === 'run1' ? '_final' : ''}.json`), 'utf8'));
const N = Number(process.argv[2] ?? 5);
// the first N naming and the first N autopsy cases
const pick = [...cases.filter((c) => c.id.startsWith('naming')).slice(0, N), ...cases.filter((c) => c.id.startsWith('autopsy')).slice(0, N)];

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-g1-'));
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--enable-unsafe-webgpu', '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
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
const send = (method, params = {}, sessionId) => new Promise((res) => { const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; pending.set(m.id, res); out.write(JSON.stringify(m) + '\0'); });
const ev = async (s, expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
let code = 1;
const result = { cases: [] };
try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  const extId = loaded.result.id;
  const { result: t } = await send('Target.createTarget', { url: `chrome-extension://${extId}/dashboard.html` });
  const { result: att } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = att.sessionId;
  await send('Runtime.enable', {}, s);
  await new Promise((r) => setTimeout(r, 2000));
  console.log('offscreen:', await ev(s, `chrome.runtime.sendMessage({ target: 'background', type: 'ping-offscreen' }).then((r) => JSON.stringify(r))`));
  const gen = (c) => ev(s, `chrome.runtime.sendMessage({ target: 'offscreen', type: 'generate', payload: ${JSON.stringify({ prompt: c.prompt, maxNewTokens: c.maxNew, sample: false })} }).then((r) => JSON.stringify(r))`);
  let first = true;
  for (const c of pick) {
    const t0 = Date.now();
    const raw = JSON.parse(await gen(c));
    const ref = t2.runs.find((r) => r.id === c.id);
    const row = { id: c.id, ok: raw.ok, same: raw.ok && raw.data.text === ref.text, newTokens: raw.data?.newTokens, refTokens: ref.newTokens, ms: raw.data?.ms && Math.round(raw.data.ms), wallMs: Date.now() - t0, error: raw.error };
    if (first) { result.firstCallMs = Date.now() - t0; first = false; }
    if (raw.ok && !row.same) row.got = raw.data.text.slice(0, 200), row.want = ref.text.slice(0, 200);
    result.cases.push(row);
    console.log(JSON.stringify(row));
  }
  console.log('status:', await ev(s, `chrome.runtime.sendMessage({ target: 'offscreen', type: 'gen-status' }).then((r) => JSON.stringify(r))`));
  result.pass = result.cases.every((r) => r.ok && r.same);
  code = result.pass ? 0 : 1;
  console.log(result.pass ? 'G1 PASS' : 'G1 FAIL');
} catch (e) { console.error(e); }
writeFileSync(join(here, '../../docs/showcase/M6/g1-spike.json'), JSON.stringify(result, null, 1));
chrome.kill();
process.exit(code);
