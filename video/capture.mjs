// Screenshots from the demo profile for the video: dashboard overview for days whose autopsy was written by the 270M.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const demo = resolve('..', '.demo');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${resolve('.cache/profile')}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const out = chrome.stdio[3], inp = chrome.stdio[4];
let id = 0, buf = ''; const pending = new Map();
inp.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const send = (method, params = {}, sessionId) => new Promise((res) => { const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; pending.set(m.id, res); out.write(JSON.stringify(m) + '\0'); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const { result: { id: extId } } = await send('Extensions.loadUnpacked', { path: join(demo, 'chrome-mv3') });
  const { result: t } = await send('Target.createTarget', { url: `chrome-extension://${extId}/dashboard.html#overview` });
  const { result: a } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = a.sessionId;
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, s);
  await sleep(5000);
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, s)).result.result.value;
  const options = await ev(`[...document.querySelectorAll('select')].map(s => [...s.options].map(o => o.value + '|' + o.text))`);
  console.log(JSON.stringify(options));
  const found = [];
  const n = (await ev(`document.querySelector('select').options.length`)) ?? 0;
  for (let i = 0; i < n && found.length < 4; i++) {
    await ev(`(()=>{const s=document.querySelector('select');s.selectedIndex=${i};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await sleep(2500);
    const info = await ev(`JSON.stringify({gemma: document.body.innerText.includes('Written by Gemma'), day: document.querySelector('select').selectedOptions[0].text, blocks: (document.body.innerText.match(/Deep blocks\\s*\\n?\\s*(\\d+)/)||[])[1]})`);
    console.log(i, info);
    if (JSON.parse(info).gemma) {
      const m = await send('Page.getLayoutMetrics', {}, s);
      const c = m.result.cssContentSize;
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: c.width, height: c.height, scale: 1 } }, s);
      writeFileSync(`assets/raw/overview-day${i}.png`, Buffer.from(shot.result.data, 'base64'));
      found.push(i);
    }
  }
  console.log('captured', found);
} finally { await send('Browser.close').catch(() => {}); await sleep(1500); chrome.kill(); }
