import { browser } from 'wxt/browser';
import { get, put } from '@/lib/db';
import type { createRouter } from '@/lib/messaging';
import { refreshPrediction } from '@/lib/ml/evaluate';
import { runGru } from '@/lib/ml/gru-background';
import { runTopicTags } from '@/lib/ml/topics-background';
import { syncAssignments } from '@/lib/ml/territories';
import { checkDue } from '@/lib/ml/territories-background';
import { lastNightlyBoundary } from '@/lib/ml/territories-core';
import { exclusive } from '@/lib/privacy/background';
import { applyRetention } from '@/lib/privacy/retention';
import { generateViaOffscreen, unloadWriter } from '@/lib/gen/client';
import { nameTerritories } from '@/lib/gen/naming-service';
import { getSettings } from '@/lib/settings';
import './messages';
import { ensureReports, generateReport } from './service';

/**
 * The nightly job (PDD 6.3): at the first check after 03:00 local (a sleeping laptop catches up):
 *   1. retention, 2. re-cluster if due, 3. topic tags (M8), 4. name territories with the 270M (M6), 7. facts and the
 *   autopsy (model first, template fallback) for every finished day.
 * 5. GRU training and promotion (M8, D-20); the prediction mode is refreshed right after. Step 6 (UMAP) is drawn on demand on the dashboard.
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
export interface NightlyDeps {
  /** Step 3: zero-shot topic tags for every territory (M8); defaults to the embedder in the offscreen document. */
  tags?: () => Promise<unknown>;
  /** Step 4; defaults to the writer model in the offscreen document. */
  name?: () => Promise<unknown>;
  unload?: () => Promise<void>;
  /** Step 5: train, evaluate and maybe promote the GRU (M8); defaults to the offscreen document. */
  gru?: () => Promise<unknown>;
}

export async function runNightly(now = Date.now(), deps: NightlyDeps = {}): Promise<NightlyMeta> {
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
  await step('tags', () => (deps.tags ?? runTopicTags)());
  await step('naming', () => (deps.name ?? (() => nameTerritories(generateViaOffscreen, { now })))());
  await step('prediction', () => refreshPrediction(now));
  await step('gru', () => (deps.gru ?? (() => runGru()))());
  await step('reports', async () => {
    written = await ensureReports(now);
  });
  await (deps.unload ?? unloadWriter)().catch(() => undefined);
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
