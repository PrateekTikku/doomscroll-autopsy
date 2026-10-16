import type { DailyFacts } from '@shared/types';
import type { BinRecord, Label, NudgeRecord, TerritoryRecord } from '@/lib/db';
import { DEFAULT_ALLOWANCE_MIN, effectiveLabel } from '@/lib/ml/scoring';
import { addDays, BIN_MS, clock, dayEnd, dayStart, round1 } from './time';

/**
 * Daily facts (PDD 4.1, 9.8, D-42, D-45): deep blocks, attention residue, totals, drain over
 * allowance, triggers, strongest stretch, nudge outcomes and the 7-day comparison, all computed
 * deterministically from bins. Browser time only: away, idle and unobserved time is a *gap* that
 * pauses the clock and is never reported.
 */
export const DEEP_BLOCK_MIN = 25;
export const MAX_INTERRUPTION_S = 120;
/** A gap longer than this ends a block instead of pausing it (D-55). */
export const MAX_PAUSE_GAP_MS = 30 * 60_000;
export const MAX_TRIGGERS = 5;
export const VS7_DAYS = 7;

export type BinState = Label | 'other';

/** A browsing bin with the label of its territory. */
export interface Slot {
  start: number;
  /** Browsing seconds in this bin (1–30). */
  sec: number;
  state: BinState;
  territoryId: string | null;
}

export interface TerritoryLookup {
  label: Label | null;
  name: string;
  allowanceMin: number;
}

export function lookupTerritories(territories: TerritoryRecord[]): Map<string, TerritoryLookup> {
  return new Map(
    territories.map((t) => [t.id, { label: effectiveLabel(t), name: t.name.slice(0, 80) || 'Unnamed', allowanceMin: t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN }]),
  );
}

/** Browsing bins in time order. Away, idle-only and unobserved bins are dropped (they are gaps). */
export function toSlots(bins: BinRecord[], lookup: Map<string, TerritoryLookup>): Slot[] {
  return bins
    .filter((b) => !b.away && b.active_s > 0)
    .sort((a, b) => a.binStart - b.binStart)
    .map((b) => ({
      start: b.binStart,
      sec: Math.min(30, Math.max(1, b.active_s)),
      state: ((b.territoryId && lookup.get(b.territoryId)?.label) || 'other') as BinState,
      territoryId: b.territoryId,
    }));
}

/** Milliseconds of gap between two consecutive slots (0 when adjacent). */
const gapBetween = (a: Slot, b: Slot) => Math.max(0, b.start - (a.start + BIN_MS));

export interface RawBlock {
  startTs: number;
  endTs: number;
  seconds: number;
  /** Browsing seconds per territory inside the block. */
  byTerritory: Map<string, number>;
}

/** Deep blocks over all slots (callers filter to the day they start in). */
export function detectDeepBlocks(slots: Slot[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let open: { first: number; last: number; seconds: number; pending: number; pendingTerr: Map<string, number>; byTerritory: Map<string, number>; startTs: number; endTs: number } | null = null;

  const close = () => {
    if (open && open.seconds >= DEEP_BLOCK_MIN * 60) {
      blocks.push({ startTs: open.startTs, endTs: open.endTs, seconds: open.seconds, byTerritory: open.byTerritory });
    }
    open = null;
  };

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const prev = slots[i - 1];
    if (open && prev && gapBetween(prev, s) > MAX_PAUSE_GAP_MS) close();
    if (s.state === 'deep') {
      if (!open) {
        open = { first: i, last: i, seconds: 0, pending: 0, pendingTerr: new Map(), byTerritory: new Map(), startTs: s.start, endTs: s.start + BIN_MS };
      }
      // Accept the interruption that came before this Deep bin.
      open.seconds += open.pending + s.sec;
      open.pending = 0;
      open.pendingTerr.clear();
      open.last = i;
      open.endTs = s.start + BIN_MS;
      if (s.territoryId) open.byTerritory.set(s.territoryId, (open.byTerritory.get(s.territoryId) ?? 0) + s.sec);
    } else if (open) {
      open.pending += s.sec;
      if (open.pending > MAX_INTERRUPTION_S) close();
    }
  }
  close();
  return blocks;
}

