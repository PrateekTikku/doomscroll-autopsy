/**
 * Spike S1 probe (PDD 14): loads .output/chrome-mv3 into a throwaway Chrome profile, turns dev mode
 * on, scrolls a few public, logged-out sites and counts the items the observer detected per scroll.
 * Then checks the privacy rules on everything stored: a blocklisted site and a paused page produce
 * no events, and no stored record has a query string, a fragment or page text.
 *
 * Usage: npm run build && npm run probe:s1   (HEADED=1 shows the browser; SCROLLS=n per site)
 * Writes ../docs/showcase/M1/s1-probe.json (counts and key types only, never text).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, '../.output/chrome-mv3');
const outFile = process.env.OUT ? resolve(process.env.OUT) : resolve(here, '../../docs/showcase/M1/s1-probe.json');
const SCROLLS = Number(process.env.SCROLLS ?? 20);
const PAUSE_MS = 2500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const ALL_SITES = [
  { name: 'YouTube Shorts', url: 'https://www.youtube.com/shorts', scroll: 'key' },
  { name: 'Reddit', url: 'https://www.reddit.com/r/programming/', scroll: 'wheel' },
  { name: 'Mastodon (public feed, X-like)', url: 'https://mastodon.social/explore', scroll: 'wheel' },
  { name: 'Bluesky (public profile feed)', url: 'https://bsky.app/profile/bsky.app', scroll: 'wheel' },
  { name: 'MDN docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API', scroll: 'wheel' },
  { name: 'Wikipedia article', url: 'https://en.wikipedia.org/wiki/Attention', scroll: 'wheel' },
];
const SITES = ALL_SITES.filter((s) => !ONLY || ONLY.test(s.name));
const BLOCKED = { name: 'Blocklisted (example.com added)', url: 'https://example.com/?q=secret#frag' };
const PAUSED = { name: 'Paused page', url: 'https://en.wikipedia.org/wiki/Deep_work' };

const profile = mkdtempSync(join(tmpdir(), 'doomscroll-s1-'));
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(
  chromePath,
  [
    ...(process.env.HEADED ? [] : ['--headless=new']),
    `--user-data-dir=${profile}`,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    `--user-agent=${UA}`,
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);

const out = chrome.stdio[3];
const inp = chrome.stdio[4];
let id = 0;
let buf = '';
const pending = new Map();
const consoleLines = [];
inp.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (text.startsWith('[doomscroll]')) consoleLines.push(text);
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

const DUMP = `(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (s) => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  // Vectors are summarised in-page (a Float32Array doesn't survive JSON): length, finite, unit norm.
  const samples = (await all('samples')).map((s) => ({ ...s, vector: s.vector ? { len: s.vector.length, finite: s.vector.every(Number.isFinite), norm: Math.hypot(...s.vector) } : null }));
  const dump = { samples, bins: await all('bins'), recorderEvents: await all('recorderEvents') };
  db.close();
  return JSON.stringify(dump);
})()`;

const setSettings = (control, patch) =>
  evaluate(
    control,
    `(async () => { const cur = (await chrome.storage.local.get('settings')).settings ?? {}; await chrome.storage.local.set({ settings: { ...cur, ...${JSON.stringify(patch)} } }); return true; })()`,
  );

async function scrollPage(sessionId, mode) {
  if (mode === 'key') {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, sessionId);
    }
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 650 }, sessionId);
  }
}

/** A few longer lines of visible page text, to check none of it was stored. */
const SAMPLE_TEXT = `(() => (document.body?.innerText ?? '').split('\\n').map((s) => s.trim()).filter((s) => s.length >= 40).slice(0, 40))()`;

