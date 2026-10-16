import type { DailyFacts } from '@shared/types';
import { get, getAll, getByTs, getRange, openDb, put, type BinRecord, type NudgeRecord, type ReportRecord, type TerritoryRecord } from '@/lib/db';
import { renderAutopsy, TEMPLATE_VERSION } from './autopsy';
import { computeFacts, VS7_DAYS } from './facts';
import { buildTimeline, type TimelineModel } from './timeline';
import { addDays, dateKey, dayEnd, dayStart } from './time';

/**
 * Database side of the metrics: loads a day's bins, territories and nudges, computes facts and the
 * template autopsy, and keeps `reports` (PDD 6.3 step 7, 8.1).
 */
const SPILL_MS = 3 * 3600_000;
/** Reports older than this window aren't needed for the 7-day comparison. */
const COMPARE_LOOKBACK_DAYS = 14;

export interface DayData {
  date: string;
  bins: BinRecord[];
  territories: TerritoryRecord[];
  nudges: NudgeRecord[];
}

export async function loadDay(date: string): Promise<DayData> {
  const from = dayStart(date);
  const to = dayEnd(date);
  const [bins, territories, nudges] = await Promise.all([
    getRange('bins', from - SPILL_MS, to + SPILL_MS),
    getAll('territories'),
    getByTs('nudges', from, to - 1),
  ]);
  return { date, bins: bins as BinRecord[], territories: territories as TerritoryRecord[], nudges: nudges as NudgeRecord[] };
}

/**
 * Facts of the days before `date` (for the 7-day comparison): stored reports where they exist, else
 * computed live from the bins, so the comparison works on the first day a week of data exists
 * even if the nightly job hasn't written the reports yet.
 */
async function previousFacts(date: string): Promise<Array<{ date: string; facts: DailyFacts }>> {
  const earliest = addDays(date, -COMPARE_LOOKBACK_DAYS);
  const stored = new Map(((await getAll('reports')) as ReportRecord[]).map((r) => [r.date, r.facts]));
  const out: Array<{ date: string; facts: DailyFacts }> = [];
  for (const d of await datesWithData()) {
    if (d >= date || d < earliest) continue;
    const facts = stored.get(d) ?? computeFacts({ ...(await loadDay(d)), previous: [] });
    out.push({ date: d, facts });
  }
  return out;
}

/** Facts for any day, computed live from stored bins (today included). */
export async function computeDayFacts(date: string, opts: { compare?: boolean } = {}): Promise<DailyFacts> {
  const data = await loadDay(date);
  return computeFacts({ ...data, previous: opts.compare === false ? [] : await previousFacts(date) });
}

export async function loadTimeline(date: string): Promise<TimelineModel> {
  return buildTimeline(await loadDay(date));
}

export async function getReport(date: string): Promise<ReportRecord | undefined> {
  return get('reports', date);
}

/** Facts + template autopsy for `date`, stored in `reports`. */
export async function generateReport(date: string, now = Date.now()): Promise<ReportRecord> {
  const facts = await computeDayFacts(date);
  const record: ReportRecord = { date, facts, autopsy: renderAutopsy(facts), modelVersion: TEMPLATE_VERSION, generatedAt: now };
  await put('reports', record);
  return record;
}

/** Local dates (oldest first) that have at least one bin. */
export async function datesWithData(): Promise<string[]> {
  const keys = (await (await openDb()).getAllKeys('bins')) as number[];
  const dates = new Set<string>();
  let lastDay = '';
  for (const k of keys) {
    const d = dateKey(k);
    if (d !== lastDay) {
      dates.add(d);
      lastDay = d;
    }
  }
  return [...dates].sort();
}

/**
 * Makes sure every finished day with data has a report (oldest first, so each one can compare with
 * the days before it). A report generated before its day ended is regenerated. Returns the dates written.
 */
export async function ensureReports(now = Date.now()): Promise<string[]> {
  const today = dateKey(now);
  const written: string[] = [];
  for (const date of await datesWithData()) {
    if (date >= today) continue;
    const existing = await getReport(date);
    if (existing && (existing.generatedAt ?? 0) >= dayEnd(date)) continue;
    await generateReport(date, now);
    written.push(date);
  }
  return written;
}

