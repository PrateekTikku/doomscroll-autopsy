import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';
import type { Envelope } from '@/lib/messaging';
import './messages';
import type { NudgePayload } from './messages';
import { mountNudge, type MountedNudge } from './ui';

/**
 * Content-script side of nudges. Started by entrypoints/observer.ts only after the blocklist and
 * pause checks, so blocklisted or paused pages never show or receive a nudge. Uses its own
 * `onMessage` listener (removable on shutdown) rather than a router, so a stale copy left over from
 * an extension update can't answer for the live one.
 */
export function startNudges(opts: { isActive: () => boolean }): () => void {
  let current: MountedNudge | null = null;

  const listener = (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void): boolean => {
    const env = msg as Partial<Envelope> | null;
    if (!env || env.target !== 'content' || env.type !== 'nudge-show') return false;
    if (!opts.isActive() || browser.runtime?.id == null) {
      sendResponse({ ok: true, data: { shown: false } });
      return false;
    }
    const nudge = env.payload as NudgePayload;
    current?.close();
    current = mountNudge(document, nudge, (response) => {
      current = null;
      if (nudge.id != null) void send('background', 'nudge-response', { id: nudge.id, response }).catch(() => undefined);
    });
    sendResponse({ ok: true, data: { shown: true } });
    return false;
  };

  browser.runtime.onMessage.addListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
  return () => {
    browser.runtime.onMessage.removeListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
    current?.close();
    current = null;
  };
}