export interface Switch {
  ts: number;
  fromTerritory: string | null;
  toTerritory: string | null;
  /** Browsing seconds from the switch to the next Deep bin; null when it never came back. */
  backSec: number | null;
}

/**
 * A switch is leaving Deep for a Shallow or Drain bin. Unlabelled bins in between neither count
 * as a switch nor cancel one.
 */
export function detectSwitches(slots: Slot[]): Switch[] {
  const out: Switch[] = [];
  let lastDeep: Slot | null = null;
  let armed = false;
  let open: Switch | null = null;
  let acc = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const prev = slots[i - 1];
    if (prev && gapBetween(prev, s) > MAX_PAUSE_GAP_MS) {
      open = null; // away for long: not a "return"
      armed = false;
    }
    if (s.state === 'deep') {
      if (open) {
        open.backSec = acc;
        open = null;
      }
      lastDeep = s;
      armed = true;
      acc = 0;
    } else if (open) {
      acc += s.sec;
    } else if (armed && lastDeep && (s.state === 'shallow' || s.state === 'drain')) {
      open = { ts: s.start, fromTerritory: lastDeep.territoryId, toTerritory: s.territoryId, backSec: null };
      out.push(open);
      armed = false;
      acc = s.sec;
    }
  }
  return out;
}

export interface StretchRaw {
  startTs: number;
  endTs: number;
  seconds: number;
  territoryId: string | null;
}

/** Longest uninterrupted run of Deep bins (a gap ends it only past the pause limit). */
export function strongestStretch(slots: Slot[]): StretchRaw | null {
  let best: StretchRaw | null = null;
  let cur: { startTs: number; endTs: number; seconds: number; by: Map<string, number> } | null = null;
  const finish = () => {
    if (cur && (!best || cur.seconds > best.seconds)) {
      const top = [...cur.by.entries()].sort((a, b) => b[1] - a[1])[0];
      best = { startTs: cur.startTs, endTs: cur.endTs, seconds: cur.seconds, territoryId: top ? top[0] : null };
    }
    cur = null;
  };
  slots.forEach((s, i) => {
    const prev = slots[i - 1];
    if (cur && prev && gapBetween(prev, s) > MAX_PAUSE_GAP_MS) finish();
    if (s.state === 'deep') {
      cur ??= { startTs: s.start, endTs: s.start, seconds: 0, by: new Map() };
      cur.seconds += s.sec;
      cur.endTs = s.start + BIN_MS;
      if (s.territoryId) cur.by.set(s.territoryId, (cur.by.get(s.territoryId) ?? 0) + s.sec);
    } else finish();
  });
  finish();
  return best;
}

