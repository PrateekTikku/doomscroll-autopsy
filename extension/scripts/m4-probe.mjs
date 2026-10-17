/**
 * M4 probe: loads .output/chrome-mv3 into a throwaway headless Chrome and checks, offline (local
 * pages only):
 *   N1  the banner and the blur render and respond on a strict-CSP page and a plain page, are the
 *       topmost element, and leave the page's own DOM alone;
 *   a nudge is refused on a paused page and never reaches a blocklisted page;
 *   demo mode: Start demo in the dashboard plays the prepared day at 120x and a banner, then a blur,
 *       appear on the page in front, with the Replay flag set for the popup;
 *   the dashboard "Evaluate on my data" button works on near-empty data.
 * Usage: npm run build && npm run probe:m4   (HEADED=1 shows the browser; OUT=dir for screenshots)
 * Writes ../docs/showcase/M4/m4-probe.json and the screenshots next to it.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = process.env.EXT ? resolve(process.env.EXT) : resolve(here, '../.output/chrome-mv3');
const outDir = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M4');
mkdirSync(outDir, { recursive: true });

const BODY = (title) =>
  `<!doctype html><meta charset=utf-8><title>${title}</title><body><main><h1>${title}</h1>${Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i + 1}. The quick brown fox jumps over the lazy dog while the page pretends to be a long article that somebody is reading attentively.</p>`).join('')}</main>`;
const server = createServer((req, res) => {
  const headers = { 'content-type': 'text/html' };
  if (req.url === '/strict') headers['content-security-policy'] = "default-src 'none'; style-src 'none'; script-src 'none'; img-src 'none'";
  res.writeHead(200, headers);
  res.end(BODY(req.url));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-m4-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(
  chromePath,
  [...(process.env.HEADED ? [] : ['--headless=new']), `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);
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
async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
}
async function openPage(url) {
  const { result } = await send('Target.createTarget', { url });
  const { result: att } = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  await send('Runtime.enable', {}, att.sessionId);
  await send('Page.enable', {}, att.sessionId);
  return { targetId: result.targetId, sessionId: att.sessionId };
}
async function shot(sessionId, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
}
const results = { date: new Date().toISOString(), checks: {} };
const fail = [];
const check = (name, ok, detail) => {
  results.checks[name] = { ok, detail };
  console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail));
  if (!ok) fail.push(name);
};

const HOST = 'doomscroll-autopsy-nudge';
const hostState = (s) =>
  evaluate(
    s,
    `(() => { const h = document.getElementById('${HOST}'); if (!h) return { present: false }; const r = h.shadowRoot; const top = document.elementFromPoint(innerWidth - 80, 60); const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { present: true, shadowClosed: r === null, topAtBanner: top === h, topAtCenter: mid === h, bodyChildren: document.body.children.length, rootChildren: document.documentElement.children.length }; })()`,
  );

// The nudge lives in a closed shadow root: read it and click inside it through CDP (DOM with pierce).
async function nudgeNodes(sessionId) {
  const { result } = await send('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
  const found = { buttons: [], texts: [] };
  const walk = (n, inside) => {
    const here = inside || (n.attributes && n.attributes.includes(HOST));
    if (here && n.nodeName === 'BUTTON') found.buttons.push(n);
    if (here && n.nodeType === 3 && n.nodeValue.trim()) found.texts.push(n.nodeValue.trim());
    for (const c of [...(n.shadowRoots ?? []), ...(n.children ?? [])]) walk(c, here);
  };
  walk(result.root, false);
  const label = (n) => (n.children ?? []).map((c) => c.nodeValue ?? '').join('').trim();
  return { texts: found.texts, buttons: found.buttons.map((b) => ({ nodeId: b.nodeId, text: label(b) })) };
}
async function clickNudgeButton(sessionId, text) {
  const { buttons } = await nudgeNodes(sessionId);
  const b = buttons.find((x) => x.text === text);
  if (!b) return false;
  const { result } = await send('DOM.getBoxModel', { nodeId: b.nodeId }, sessionId);
  const q = result.model.content;
  const x = (q[0] + q[2]) / 2;
  const y = (q[1] + q[5]) / 2;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
  return true;
}
const payload = (step, replay = false, extra = {}) => ({
  id: null, step, replay,
  title: step === 1 ? 'A moment' : 'Still here?',
  body: "You've spent 16 minutes in youtube.com · shorts today, past your 15 minutes. Back to deep work?",
  primary: 'Back to it', secondary: step === 1 ? '5 more min' : 'Keep going', ...extra,
});

try {
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const controlPage = await openPage(`chrome-extension://${extId}/dashboard.html#all`);
  const control = controlPage.sessionId;
  results.controlTarget = controlPage.targetId;
  await sleep(1500);
  const setSettings = (patch) =>
    evaluate(control, `(async () => { const cur = (await chrome.storage.local.get('settings')).settings ?? {}; await chrome.storage.local.set({ settings: { ...cur, ...${JSON.stringify(patch)} } }); return true; })()`);
  await setSettings({ blocklist: { addedDomains: ['localhost'], removedDomains: [], addedKeywords: [] } });
  await sleep(1500);

  // Tab ids by url, sent from the dashboard page (an extension page with `tabs`).
  const tabIdFor = (path) => evaluate(control, `chrome.tabs.query({}).then((t) => t.find((x) => x.url === '${base}${path}')?.id ?? null)`);
  const nudge = (tabId, p) =>
    evaluate(control, `chrome.tabs.sendMessage(${tabId}, { target: 'content', type: 'nudge-show', payload: ${JSON.stringify(p)} }).then((r) => JSON.stringify(r)).catch((e) => 'ERR:' + e.message)`);

  // ---- N1: strict CSP and plain pages ----
  const targets = [['strict-csp', '/strict'], ['plain', '/plain']];
  for (const [name, path] of targets) {
    const page = await openPage(base + path);
    await send('Page.bringToFront', {}, page.sessionId);
    await sleep(3500);
    const tabId = await tabIdFor(path);
    const before = await evaluate(page.sessionId, 'document.body.innerHTML.length');
    const r1 = await nudge(tabId, payload(1));
    await sleep(400);
    const b = await hostState(page.sessionId);
    check(`${name}: banner shown`, r1 === '{"ok":true,"data":{"shown":true}}' && b.present && b.shadowClosed && b.topAtBanner, { reply: r1, ...b });
    await shot(page.sessionId, `nudge-banner-${name}.png`);
    // Escape answers the banner (snooze) and removes it.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page.sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page.sessionId);
    await sleep(300);
    check(`${name}: Escape dismisses the banner`, !(await hostState(page.sessionId)).present);
    const r2 = await nudge(tabId, payload(2));
    await sleep(400);
    const v = await hostState(page.sessionId);
    check(`${name}: blur shown, topmost at the centre`, r2.includes('"shown":true') && v.present && v.topAtCenter, v);
    await shot(page.sessionId, `nudge-blur-${name}.png`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page.sessionId);
    await sleep(300);
    const after = await evaluate(page.sessionId, 'document.body.innerHTML.length');
    check(`${name}: page DOM unchanged by a nudge`, before === after && !(await hostState(page.sessionId)).present, { before, after });
    if (name === 'plain') results.plainTab = { path, tabId, session: page.sessionId };
    if (name === 'strict-csp') await send('Target.closeTarget', { targetId: page.targetId });
  }

  // ---- N1 on real sites (REAL=1; needs network) ----
  if (process.env.REAL) {
    for (const [name, url] of [['github.com (strict CSP)', 'https://github.com/anthropics/anthropic-sdk-python'], ['YouTube Shorts', 'https://www.youtube.com/shorts']]) {
      const page = await openPage(url);
      await send('Page.bringToFront', {}, page.sessionId);
      await sleep(7000);
      const tabId = await evaluate(control, `chrome.tabs.query({}).then((t) => t.find((x) => x.url.startsWith('${url.slice(0, 30)}'))?.id ?? null)`);
      let r1 = '';
      let b = { present: false };
      for (let attempt = 0; attempt < 6 && !b.present; attempt++) {
        r1 = await nudge(tabId, payload(1)); // the observer may still be starting on a slow page
        await sleep(1500);
        b = await hostState(page.sessionId);
      }
      await shot(page.sessionId, `nudge-banner-${name.split(' ')[0]}.png`);
      const r2 = await nudge(tabId, payload(2));
      await sleep(500);
      const v = await hostState(page.sessionId);
      await shot(page.sessionId, `nudge-blur-${name.split(' ')[0]}.png`);
      check(`${name}: banner and blur are shown and topmost`, r1.includes('"shown":true') && b.topAtBanner && r2.includes('"shown":true') && v.topAtCenter, { b, v });
      await send('Target.closeTarget', { targetId: page.targetId });
    }
  }

  // ---- M8: breathing pause (step 3) and the "Take a breath" button on step 2 ----
  {
    const tabId = results.plainTab.tabId;
    const sess = results.plainTab.session;
    await send('Page.bringToFront', {}, sess);
    // Step 2 with the breathing option: a third button opens the pause.
    const r2 = await nudge(tabId, payload(2, false, { offerBreath: true }));
    await sleep(500);
    let nodes = await nudgeNodes(sess);
    check('step 2 offers "Take a breath" when the user allows step 3', r2.includes('"shown":true') && nodes.buttons.some((b) => b.text === 'Take a breath'), nodes.buttons.map((b) => b.text));
    const without = await nudge(tabId, payload(2));
    await sleep(500);
    nodes = await nudgeNodes(sess);
    check('step 2 has no breathing button when step 3 is not allowed', !nodes.buttons.some((b) => b.text === 'Take a breath'), nodes.buttons.map((b) => b.text));
    await nudge(tabId, payload(2, false, { offerBreath: true }));
    await sleep(400);
    await clickNudgeButton(sess, 'Take a breath');
    await sleep(900);
    nodes = await nudgeNodes(sess);
    check('"Take a breath" opens the breathing overlay with a countdown and a Skip button', nodes.texts.some((t) => /^Breathe in/.test(t)) && nodes.buttons.some((b) => b.text === 'Skip'), nodes);
    await shot(sess, 'nudge-breathing.png');
    await clickNudgeButton(sess, 'Skip');
    await sleep(400);
    check('Skip ends the pause and removes the overlay', !(await hostState(sess)).present);

    // Step 3 straight from the ladder: runs the full 30 s, then asks.
    const r3 = await nudge(tabId, payload(3));
    await sleep(600);
    const mid = await hostState(sess);
    nodes = await nudgeNodes(sess);
    check('step 3 opens the breathing pause in front of the page', r3.includes('"shown":true') && mid.present && mid.topAtCenter && nodes.texts.some((t) => /^Breathe/.test(t)), { mid, texts: nodes.texts });
    await sleep(31000);
    nodes = await nudgeNodes(sess);
    check('after 30 s the pause ends and asks Back to it / Keep going', nodes.texts.some((t) => /^Done\./.test(t)) && nodes.buttons.some((b) => b.text === 'Back to it') && nodes.buttons.some((b) => b.text === 'Keep going'), { texts: nodes.texts, buttons: nodes.buttons.map((b) => b.text) });
    await clickNudgeButton(sess, 'Back to it');
    await sleep(400);
    check('answering after the pause removes the overlay', !(await hostState(sess)).present);
  }

  // ---- Paused: refused ----
  {
    const tabId = results.plainTab.tabId;
    await setSettings({ pausedUntil: 'forever' });
    await sleep(1000);
    const r = await nudge(tabId, payload(1));
    check('paused page refuses a nudge', r.includes('"shown":false'), r);
    await setSettings({ pausedUntil: null });
    await sleep(1000);
  }

  // ---- Blocklisted: no listener at all ----
  {
    const page = await openPage(`http://localhost:${port}/blocked`);
    await send('Page.bringToFront', {}, page.sessionId);
    await sleep(3000);
    const tabId = await evaluate(control, `chrome.tabs.query({}).then((t) => t.find((x) => x.url === 'http://localhost:${port}/blocked')?.id ?? null)`);
    const r = await nudge(tabId, payload(1));
    check('blocklisted page never receives a nudge', r.startsWith('ERR:') || r.includes('"shown":false'), r);
    await send('Target.closeTarget', { targetId: page.targetId });
  }

  // ---- Dashboard: evaluate on (near-empty) data, mode line ----
  {
    await sleep(2500);
    const text = await evaluate(control, `document.body.innerText`);
    check('dashboard shows the prediction panel and the active mode', /Prediction and replay/i.test(text) && /Active mode:\s*Rules/.test(text), text.split('\n').filter((l) => /Active mode|Prediction/.test(l)));
    await evaluate(control, `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Evaluate on my data')).click()`);
    await sleep(1500);
    const t2 = await evaluate(control, `document.body.innerText`);
    check('Evaluate on my data runs without an error on little data', /not enough data|Rules \(baseline\)/.test(t2), t2.split('\n').find((l) => /enough data|trained/.test(l)));
  }

  // ---- Demo mode on the plain page ----
  {
    const page = results.plainTab;
    // A user starts the demo from the visible dashboard, then switches to the page. Hidden tabs that have
    // been hidden for 5+ minutes get intensive timer throttling, which would stall the replay clock.
    await send('Target.activateTarget', { targetId: results.controlTarget });
    await sleep(500);
    await evaluate(control, `(() => { const sel = document.querySelector('#prediction select'); sel.value = '120'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(300);
    await evaluate(control, `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start demo')).click()`);
    await send('Page.bringToFront', {}, page.session);
    const t0 = Date.now();
    const seen = [];
    let flagSeen = false;
    let lastKey = '';
    while (Date.now() - t0 < 60_000) {
      await sleep(1000);
      const s = await hostState(page.session);
      const key = s.present ? (s.topAtCenter ? 'blur' : 'banner') : 'none';
      if (key !== lastKey) {
        seen.push({ atS: Math.round((Date.now() - t0) / 100) / 10, shows: key });
        if (key === 'banner') await shot(page.session, 'demo-banner.png');
        if (key === 'blur') await shot(page.session, 'demo-blur.png');
        lastKey = key;
      }
      flagSeen ||= (await evaluate(control, `chrome.storage.session.get('replay-active').then((r) => r['replay-active'] === true)`)) === true;
      if (seen.some((x) => x.shows === 'blur') && Date.now() - t0 > 42_000) break;
    }
    results.demoPanel = await evaluate(control, `[...document.querySelectorAll('span.warn, .warn')].map((e) => e.textContent)`);
    const log = await evaluate(control, `[...document.querySelectorAll('li')].map((l) => l.textContent).filter((t) => /replay time/.test(t))`);
    const order = seen.map((x) => x.shows).filter((x) => x !== 'none');
    check('demo: banner then blur appear on the page in front', order[0] === 'banner' && order.includes('blur'), { seen, log });
    check('demo: Replay flag is set for the popup while it runs', flagSeen);
  }

  writeFileSync(join(outDir, 'm4-probe.json'), JSON.stringify({ ...results, plainTab: undefined, controlTarget: undefined }, null, 2) + '\n');
  console.log('wrote', join(outDir, 'm4-probe.json'));
  process.exitCode = fail.length ? 1 : 0;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
