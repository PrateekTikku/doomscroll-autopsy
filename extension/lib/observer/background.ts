import { browser } from 'wxt/browser';
import type { createRouter } from '@/lib/messaging';
import { getSettings, isPaused, onSettingsChanged, updateSettings, type Settings } from '@/lib/settings';
import { effectiveBlocklist, excludeMatchesFor, isBlockedHost } from './blocklist';
import './messages';
import { createObserverService } from './service';
import type { BrowserEvent } from './types';
import { pageLocation } from './url';

/**
 * Service-worker side of the observer (PDD 7.4, 11.2, 11.3): registers the content script with the
 * blocklist as `excludeMatches`, feeds tab / focus / idle events and content-script events into the
 * observer service, keeps the clock ticking, and shows the pause badge.
 */

const SCRIPT_ID = 'observer';
const SCRIPT_FILE = '/observer.js';
const TICK_ALARM = 'observer-tick';
const PAUSE_END_ALARM = 'pause-end';
/**
 * Seconds without input before chrome.idle reports "idle". 120 rather than Chrome's default 60, so
 * reading a long page without touching the mouse doesn't count as idle too quickly.
 */
export const IDLE_DETECTION_S = 120;

type Router = ReturnType<typeof createRouter>;

/** (Re-)registers the content script. Falls back to fewer exclusions if Chrome rejects a pattern. */
export async function syncContentScript(settings: Settings): Promise<number> {
  const list = effectiveBlocklist(settings.blocklist);
  const attempts = [excludeMatchesFor(list), excludeMatchesFor(list, { suffixes: false }), []];
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  for (const excludeMatches of attempts) {
    const script = {
      id: SCRIPT_ID,
      js: [SCRIPT_FILE],
      matches: ['http://*/*', 'https://*/*'],
      excludeMatches,
      runAt: 'document_idle' as const,
      allFrames: false,
      persistAcrossSessions: true,
    };
    try {
      if (existing.length > 0) await browser.scripting.updateContentScripts([script]);
      else await browser.scripting.registerContentScripts([script]);
      return excludeMatches.length;
    } catch (err) {
      console.warn('[doomscroll] content script registration failed, retrying with fewer exclusions:', err);
    }
  }
  throw new Error('Could not register the observer content script');
}

/** After install or update, start the observer in tabs that are already open. */
async function injectIntoOpenTabs(settings: Settings): Promise<void> {
  const list = effectiveBlocklist(settings.blocklist);
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(
    tabs.map(async (tab) => {
      const loc = tab.url ? pageLocation(tab.url) : null;
      if (tab.id == null || tab.incognito || tab.discarded || !loc || isBlockedHost(loc.hostname, list)) return;
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [SCRIPT_FILE] }).catch(() => {});
    }),
  );
}

/** Current focus, active tabs and idle state, as pipeline events. */
async function snapshot(): Promise<BrowserEvent[]> {
  const ts = Date.now();
  const [win, tabs, idle] = await Promise.all([
    browser.windows.getLastFocused().catch(() => null),
    browser.tabs.query({ active: true }),
    browser.idle.queryState(IDLE_DETECTION_S),
  ]);
  return [
    ...tabs.filter((t) => t.id != null).map((t): BrowserEvent => ({ type: 'tab-activated', ts, tabId: t.id!, windowId: t.windowId })),
    { type: 'window-focus', ts, windowId: win?.focused && win.id != null ? win.id : null },
    { type: 'idle-state', ts, state: idle },
  ];
}

async function updateBadge(settings: Settings): Promise<void> {
  const paused = isPaused(settings);
  await browser.action.setBadgeText({ text: paused ? 'II' : '' });
  if (paused) await browser.action.setBadgeBackgroundColor({ color: '#d97706' });
  const until =
    settings.pausedUntil === 'forever'
      ? 'until you resume'
      : `until ${new Date(settings.pausedUntil as number).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
  await browser.action.setTitle({ title: paused ? `Doomscroll Autopsy: paused ${until}` : 'Doomscroll Autopsy' });
}

async function schedulePauseEnd(settings: Settings): Promise<void> {
  if (typeof settings.pausedUntil === 'number') {
    if (settings.pausedUntil <= Date.now()) await updateSettings({ pausedUntil: null });
    else await browser.alarms.create(PAUSE_END_ALARM, { when: settings.pausedUntil });
  } else {
    await browser.alarms.clear(PAUSE_END_ALARM);
  }
}

async function setTick(needed: boolean): Promise<void> {
  if (!needed) {
    await browser.alarms.clear(TICK_ALARM);
  } else if (!(await browser.alarms.get(TICK_ALARM))) {
    await browser.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  }
}

export function registerObserver(router: Router): void {
  const service = createObserverService({ onTickNeeded: (needed) => void setTick(needed) });
  const enqueue = (ev: BrowserEvent) => void service.enqueue(ev);

  router.register('observer-event', (ev, sender) => {
    const tab = sender.tab;
    if (tab?.id == null || tab.incognito || sender.frameId !== 0) return;
    void service.enqueue({ ...ev, tabId: tab.id });
  });
  router.register('live-stats', () => service.liveStats());

  // Listeners are attached synchronously so MV3 delivers the event that woke the worker.
  browser.tabs.onActivated.addListener(({ tabId, windowId }) => enqueue({ type: 'tab-activated', ts: Date.now(), tabId, windowId }));
  browser.tabs.onRemoved.addListener((tabId) => enqueue({ type: 'tab-removed', ts: Date.now(), tabId }));
  browser.windows.onFocusChanged.addListener((windowId) =>
    enqueue({ type: 'window-focus', ts: Date.now(), windowId: windowId === browser.windows.WINDOW_ID_NONE ? null : windowId }),
  );
  browser.idle.setDetectionInterval(IDLE_DETECTION_S);
  browser.idle.onStateChanged.addListener((state) => enqueue({ type: 'idle-state', ts: Date.now(), state }));
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TICK_ALARM) enqueue({ type: 'tick', ts: Date.now() });
    if (alarm.name === PAUSE_END_ALARM) void getSettings().then(schedulePauseEnd);
  });

  let blocklistJson: string | null = null;
  const applySettings = async (settings: Settings, first = false) => {
    await updateBadge(settings);
    await schedulePauseEnd(settings);
    const resumed = (await service.setSettings(settings)) && !isPaused(settings);
    if (resumed) for (const ev of await snapshot()) await service.enqueue(ev);
    const json = JSON.stringify(settings.blocklist);
    if (!first && blocklistJson !== null && json !== blocklistJson) await syncContentScript(settings);
    blocklistJson = json;
  };
  onSettingsChanged((s) => void applySettings(s).catch((err) => console.error('[doomscroll] settings:', err)));

  browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    await syncContentScript(settings);
    await injectIntoOpenTabs(settings);
  });

  // Every worker start: restore badge and alarms; make sure the content script is registered;
  // take a snapshot if this browser session has no pipeline state yet.
  void (async () => {
    const settings = await getSettings();
    await applySettings(settings, true);
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (registered.length === 0) await syncContentScript(settings);
    if (!(await service.hasState()) && !isPaused(settings)) for (const ev of await snapshot()) await service.enqueue(ev);
    await setTick(true);
  })().catch((err) => console.error('[doomscroll] observer start:', err));
}
