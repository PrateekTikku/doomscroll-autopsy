import { browser } from 'wxt/browser';
import type { createRouter } from '@/lib/messaging';
import './territories-messages';
import { isReclusterDue, MIN_FIRST_CLUSTER_VECTORS } from './territories-core';
import { countVectors, getMeta, recluster, syncAssignments } from './territories';

/**
 * Service-worker side of M3: the 30-minute "is a re-cluster due?" check (PDD 9.2/6.3) and the
 * one-minute sweep that gives new samples and bins their territory.
 */
export const CHECK_ALARM = 'territories-check';
export const SYNC_ALARM = 'territories-sync';

type Router = ReturnType<typeof createRouter>;

export async function checkDue(): Promise<void> {
  const meta = await getMeta();
  const vectors = await countVectors(MIN_FIRST_CLUSTER_VECTORS);
  if (isReclusterDue(meta, vectors, Date.now())) {
    const r = await recluster();
    if (!r.ok) console.warn('[doomscroll] re-cluster skipped:', r.reason);
  }
}

export function registerTerritories(router: Router): void {
  router.register('territories-recluster', (req) => recluster({ force: req?.force ?? false }));
  router.register('territories-sync', () => syncAssignments());

  // Every worker start: make sure both alarms exist, and catch up on a missed run.
  void (async () => {
    if (!(await browser.alarms.get(CHECK_ALARM))) await browser.alarms.create(CHECK_ALARM, { periodInMinutes: 30 });
    if (!(await browser.alarms.get(SYNC_ALARM))) await browser.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
  })().catch(() => undefined);

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECK_ALARM) void checkDue().catch((e) => console.warn('[doomscroll] territory check failed:', e));
    else if (alarm.name === SYNC_ALARM) void syncAssignments().catch((e) => console.warn('[doomscroll] territory sync failed:', e));
  });
}
