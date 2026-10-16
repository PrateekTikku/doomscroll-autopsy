/**
 * Loads an ONNX export into Transformers.js on WebGPU in headless Chrome and generates for a few
 * eval prompts.   node onnx_test/run.mjs <model_dir> [cases.json] [out.json]
 * Env: DTYPE (default q4f16), DEVICE (default webgpu), HEADED=1, CHROME_PATH
 * Serves: / (index.html), /vendor/* (Transformers.js + ORT wasm from extension/node_modules), /model/* (model dir).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nm = resolve(here, '../../extension/node_modules');
const modelDir = resolve(process.argv[2] ?? '');
const casesPath = resolve(process.argv[3] ?? join(here, 'cases.json'));
const outPath = process.argv[4] ? resolve(process.argv[4]) : null;
if (!existsSync(modelDir)) { console.error('model dir not found'); process.exit(2); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.onnx': 'application/octet-stream' };
const route = (url) => {
  const p = decodeURIComponent(url.split('?')[0]);
  if (p === '/' || p === '/index.html') return join(here, 'index.html');
  if (p === '/cases.json') return casesPath;
  if (p === '/vendor/transformers.web.js') return join(nm, '@huggingface/transformers/dist/transformers.web.js');
  if (p.startsWith('/vendor/common/')) return join(nm, 'onnxruntime-common/dist/esm', p.slice('/vendor/common/'.length));
  if (p.startsWith('/vendor/ort/')) return join(nm, 'onnxruntime-web/dist', p.slice('/vendor/ort/'.length));
  if (p.startsWith('/model/')) return join(modelDir, p.slice('/model/'.length));
  return null;
};
const server = createServer((req, res) => {
  const f = route(req.url);
  if (!f || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream', 'content-length': statSync(f).size });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-t2-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = [`--user-data-dir=${profile}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', 'about:blank'];
if (!process.env.HEADED) args.unshift('--headless=new');
const chrome = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const out = chrome.stdio[3], inp = chrome.stdio[4];
let id = 0, buf = '';
const pending = new Map(), events = [];
inp.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg);
  }
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, res); out.write(JSON.stringify(m) + '\0');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 1;
try {
  const dtype = process.env.DTYPE ?? 'q4f16', device = process.env.DEVICE ?? 'webgpu';
  const { result: { targetId } } = await send('Target.createTarget', { url: `http://127.0.0.1:${port}/?dtype=${dtype}&device=${device}` });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const deadline = Date.now() + Number(process.env.TIMEOUT_MIN ?? 15) * 60_000;
  let value = null, lastLog = null;
  while (Date.now() < deadline) {
    await sleep(2000);
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__result ?? null)', returnByValue: true }, sessionId);
    value = r.result?.result?.value;
    if (value && value !== 'null') break;
    const l = await send('Runtime.evaluate', { expression: "document.getElementById('log')?.textContent", returnByValue: true }, sessionId);
    const txt = l.result?.result?.value;
    for (const e of events.splice(0)) if (e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')) { console.error('[console]', JSON.stringify(e.params).slice(0, 400)); }
    if (txt !== lastLog) { lastLog = txt; console.error(`[page] ${String(txt).split('\n').slice(-2).join(' | ')}`); }
  }
  const result = value && value !== 'null' ? JSON.parse(value) : { error: 'timeout' };
  const errs = []; void events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => JSON.stringify(e.params).slice(0, 300));
  if (errs.length) result.pageExceptions = errs;
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  code = result.error ? 1 : 0;
} catch (e) { console.error(e); }
chrome.kill(); server.close();
process.exit(code);
