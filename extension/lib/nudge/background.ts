import { browser } from 'wxt/browser';
import type { createRouter } from '@/lib/messaging';
import './messages';
import { createNudgeService, deliverToActiveTab } from './service';

/** Service-worker side of M4: a 30 s alarm drives scoring and nudges; the popup and content script talk to it. */
export const NUDGE_ALARM = 'nudge-tick';

type Router = ReturnType<typeof createRouter>;

export function registerNudges(router: Router): void {
  const service = createNudgeService({ deliver: deliverToActiveTab });
  router.register('spiral-status', () => service.status());
  router.register('nudge-response', (req) => service.respond(req.id, req.response));

  void (async () => {
    if (!(await browser.alarms.get(NUDGE_ALARM))) await browser.alarms.create(NUDGE_ALARM, { periodInMinutes: 0.5 });
  })().catch(() => undefined);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NUDGE_ALARM) void service.tick().catch((e) => console.warn('[doomscroll] nudge tick failed:', e));
  });
}