const results = { date: new Date().toISOString(), scrollsPerSite: SCROLLS, sites: [], checks: {} };
try {
  // A tab opened before the extension loads: onInstalled should inject the observer into it.
  const preopened = await openPage('https://en.wikipedia.org/wiki/Flow_(psychology)');
  await sleep(4000);
  const loaded = await send('Extensions.loadUnpacked', { path: ext });
  if (loaded.error) throw new Error(JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  const control = (await openPage(`chrome-extension://${extId}/dashboard.html`)).sessionId;
  await sleep(1500);
  await setSettings(control, { devMode: true, blocklist: { addedDomains: ['example.com'], removedDomains: [], addedKeywords: [] } });
  await sleep(1500);
  const registered = await evaluate(control, `chrome.scripting.getRegisteredContentScripts().then((s) => s.map((x) => ({ id: x.id, js: x.js, excludes: x.excludeMatches?.length ?? 0 })))`);
  results.checks.registeredContentScripts = registered;
  console.log('registered content scripts:', JSON.stringify(registered));

  // Dev mode was off at install; scroll the pre-opened tab now and look for its events.
  {
    const t0 = Date.now();
    await send('Page.bringToFront', {}, preopened.sessionId);
    for (let i = 0; i < 4; i++) {
      await scrollPage(preopened.sessionId, 'wheel');
      await sleep(2000);
    }
    const dump = JSON.parse(await evaluate(control, DUMP));
    const n = dump.recorderEvents.filter((r) => r.ts >= t0 && r.event.type === 'item' && r.event.origin === 'https://en.wikipedia.org').length;
    results.checks.injectedIntoOpenTab = n > 0;
    console.log('observer injected into a tab opened before install:', n > 0, `(${n} items)`);
    await send('Target.closeTarget', { targetId: preopened.targetId });
  }

  const pageTexts = [];
  for (const site of SITES) {
    const t0 = Date.now();
    consoleLines.length = 0;
    const page = await openPage(site.url);
    await send('Page.bringToFront', {}, page.sessionId);
    await sleep(6000);
    for (let i = 0; i < SCROLLS; i++) {
      await scrollPage(page.sessionId, site.scroll);
      await sleep(PAUSE_MS);
    }
    await sleep(1500);
    pageTexts.push(...((await evaluate(page.sessionId, SAMPLE_TEXT).catch(() => [])) ?? []));
    const finalPath = await evaluate(page.sessionId, 'location.pathname').catch(() => '?');
    if (process.env.DEBUG) {
      const info = await evaluate(page.sessionId, `(() => { const chain = []; for (let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); el && chain.length < 14; el = el.parentElement) { const r = el.getBoundingClientRect(); chain.push(el.tagName.toLowerCase() + ':' + Math.round(r.height) + ':' + (el.textContent ?? '').trim().length); } return { scrollY, vh: innerHeight, title: document.title, bodyText: document.body.innerText.length, chain }; })()`).catch((e) => String(e));
      console.log('debug', site.name, JSON.stringify(info));
    }
    await send('Target.closeTarget', { targetId: page.targetId });
    const dump = JSON.parse(await evaluate(control, DUMP));
    const items = dump.recorderEvents.map((r) => r.event).filter((e) => e.type === 'item' && e.ts >= t0);
    const keyTypes = {};
    for (const e of items) keyTypes[e.itemKey.slice(0, 2)] = (keyTypes[e.itemKey.slice(0, 2)] ?? 0) + 1;
    const perf = consoleLines.filter((l) => l.includes('perf:')).at(-1) ?? null;
    const r = {
      site: site.name,
      origin: new URL(site.url).origin,
      finalPath,
      scrolls: SCROLLS,
      items: items.length,
      ratio: +(items.length / SCROLLS).toFixed(2),
      distinctKeys: new Set(items.map((e) => e.itemKey)).size,
      visual: items.filter((e) => e.isVisual).length,
      keyTypes,
      videoEvents: dump.recorderEvents.filter((x) => x.event.type === 'video' && x.ts >= t0).length,
      perf,
    };
    results.sites.push(r);
    console.log(JSON.stringify(r));
  }

  // Blocklisted site: no events at all.
  {
    const t0 = Date.now();
    const page = await openPage(BLOCKED.url);
    await sleep(4000);
    await scrollPage(page.sessionId, 'wheel');
    await sleep(3000);
    await send('Target.closeTarget', { targetId: page.targetId });
    const dump = JSON.parse(await evaluate(control, DUMP));
    const n = dump.recorderEvents.filter((r) => r.ts >= t0 && JSON.stringify(r.event).includes('example.com')).length;
    results.checks.blocklistedEvents = n;
    console.log('blocklisted site events:', n);
  }

  // Paused: no events at all.
  {
    await setSettings(control, { pausedUntil: 'forever' });
    await sleep(1000);
    const t0 = Date.now();
    const page = await openPage(PAUSED.url);
    await send('Page.bringToFront', {}, page.sessionId);
    await sleep(4000);
    for (let i = 0; i < 4; i++) {
      await scrollPage(page.sessionId, 'wheel');
      await sleep(1500);
    }
    await send('Target.closeTarget', { targetId: page.targetId });
    const dump = JSON.parse(await evaluate(control, DUMP));
    const n = dump.recorderEvents.filter((r) => r.ts > t0 && r.event.type !== 'pause').length;
    results.checks.pausedBadge = await evaluate(control, 'chrome.action.getBadgeText({})');
    const s = dump.samples.filter((x) => x.ts > t0).length;
    results.checks.pausedEvents = n;
    results.checks.pausedSamples = s;
    console.log('paused events:', n, 'paused samples:', s, 'badge:', JSON.stringify(results.checks.pausedBadge));
    await setSettings(control, { pausedUntil: null });
  }

  // Privacy: nothing stored has a query string, a fragment or page text.
  {
    await sleep(31_000); // let the open bin close
    const dump = JSON.parse(await evaluate(control, DUMP));
    const records = [...dump.samples, ...dump.bins, ...dump.recorderEvents.map((r) => r.event)];
    // Titles are stored by design while "store titles" is on (PDD 8.2), so they're left out of the text check.
    const withoutTitles = records.map(({ title: _t, ...rest }) => rest);
    const badUrl = records.filter((r) => /[?#]/.test(r.path ?? '') || /[?#]/.test(r.origin ?? ''));
    const withText = records.filter((r) => 'text' in r);
    const json = JSON.stringify(withoutTitles);
    const leaked = pageTexts.filter((t) => json.includes(t));
    for (const t of leaked) {
      const where = withoutTitles.find((r) => JSON.stringify(r).includes(t));
      console.log('page text found in a stored record:', JSON.stringify({ line: t.slice(0, 80), fields: Object.keys(where ?? {}).filter((k) => JSON.stringify(where[k]).includes(t)) }));
    }
    const vec = dump.samples.filter((x) => x.vector);
    results.checks.embedding = {
      samples: dump.samples.length,
      withVector: vec.length,
      finiteUnitNorm: vec.filter((x) => x.vector.finite && Math.abs(x.vector.norm - 1) < 1e-3).length,
      dims: [...new Set(vec.map((x) => x.vector.len))],
      status: await evaluate(control, `chrome.runtime.sendMessage({ target: 'background', type: 'embed-status' }).then((r) => r?.data ?? r)`).catch((e) => String(e)),
    };
    console.log('embedding:', JSON.stringify(results.checks.embedding));
    if (process.env.M3) {
      // M3: force a re-cluster on what was just embedded, then summarise territories per origin.
      const report = JSON.parse(await evaluate(control, `chrome.runtime.sendMessage({ target: 'background', type: 'territories-recluster', payload: { force: true } }).then((r) => JSON.stringify(r?.data ?? r))`));
      const view = JSON.parse(
        await evaluate(
          control,
          `(async () => {
            const db = await new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
            const all = (s) => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
            const territories = (await all('territories')).map((t) => ({ id: t.id, name: t.name, size: t.size, radius: t.radius, suggestedLabel: t.suggestedLabel, label: t.label }));
            const samples = (await all('samples')).map((s) => ({ origin: s.origin, path: s.path, territoryId: s.territoryId, hasVector: !!s.vector }));
            const bins = (await all('bins')).map((b) => ({ territoryId: b.territoryId, active_s: b.active_s }));
            db.close();
            return JSON.stringify({ territories, samples, bins });
          })()`,
        ),
      );
      const byOrigin = {};
      for (const x of view.samples) {
        const o = (byOrigin[x.origin] ??= { samples: 0, territories: {} });
        o.samples++;
        const k = x.territoryId ?? 'unassigned';
        o.territories[k] = (o.territories[k] ?? 0) + 1;
      }
      results.checks.territories = {
        report,
        territories: view.territories,
        samplesWithTerritory: view.samples.filter((x) => x.territoryId).length,
        samples: view.samples.length,
        binsWithTerritory: view.bins.filter((b) => b.territoryId).length,
        bins: view.bins.length,
        byOrigin,
      };
      console.log('territories:', JSON.stringify(results.checks.territories, null, 1));
      // Dashboard UI: the list renders, labels can be clicked, and survive a second forced re-cluster.
      await sleep(16_000); // the list refreshes every 15 s
      const text = await evaluate(control, `document.querySelector('table.territories')?.innerText ?? 'NO TABLE'`);
      await evaluate(control, `(() => { const rows = document.querySelectorAll('table.territories tbody tr'); rows[0].querySelectorAll('.label-btn')[0].click(); rows[1].querySelectorAll('.label-btn')[2].click(); return true; })()`);
      await sleep(1500);
      const labelsOf = async () =>
        JSON.parse(await evaluate(control, `(async () => { const db = await new Promise((res, rej) => { const r = indexedDB.open('doomscroll-autopsy'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); const q = db.transaction('territories').objectStore('territories').getAll(); return new Promise((res) => { q.onsuccess = () => { db.close(); res(JSON.stringify(q.result.map((t) => ({ id: t.id, label: t.label, confirmed: t.labelConfirmed, allowanceMin: t.allowanceMin })).filter((t) => t.confirmed))); }; }); })()`));
      const before = await labelsOf();
      const second = JSON.parse(await evaluate(control, `chrome.runtime.sendMessage({ target: 'background', type: 'territories-recluster', payload: { force: true } }).then((r) => JSON.stringify(r?.data ?? r))`));
      const after = await labelsOf();
      results.checks.territoriesUi = {
        tableChars: text.length,
        tableHead: text.split('\n').slice(0, 12),
        confirmedBefore: before,
        secondRun: { ok: second.ok, matched: second.matched, created: second.created, dormant: second.dormant, similarities: second.similarities },
        confirmedAfter: after,
        labelsSurvived: JSON.stringify(before.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(after.sort((a, b) => a.id.localeCompare(b.id))) && before.length === 2,
      };
      console.log('territoriesUi:', JSON.stringify(results.checks.territoriesUi, null, 1));
    }
    results.checks.privacy = {
      records: records.length,
      samples: dump.samples.length,
      bins: dump.bins.length,
      activeSecondsInBins: Math.round(dump.bins.reduce((s, b) => s + b.active_s, 0)),
      recorderEvents: dump.recorderEvents.length,
      urlsWithQueryOrFragment: badUrl.length,
      recordsWithTextField: withText.length,
      pageTextLinesChecked: pageTexts.length,
      pageTextLinesFound: leaked.length,
    };
    console.log('privacy:', JSON.stringify(results.checks.privacy));
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2) + '\n');
  console.log('wrote', outFile);
  const p = results.checks.privacy;
  process.exitCode =
    results.checks.blocklistedEvents === 0 && results.checks.pausedEvents === 0 && p.urlsWithQueryOrFragment === 0 && p.recordsWithTextField === 0 && p.pageTextLinesFound === 0
      ? 0
      : 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
