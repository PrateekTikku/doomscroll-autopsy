import type { BinRecord } from '@/lib/db';
import { BIN_MS } from '@/lib/observer/pipeline';
import { binState, nextDistribution, trainMarkov, type MarkovModel } from './markov';
import { remainingAllowance, scoreSpiral, WINDOW_MIN, type Mode, type TerritoryInfo } from './scoring';

/**
 * Evaluation harness (PDD 9.6, D-36): rules vs Markov on the held-out latest day.
 *
 * - Next territory: top-1 / top-3 over consecutive bins. Rules has no territory predictor, so its
 *   baseline is persistence (top-1 = stay; top-3 = stay + the two most frequent training states).
 *   Because bins are dominated by staying put, `switchTop3` repeats top-3 over only the bins where
 *   the next state differs from the current one.
 * - Spiral AUC: the score at each bin against "actual Drain beyond the remaining allowance ≥ 5
 *   minutes in the next 10". Undefined (null) when the held-out data has no positives or no negatives.
 */
export const SPIRAL_POSITIVE_MIN = 5;
export const MIN_BINS_TO_EVALUATE = 60;
export const MIN_TRAIN_BINS_FOR_DAY_SPLIT = 120;
const HORIZON_BINS = (WINDOW_MIN * 60_000) / BIN_MS;

export type SplitKind = 'latest-day' | 'within-day-70-30' | 'none';

export interface ModeMetrics {
  top1: number | null;
  top3: number | null;
  switchTop3: number | null;
  switchN: number;
  auc: number | null;
  nNext: number;
  nScore: number;
  positives: number;
}

export interface EvalResult {
  ranAt: number;
  split: SplitKind;
  trainBins: number;
  testBins: number;
  testFrom: number | null;
  rules: ModeMetrics;
  markov: ModeMetrics;
}

export function localDayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Rank-based (Mann–Whitney) AUC with average ranks for ties. Null without both classes. */
export function auc(scores: number[], positive: boolean[]): number | null {
  const n = scores.length;
  const pos = positive.filter(Boolean).length;
  const neg = n - pos;
  if (pos === 0 || neg === 0) return null;
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]);
  let rankSumPos = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (positive[order[k]![1]]) rankSumPos += avgRank;
    i = j + 1;
  }
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Is `truth` among the first `k` entries of `ranked`? */
export const inTopK = (ranked: string[], truth: string, k: number) => ranked.slice(0, k).includes(truth);

export interface Split {
  kind: SplitKind;
  /** Index of the first test bin; bins before it are training data. */
  testStart: number;
}

export function chooseSplit(bins: Array<Pick<BinRecord, 'binStart'>>): Split {
  if (bins.length < MIN_BINS_TO_EVALUATE) return { kind: 'none', testStart: bins.length };
  const latestDay = localDayStart(bins[bins.length - 1]!.binStart);
  const firstOfLatest = bins.findIndex((b) => b.binStart >= latestDay);
  if (firstOfLatest >= MIN_TRAIN_BINS_FOR_DAY_SPLIT) return { kind: 'latest-day', testStart: firstOfLatest };
  return { kind: 'within-day-70-30', testStart: Math.floor(bins.length * 0.7) };
}

function emptyMetrics(): ModeMetrics {
  return { top1: null, top3: null, switchTop3: null, switchN: 0, auc: null, nNext: 0, nScore: 0, positives: 0 };
}

const ratio = (hit: number, n: number) => (n > 0 ? hit / n : null);