const median = (v: number[]) => {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface FactsInput {
  date: string;
  /** Bins from about 3 h before the day to 3 h after it (so blocks crossing midnight are whole). */
  bins: BinRecord[];
  territories: TerritoryRecord[];
  nudges: NudgeRecord[];
  /** Stored facts of earlier days, any order. */
  previous: Array<{ date: string; facts: DailyFacts }>;
}

export function computeFacts(input: FactsInput): DailyFacts {
  const { date } = input;
  const from = dayStart(date);
  const to = dayEnd(date);
  const lookup = lookupTerritories(input.territories);
  const name = (id: string | null) => (id ? (lookup.get(id)?.name ?? 'Unnamed') : 'Unassigned');
  const slots = toSlots(input.bins, lookup);
  const today = slots.filter((s) => s.start >= from && s.start < to);

  // Deep blocks: those that start in this day.
  const blocks = detectDeepBlocks(slots)
    .filter((b) => b.startTs >= from && b.startTs < to)
    .map((b) => {
      const top = [...b.byTerritory.entries()].sort((a, c) => c[1] - a[1])[0];
      return { start: clock(b.startTs), end: clock(b.endTs), minutes: Math.round(b.seconds / 60), territory: name(top ? top[0] : null) };
    });

  // Totals by label and per Drain territory.
  const sec: Record<Label, number> = { deep: 0, shallow: 0, drain: 0 };
  const drainSec = new Map<string, number>();
  for (const s of today) {
    if (s.state === 'other') continue;
    sec[s.state] += s.sec;
    if (s.state === 'drain' && s.territoryId) drainSec.set(s.territoryId, (drainSec.get(s.territoryId) ?? 0) + s.sec);
  }
  const drainOver = [...drainSec.entries()]
    .map(([id, s]) => ({ territory: name(id), allowanceMin: Math.round(lookup.get(id)?.allowanceMin ?? DEFAULT_ALLOWANCE_MIN), minutesOver: Math.round(s / 60 - (lookup.get(id)?.allowanceMin ?? DEFAULT_ALLOWANCE_MIN)) }))
    .filter((d) => d.minutesOver >= 1)
    .sort((a, b) => b.minutesOver - a.minutesOver);

  // Residue and triggers.
  const switches = detectSwitches(slots).filter((s) => s.ts >= from && s.ts < to);
  const backs = switches.filter((s) => s.backSec != null).map((s) => s.backSec! / 60);
  const triggerCounts = new Map<string, { fromTerritory: string; toTerritory: string; hour: number; count: number }>();
  for (const s of switches) {
    const key = `${s.fromTerritory}|${s.toTerritory}|${new Date(s.ts).getHours()}`;
    const t = triggerCounts.get(key) ?? { fromTerritory: name(s.fromTerritory), toTerritory: name(s.toTerritory), hour: new Date(s.ts).getHours(), count: 0 };
    t.count++;
    triggerCounts.set(key, t);
  }
  const topTriggers = [...triggerCounts.values()].sort((a, b) => b.count - a.count || a.hour - b.hour).slice(0, MAX_TRIGGERS);

  const stretch = strongestStretch(today);
  const stretchOk = stretch && Math.round(stretch.seconds / 60) >= 1;

  // Nudges: unanswered counts as ignored.
  const nudges = input.nudges.filter((n) => n.ts >= from && n.ts < to);
  const accepted = nudges.filter((n) => n.response === 'back');
  const returns = accepted.filter((n) => n.secondsToReturn != null).map((n) => n.secondsToReturn! / 60);
  const medianReturn = median(returns);

  const facts: DailyFacts = {
    date,
    deepBlocks: {
      count: blocks.length,
      longestMin: blocks.reduce((m, b) => Math.max(m, b.minutes), 0),
      totalMin: blocks.reduce((m, b) => m + b.minutes, 0),
      blocks,
    },
    residue: { switchesOutOfDeep: switches.length, meanMinBackToDeep: backs.length ? round1(backs.reduce((a, b) => a + b, 0) / backs.length) : null },
    totalsMin: { deep: Math.round(sec.deep / 60), shallow: Math.round(sec.shallow / 60), drain: Math.round(sec.drain / 60) },
    drainOverAllowance: drainOver,
    topTriggers: topTriggers as DailyFacts['topTriggers'],
    strongestStretch: stretchOk
      ? { territory: name(stretch.territoryId), start: clock(stretch.startTs), end: clock(stretch.endTs), minutes: Math.round(stretch.seconds / 60) }
      : null,
    nudges: {
      shown: nudges.length,
      accepted: accepted.length,
      snoozed: nudges.filter((n) => n.response === 'snooze').length,
      ignored: nudges.filter((n) => n.response === 'ignored' || n.response == null).length,
      medianReturnMin: medianReturn == null ? null : round1(medianReturn),
    },
    vs7Day: null,
  };
  facts.vs7Day = compareWithWeek(facts, input.previous);
  return facts;
}

const overTotal = (f: DailyFacts) => f.drainOverAllowance.reduce((m, d) => m + d.minutesOver, 0);

/** The 7 days before `facts.date` (needs 7 stored days within the last 14); null otherwise. */
export function compareWithWeek(facts: DailyFacts, previous: Array<{ date: string; facts: DailyFacts }>): DailyFacts['vs7Day'] {
  const earliest = addDays(facts.date, -14);
  const prior = previous
    .filter((p) => p.date < facts.date && p.date >= earliest)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, VS7_DAYS);
  if (prior.length < VS7_DAYS) return null;
  const avg = (f: (x: DailyFacts) => number) => prior.reduce((m, p) => m + f(p.facts), 0) / prior.length;
  return {
    deepBlocksDelta: round1(facts.deepBlocks.count - avg((x) => x.deepBlocks.count)),
    drainOverDelta: round1(overTotal(facts) - avg(overTotal)),
  };
}
