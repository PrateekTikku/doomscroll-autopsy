import { defineUnlistedScript } from '#imports';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';
import { effectiveBlocklist, isBlockedHost } from '@/lib/observer/blocklist';
import { startNudges } from '@/lib/nudge/content';
import { startObserver } from '@/lib/observer/content';
import '@/lib/observer/messages';
import { pageLocation } from '@/lib/observer/url';
import { getSettings, isPaused, onSettingsChanged, type Settings } from '@/lib/settings';
import type { ObserverEvent } from '@shared/types';

/**
 * Observer content script (PDD 6.1, 7). Registered at runtime by the service worker with the
 * blocklist as `excludeMatches` (lib/observer/background.ts). It is an unlisted script rather than a
 * WXT content script so that nothing runs before the checks below: no wrapper, no page events.
 *
 * First action (PDD 11.2): incognito, non-http(s), blocklist and pause checks. On a block it reads
 * nothing and attaches no listeners. While paused it only listens for the settings change that
 * resumes it.
 */
type Global = typeof globalThis & { __doomscrollStop?: () => void };

export default defineUnlistedScript(async () => {
  const g = globalThis as Global;
  g.__doomscrollStop?.(); // an older copy of this script (re-injected after an update)
  if (browser.extension.inIncognitoContext) return;
  const loc = pageLocation(location.href);
  if (!loc) return;
  let settings: Settings = await getSettings();
  const blocked = (s: Settings) => isBlockedHost(loc.hostname, effectiveBlocklist(s.blocklist));
  if (blocked(settings)) return;

  let stop: (() => void) | null = null;
  let unsubscribe: () => void = () => {};
  // Nudges (M4) are only listened for after the checks above; they are shown only while observing.
  const stopNudges = startNudges({ isActive: () => stop != null });
  const shutdown = () => {
    unsubscribe();
    stop?.();
    stop = null;
    stopNudges();
  };
  const sendEvent = (ev: ObserverEvent) => {
    // After an extension update this copy is orphaned: stop quietly.
    if (browser.runtime?.id == null) return shutdown();
    send('background', 'observer-event', ev).catch(() => {
      if (browser.runtime?.id == null) shutdown();
    });
  };
  const apply = () => {
    const run = !isPaused(settings) && !blocked(settings);
    if (run && !stop) {
      stop = startObserver({ send: sendEvent, devMode: () => settings.devMode, storeTitles: () => settings.storeTitles });
    } else if (!run && stop) {
      stop();
      stop = null;
    }
  };
  unsubscribe = onSettingsChanged((s) => {
    settings = s;
    apply();
  });
  g.__doomscrollStop = shutdown;
  apply();
});
