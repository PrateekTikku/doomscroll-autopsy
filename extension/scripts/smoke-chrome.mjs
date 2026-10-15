/**
 * Headless smoke test: loads .output/chrome-mv3 into a throwaway Chrome profile over the DevTools
 * pipe, opens the extension pages and prints what they render plus any exceptions.
 * Usage: npm run build && npm run smoke   (CHROME_PATH overrides the macOS Chrome location)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = resolve(dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'doomscroll-smoke-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(chromePath, [
  '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

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

try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  console.log('extension id:', extId);
  for (const page of ['popup.html', 'dashboard.html', 'onboarding.html']) {
    const { result: { targetId } } = await send('Target.createTarget', { url: `chrome-extension://${extId}/${page}` });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await sleep(2500);
    const r = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }, sessionId);
    console.log(`--- ${page}:\n${r.result?.result?.value}`);
  }
  const { result: { targetInfos } } = await send('Target.getTargets');
  console.log('--- targets:');
  for (const t of targetInfos) if (t.url.startsWith(`chrome-extension://${extId}/`)) console.log(`${t.type}\t${t.url}`);
  const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  console.log('--- page exceptions/console errors:', exceptions.length);
  for (const e of exceptions) console.log(JSON.stringify(e.params).slice(0, 300));
  process.exitCode = exceptions.length ? 1 : 0;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.kill();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}