/** Recomputes the stored report of each date that has one (used after a forget). Returns the dates redone. */
export async function regenerateReports(dates: string[], now = Date.now()): Promise<string[]> {
  const done: string[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const hasData = (await getRange('bins', dayStart(date), dayEnd(date) - 1)).length > 0;
    if (hasData) {
      await generateReport(date, now);
      done.push(date);
    } else {
      await (await openDb()).delete('reports', date);
    }
  }
  return done;
}

/** What the popup shows (PDD 4.4). */
export interface PopupSummary {
  deepBlocks: number;
  longestMin: number;
  switchesOutOfDeep: number;
  meanMinBackToDeep: number | null;
  drainOverMin: number;
  nudgesShown: number;
  nudgesWorked: number;
  medianReturnMin: number | null;
}

export function summarize(f: DailyFacts): PopupSummary {
  return {
    deepBlocks: f.deepBlocks.count,
    longestMin: f.deepBlocks.longestMin,
    switchesOutOfDeep: f.residue.switchesOutOfDeep,
    meanMinBackToDeep: f.residue.meanMinBackToDeep,
    drainOverMin: f.drainOverAllowance.reduce((m, d) => m + d.minutesOver, 0),
    nudgesShown: f.nudges.shown,
    nudgesWorked: f.nudges.accepted,
    medianReturnMin: f.nudges.medianReturnMin,
  };
}

export async function popupSummary(now = Date.now()): Promise<PopupSummary> {
  return summarize(await computeDayFacts(dateKey(now), { compare: false }));
}

/** Product success metrics (PDD 4.7, D-48) over the last `days` days including today. */
export interface SuccessMetrics {
  days: number;
  perDay: Array<{ date: string; deepBlocks: number; longestMin: number; switches: number; meanBack: number | null; overMin: number }>;
  avgDeepBlocks: number | null;
  longestMin: number;
  avgSwitches: number | null;
  avgMeanBack: number | null;
  avgOverMin: number | null;
  nudgesShown: number;
  nudgesAccepted: number;
  /** accepted / shown; null with no nudges. */
  acceptanceRate: number | null;
  medianReturnMin: number | null;
}

const mean = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
const medianOf = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) * 10) / 10;
};

export function summarizeSuccess(factsByDay: DailyFacts[]): SuccessMetrics {
  const perDay = factsByDay.map((f) => ({
    date: f.date,
    deepBlocks: f.deepBlocks.count,
    longestMin: f.deepBlocks.longestMin,
    switches: f.residue.switchesOutOfDeep,
    meanBack: f.residue.meanMinBackToDeep,
    overMin: f.drainOverAllowance.reduce((m, d) => m + d.minutesOver, 0),
  }));
  const shown = factsByDay.reduce((m, f) => m + f.nudges.shown, 0);
  const accepted = factsByDay.reduce((m, f) => m + f.nudges.accepted, 0);
  return {
    days: perDay.length,
    perDay,
    avgDeepBlocks: mean(perDay.map((d) => d.deepBlocks)),
    longestMin: perDay.reduce((m, d) => Math.max(m, d.longestMin), 0),
    avgSwitches: mean(perDay.map((d) => d.switches)),
    avgMeanBack: mean(perDay.flatMap((d) => (d.meanBack == null ? [] : [d.meanBack]))),
    avgOverMin: mean(perDay.map((d) => d.overMin)),
    nudgesShown: shown,
    nudgesAccepted: accepted,
    acceptanceRate: shown ? Math.round((accepted / shown) * 100) / 100 : null,
    medianReturnMin: medianOf(factsByDay.flatMap((f) => (f.nudges.medianReturnMin == null ? [] : [f.nudges.medianReturnMin]))),
  };
}

export async function successMetrics(now = Date.now(), days = VS7_DAYS): Promise<SuccessMetrics> {
  const today = dateKey(now);
  const wanted = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)));
  const have = new Set(await datesWithData());
  const facts: DailyFacts[] = [];
  for (const date of wanted) {
    if (date === today) facts.push(await computeDayFacts(date));
    else if (have.has(date)) facts.push((await getReport(date))?.facts ?? (await computeDayFacts(date, { compare: false })));
  }
  return summarizeSuccess(facts);
}
