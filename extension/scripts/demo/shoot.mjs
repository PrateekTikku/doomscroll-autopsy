/**
 * Screenshots of the popup and every dashboard tab from the demo profile (headless, read-only use of the data).
 * Refreshes `.demo/chrome-mv3` with the current build first (same path, so the same extension ID and data).
 * Usage: npm run build && node scripts/demo/shoot.mjs   → .demo/shots/*.png
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const demo = resolve(root, '../.demo');
if (!existsSync(join(demo, 'profile'))) throw new Error('No demo profile: run npm run demo:profile first.');
execFileSync('rsync', ['-a', '--delete', resolve(root, '.output/chrome-mv3') + '/', join(demo, 'chrome-mv3') + '/']);
const shots = join(demo, 'shots');
mkdirSync(shots, { recursive: true });
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${join(demo, 'profile')}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const loaded = await send('Extensions.loadUnpacked', { path: join(demo, 'chrome-mv3') });
  const extId = loaded.result.id;
  const pages = [
    ['popup', 'popup.html', 440, 300, false],
    ...['overview', 'territories', 'prediction', 'privacy'].map((t) => [`dash-${t}`, `dashboard.html#${t}`, 1280, 900, true]),
  ];
  for (const [name, url, w, h, full] of pages) {
    const { result: t } = await send('Target.createTarget', { url: `chrome-extension://${extId}/${url}` });
    const { result: a } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    if (process.env.DARK) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, a.sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false }, a.sessionId);
    await sleep(name.includes('territories') ? 9000 : 4500);
    let clip;
    if (full) {
      const m = await send('Page.getLayoutMetrics', {}, a.sessionId);
      const c = m.result.cssContentSize;
      clip = { x: 0, y: 0, width: c.width, height: Math.min(c.height, 3000), scale: 1 };
    } else {
      const r = await send('Runtime.evaluate', { expression: 'document.body.scrollHeight', returnByValue: true }, a.sessionId);
      clip = { x: 0, y: 0, width: w, height: r.result.result.value, scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, a.sessionId);
    writeFileSync(join(shots, `${name}${process.env.DARK ? '-dark' : ''}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log('wrote', name);
    await send('Target.closeTarget', { targetId: t.targetId });
  }
} finally {
  await send('Browser.close').catch(() => undefined);
  await sleep(1500);
  chrome.kill();
}