/** `bins` sorted by `binStart`. Pure: no storage. */
export function evaluateModes(bins: BinRecord[], territories: Map<string, TerritoryInfo>, opts: { now?: number; split?: Split } = {}): EvalResult {
  const split = opts.split ?? chooseSplit(bins);
  const result: EvalResult = {
    ranAt: opts.now ?? Date.now(),
    split: split.kind,
    trainBins: split.testStart,
    testBins: bins.length - split.testStart,
    testFrom: bins[split.testStart]?.binStart ?? null,
    rules: emptyMetrics(),
    markov: emptyMetrics(),
  };
  if (split.kind === 'none') return result;

  const train = bins.slice(0, split.testStart);
  const model: MarkovModel = trainMarkov(train);
  const freq = new Map<string, number>();
  for (const b of train) freq.set(binState(b), (freq.get(binState(b)) ?? 0) + 1);
  const common = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);

  const states = bins.map(binState);
  const lastStart = bins[bins.length - 1]!.binStart;
  const agg = {
    rules: { hit1: 0, hit3: 0, sw: 0, swHit: 0, n: 0, scores: [] as number[], pos: [] as boolean[] },
    markov: { hit1: 0, hit3: 0, sw: 0, swHit: 0, n: 0, scores: [] as number[], pos: [] as boolean[] },
  };

  // Drain minutes spent so far per local day, built up as we walk forward.
  let dayKey = -1;
  let spent = new Map<string, number>();
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]!;
    const day = localDayStart(b.binStart);
    if (day !== dayKey) {
      dayKey = day;
      spent = new Map();
    }
    if (b.territoryId != null && territories.get(b.territoryId)?.label === 'drain') {
      spent.set(b.territoryId, (spent.get(b.territoryId) ?? 0) + b.active_s / 60);
    }
    if (i < split.testStart) continue;

    const next = bins[i + 1];
    if (next && next.binStart - b.binStart === BIN_MS) {
      const truth = states[i + 1]!;
      const switched = truth !== states[i];
      const ranked = {
        rules: [states[i]!, ...common.filter((s) => s !== states[i])],
        markov: nextDistribution(model, states[i]!).map(([s]) => s),
      };
      for (const m of ['rules', 'markov'] as const) {
        const a = agg[m];
        a.n++;
        if (inTopK(ranked[m], truth, 1)) a.hit1++;
        if (inTopK(ranked[m], truth, 3)) a.hit3++;
        if (switched) {
          a.sw++;
          if (inTopK(ranked[m], truth, 3)) a.swHit++;
        }
      }
    }

    // Spiral label: only where the full 10-minute future is inside the data.
    if (b.binStart + HORIZON_BINS * BIN_MS > lastStart) continue;
    const future = new Map<string, number>();
    for (let j = i + 1; j < bins.length && bins[j]!.binStart <= b.binStart + HORIZON_BINS * BIN_MS; j++) {
      const t = bins[j]!.territoryId;
      if (t != null && territories.get(t)?.label === 'drain') future.set(t, (future.get(t) ?? 0) + (bins[j]!.active_s || BIN_MS / 1000) / 60);
    }
    let excess = 0;
    for (const [t, min] of future) excess += Math.max(0, min - remainingAllowance(territories.get(t)!.allowanceMin, spent.get(t) ?? 0));
    const positive = excess >= SPIRAL_POSITIVE_MIN;

    const history = states.slice(Math.max(0, i - 19), i + 1);
    for (const mode of ['rules', 'markov'] as const satisfies readonly Mode[]) {
      const s = scoreSpiral({
        mode,
        markov: mode === 'markov' ? model : null,
        state: states[i]!,
        features: b,
        history,
        territories,
        spentMin: spent,
      });
      agg[mode].scores.push(s.score);
      agg[mode].pos.push(positive);
    }
  }

  for (const m of ['rules', 'markov'] as const) {
    const a = agg[m];
    result[m] = {
      top1: ratio(a.hit1, a.n),
      top3: ratio(a.hit3, a.n),
      switchTop3: ratio(a.swHit, a.sw),
      switchN: a.sw,
      auc: auc(a.scores, a.pos),
      nNext: a.n,
      nScore: a.scores.length,
      positives: a.pos.filter(Boolean).length,
    };
  }
  return result;
}
