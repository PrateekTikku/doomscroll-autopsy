/**
 * Spike S2 / S3 probe: loads the spike build into a throwaway Chrome profile, opens the harness page
 * (entrypoints/spike) and prints its result JSON plus process RSS. Usage:
 *   npm run build:spike && npm run probe:s2
 * Env: DTYPE=q4f16|q4|q8|fp16, DEVICE=webgpu|wasm, VISION=0|1, S3=1, HEADED=1, TEXTS=n, IMAGES=n,
 *      CHROME_PATH, OUT=path (write JSON there)
 */
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = resolve(dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'doomscroll-s2-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = [
  `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu', 'about:blank',
];
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else events.push(msg);
  }
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId;
  pending.set(m.id, res); out.write(JSON.stringify(m) + '\0');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rssMB() {
  const rows = execSync('ps -A -o pid=,ppid=,rss=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Set([chrome.pid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [pid, ppid] of rows) if (kids.has(ppid) && !kids.has(pid)) { kids.add(pid); changed = true; }
  }
  return Math.round(rows.filter(([pid]) => kids.has(pid)).reduce((s, r) => s + r[2], 0) / 1024);
}

try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const qs = new URLSearchParams({
    dtype: process.env.DTYPE ?? 'q4f16', device: process.env.DEVICE ?? 'webgpu', vision: process.env.VISION ?? '1',
    s3: process.env.S3 ?? '0', texts: process.env.TEXTS ?? '40', images: process.env.IMAGES ?? '10',
  });
  const rssBefore = rssMB();
  const { result: { targetId } } = await send('Target.createTarget', { url: `chrome-extension://${extId}/spike.html?${qs}` });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const deadline = Date.now() + 30 * 60_000;
  let result = null, peak = 0;
  while (Date.now() < deadline) {
    await sleep(3000);
    peak = Math.max(peak, rssMB());
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__result)', returnByValue: true }, sessionId);
    result = JSON.parse(r.result?.result?.value ?? 'null');
    if (result?.done || result?.error) break;
  }
  const final = { ...result, rssBeforeMB: rssBefore, rssPeakMB: peak, rssAfterMB: rssMB() };
  console.log(JSON.stringify(final, null, 2));
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(final, null, 2));
  process.exitCode = result?.done ? 0 : 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.kill();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}
