import type { BinFeatures, Label, TerritoryRecord } from '@/lib/db';
import { AWAY, IDLE, rollout, UNASSIGNED, type MarkovModel } from './markov';
import { rulesPredictedMinutes } from './rules';

/**
 * Spiral score (PDD 9.5, D-43): predicted Drain minutes beyond the remaining allowance over the
 * next 10 minutes, divided by 10, capped at 1. Only time beyond the allowance counts.
 */
export const WINDOW_MIN = 10;
export const DEFAULT_ALLOWANCE_MIN = 15;
/** Markov takes over after this much history (PDD 4.3: "evening of day 1"). */
export const MARKOV_MIN_SPAN_MS = 24 * 3600_000;
export const MARKOV_MIN_LABELLED_BINS = 240;

export type Mode = 'rules' | 'markov' | 'gru';

export interface TerritoryInfo {
  label: Label | null;
  allowanceMin: number;
}

/**
 * The label scoring uses: the owner's confirmed label, else the M3 suggestion, so hour-0 detection
 * works before anything is confirmed (PDD 4.3, D-13).
 */
export function effectiveLabel(t: Pick<TerritoryRecord, 'label' | 'suggestedLabel'>): Label | null {
  return t.label ?? t.suggestedLabel;
}

export function territoryInfo(territories: TerritoryRecord[]): Map<string, TerritoryInfo> {
  return new Map(
    territories.map((t) => [t.id, { label: effectiveLabel(t), allowanceMin: t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN }]),
  );
}

export function selectMode(stats: { spanMs: number; labelledBins: number }): Mode {
  return stats.spanMs >= MARKOV_MIN_SPAN_MS && stats.labelledBins >= MARKOV_MIN_LABELLED_BINS ? 'markov' : 'rules';
}

export interface ScoreContext {
  mode: Mode;
  markov?: MarkovModel | null;
  /** GRU mode (PDD 9.6): expected minutes per state over the next 10 minutes, from the GRU's occupancy head. */
  gruPredicted?: Map<string, number> | null;
  /** Current state key: a territory ID, `unassigned`, `away` or `idle`. */
  state: string;
  features: Pick<BinFeatures, 'items_per_min' | 'scroll_px_s_mean' | 'video_skip_rate'>;
  /** Recent state keys, oldest first, ending with the current one. */
  history: string[];
  territories: Map<string, TerritoryInfo>;
  /** Drain minutes already spent today, per territory. */
  spentMin: Map<string, number>;
  /**
   * The current item is on a known feed origin but has no territory (hour 0): it is scored as a
   * pseudo Drain territory under the key `unassigned` with the default allowance.
   */
  unassignedFeed?: boolean;
}

export interface SpiralScore {
  score: number;
  mode: Mode;
  predictedMin: Map<string, number>;
  excessMin: Map<string, number>;
  currentLabel: Label | null;
  /** Remaining allowance of the current territory (Drain only). */
  remainingCurrentMin: number | null;
}

/** Allowance left for a Drain territory today, floored at 0. */
export function remainingAllowance(allowanceMin: number, spentMin: number): number {
  return Math.max(0, allowanceMin - spentMin);
}

function infoFor(ctx: ScoreContext, key: string): TerritoryInfo | null {
  if (key === UNASSIGNED) return ctx.unassignedFeed ? { label: 'drain', allowanceMin: DEFAULT_ALLOWANCE_MIN } : null;
  if (key === AWAY || key === IDLE) return null;
  return ctx.territories.get(key) ?? null;
}

/** Largest Drain territory by minutes spent today, else the first Drain territory. */
function fallbackDrain(ctx: ScoreContext): string | null {
  let best: string | null = null;
  let bestMin = -1;
  for (const [id, info] of ctx.territories) {
    if (info.label !== 'drain') continue;
    const m = ctx.spentMin.get(id) ?? 0;
    if (m > bestMin) {
      best = id;
      bestMin = m;
    }
  }
  return best;
}

function minutesInCurrent(history: string[]): number {
  const cur = history[history.length - 1];
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === cur; i--) n++;
  return n * 0.5;
}

function leftDeepRecently(ctx: ScoreContext): boolean {
  const cur = ctx.territories.get(ctx.state);
  if (cur?.label === 'deep') return false;
  return ctx.history.slice(-10).some((s) => ctx.territories.get(s)?.label === 'deep');
}

export function scoreSpiral(ctx: ScoreContext): SpiralScore {
  const cur = infoFor(ctx, ctx.state);
  const predicted = new Map<string, number>();
  if (ctx.mode === 'gru' && ctx.gruPredicted) {
    for (const [state, min] of ctx.gruPredicted) {
      if (infoFor(ctx, state)?.label === 'drain') predicted.set(state, min);
    }
  } else if (ctx.mode === 'markov' && ctx.markov) {
    for (const [state, min] of rollout(ctx.markov, ctx.state)) {
      if (infoFor(ctx, state)?.label === 'drain') predicted.set(state, min);
    }
  } else {
    const feed = cur?.label === 'drain';
    const min = rulesPredictedMinutes({
      features: ctx.features,
      feed,
      minutesInCurrent: minutesInCurrent(ctx.history),
      leftDeepRecently: leftDeepRecently(ctx),
    });
    const target = feed ? ctx.state : fallbackDrain(ctx);
    if (target) predicted.set(target, min);
  }
  const excess = new Map<string, number>();
  let total = 0;
  for (const [id, min] of predicted) {
    const info = infoFor(ctx, id);
    if (!info) continue;
    const e = Math.max(0, min - remainingAllowance(info.allowanceMin, ctx.spentMin.get(id) ?? 0));
    excess.set(id, e);
    total += e;
  }
  return {
    score: Math.min(1, total / WINDOW_MIN),
    mode: ctx.mode === 'gru' && ctx.gruPredicted ? 'gru' : ctx.mode === 'markov' && ctx.markov ? 'markov' : 'rules',
    predictedMin: predicted,
    excessMin: excess,
    currentLabel: cur?.label ?? null,
    remainingCurrentMin: cur?.label === 'drain' ? remainingAllowance(cur.allowanceMin, ctx.spentMin.get(ctx.state) ?? 0) : null,
  };
}

/** Drain minutes spent per territory from bins (active seconds), for the local day `[from, to)`. */
export function drainSpent(
  bins: Array<{ binStart: number; territoryId: string | null; active_s?: number }>,
  territories: Map<string, TerritoryInfo>,
  from: number,
  to: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bins) {
    if (b.binStart < from || b.binStart >= to || b.territoryId == null) continue;
    if (territories.get(b.territoryId)?.label !== 'drain') continue;
    out.set(b.territoryId, (out.get(b.territoryId) ?? 0) + (b.active_s ?? 30) / 60);
  }
  return out;
}
