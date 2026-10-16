import { browser } from 'wxt/browser';
import { get, put } from '@/lib/db';
import type { createRouter } from '@/lib/messaging';
import { refreshPrediction } from '@/lib/ml/evaluate';
import { syncAssignments } from '@/lib/ml/territories';
import { checkDue } from '@/lib/ml/territories-background';
import { lastNightlyBoundary } from '@/lib/ml/territories-core';
import { exclusive } from '@/lib/privacy/background';
import { applyRetention } from '@/lib/privacy/retention';
import { getSettings } from '@/lib/settings';
import './messages';
import { ensureReports, generateReport } from './service';

/**
 * The nightly job (PDD 6.3): at the first check after 03:00 local (a sleeping laptop catches up):
 *   1. retention, 2. re-cluster if due, 7. facts and the autopsy for every finished day.
 * Steps 3-6 belong to later milestones (tags, naming by the 270M, GRU, UMAP).
 */
export const NIGHTLY_ALARM = 'metrics-nightly';
export const NIGHTLY_META = 'nightly-meta';

export interface NightlyMeta {
  lastRunAt: number | null;
  reportsWritten: string[];
  error: string | null;
}

type Router = ReturnType<typeof createRouter>;

export async function getNightlyMeta(): Promise<NightlyMeta | null> {
  return ((await get('models', NIGHTLY_META))?.data as NightlyMeta | undefined) ?? null;
}

export function isNightlyDue(lastRunAt: number | null, now: number): boolean {
  return lastRunAt == null || lastRunAt < lastNightlyBoundary(now);
}

/** Runs the nightly steps in order; each step is isolated so one failure doesn't skip the rest. */
export async function runNightly(now = Date.now()): Promise<NightlyMeta> {
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  let written: string[] = [];
  await step('retention', async () => applyRetention((await getSettings()).retentionDays, now));
  await step('territories', async () => {
    await checkDue();
    await syncAssignments(now);
  });
  await step('prediction', () => refreshPrediction(now));
  await step('reports', async () => {
    written = await ensureReports(now);
  });
  const meta: NightlyMeta = { lastRunAt: now, reportsWritten: written, error: errors.length ? errors.join('; ') : null };
  await put('models', { name: NIGHTLY_META, updatedAt: now, data: meta });
  return meta;
}

async function checkNightly(): Promise<void> {
  const meta = await getNightlyMeta();
  if (isNightlyDue(meta?.lastRunAt ?? null, Date.now())) await exclusive(() => runNightly());
}

export function registerMetrics(router: Router): void {
  router.register('report-generate', (req) => exclusive(() => generateReport(req.date)));

  void (async () => {
    if (!(await browser.alarms.get(NIGHTLY_ALARM))) await browser.alarms.create(NIGHTLY_ALARM, { periodInMinutes: 30 });
    await checkNightly(); // catch up after a worker start
  })().catch((e) => console.warn('[doomscroll] nightly setup failed:', e));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NIGHTLY_ALARM) void checkNightly().catch((e) => console.warn('[doomscroll] nightly failed:', e));
  });
}
