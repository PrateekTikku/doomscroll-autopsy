import { BIN_MS } from '@/lib/observer/pipeline';

/**
 * First-order Markov model over 30-second bins (PDD 9.6, Markov mode). States are territory IDs plus
 * three internal ones: `unassigned` (no territory), `away` and `idle`. The last two are model
 * features only and are never shown or reported (D-45).
 *
 * Laplace smoothing uses a small alpha: with ~15 states and bins dominated by self-transitions,
 * alpha = 1 would add as much mass as hundreds of real observations and wash the matrix out.
 */
export const AWAY = 'away';
export const IDLE = 'idle';
export const UNASSIGNED = 'unassigned';
export const INTERNAL_STATES = [UNASSIGNED, AWAY, IDLE] as const;
export const DEFAULT_ALPHA = 0.05;
export const ROLLOUT_STEPS = 20;
export const BIN_MIN = BIN_MS / 60_000;

export interface StateBin {
  binStart: number;
  territoryId: string | null;
  away: boolean;
  idle: boolean;
}

/** Serialisable (stored in `models` as `markov`). */
export interface MarkovModel {
  alpha: number;
  states: string[];
  /** counts[from][to] = number of observed 30 s transitions. */
  counts: Record<string, Record<string, number>>;
  transitions: number;
  trainedThrough: number | null;
}

export function binState(b: Pick<StateBin, 'territoryId' | 'away' | 'idle'>): string {
  if (b.away) return AWAY;
  if (b.idle) return IDLE;
  return b.territoryId ?? UNASSIGNED;
}

/** `bins` must be sorted by `binStart`. A missing bin breaks the sequence: gaps are not transitions. */
export function trainMarkov(bins: StateBin[], opts: { alpha?: number } = {}): MarkovModel {
  const counts: Record<string, Record<string, number>> = {};
  const states = new Set<string>(INTERNAL_STATES);
  let transitions = 0;
  let prev: StateBin | null = null;
  for (const b of bins) {
    const s = binState(b);
    states.add(s);
    if (prev && b.binStart - prev.binStart === BIN_MS) {
      const from = binState(prev);
      const row = (counts[from] ??= {});
      row[s] = (row[s] ?? 0) + 1;
      transitions++;
    }
    prev = b;
  }
  return {
    alpha: opts.alpha ?? DEFAULT_ALPHA,
    states: [...states],
    counts,
    transitions,
    trainedThrough: prev ? prev.binStart : null,
  };
}

interface Compiled {
  index: Map<string, number>;
  /** Row-major S×S smoothed probabilities. */
  p: Float64Array;
}
const cache = new WeakMap<MarkovModel, Compiled>();

function compile(model: MarkovModel): Compiled {
  const hit = cache.get(model);
  if (hit) return hit;
  const S = model.states.length;
  const index = new Map(model.states.map((s, i) => [s, i]));
  const p = new Float64Array(S * S);
  for (let i = 0; i < S; i++) {
    const row = model.counts[model.states[i]!] ?? {};
    let total = 0;
    for (const c of Object.values(row)) total += c;
    if (total === 0) {
      p[i * S + i] = 1; // never left this state in the data: assume it stays
      continue;
    }
    const denom = total + model.alpha * S;
    for (let j = 0; j < S; j++) p[i * S + j] = ((row[model.states[j]!] ?? 0) + model.alpha) / denom;
  }
  const out = { index, p };
  cache.set(model, out);
  return out;
}

/** Next-state probabilities from `from`, most likely first. An unknown state stays where it is. */
export function nextDistribution(model: MarkovModel, from: string): Array<[string, number]> {
  const { index, p } = compile(model);
  const i = index.get(from);
  if (i == null) return [[from, 1]];
  const S = model.states.length;
  return model.states.map((s, j): [string, number] => [s, p[i * S + j]!]).sort((a, b) => b[1] - a[1]);
}

/** Expected minutes in each state over the next `steps` bins (PDD 9.6: 20 steps = 10 minutes). */
export function rollout(model: MarkovModel, from: string, steps = ROLLOUT_STEPS): Map<string, number> {
  const { index, p } = compile(model);
  const i0 = index.get(from);
  if (i0 == null) return new Map([[from, steps * BIN_MIN]]);
  const S = model.states.length;
  let dist = new Float64Array(S);
  dist[i0] = 1;
  const occ = new Float64Array(S);
  for (let t = 0; t < steps; t++) {
    const next = new Float64Array(S);
    for (let i = 0; i < S; i++) {
      const w = dist[i]!;
      if (w === 0) continue;
      for (let j = 0; j < S; j++) next[j]! += w * p[i * S + j]!;
    }
    dist = next;
    for (let j = 0; j < S; j++) occ[j]! += dist[j]!;
  }
  return new Map(model.states.map((s, j) => [s, occ[j]! * BIN_MIN]));
}
