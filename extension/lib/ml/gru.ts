import type { BinRecord, Label, NudgeResponse } from '@/lib/db';
import { BIN_MS } from '@/lib/observer/pipeline';
import { AWAY, binState, IDLE, INTERNAL_STATES, UNASSIGNED } from './markov';
import type { TerritoryInfo } from './scoring';

/**
 * GRU predictor (PDD 9.6, Should tier, D-20). Training lives in `gru-train.ts` (TF.js, offscreen
 * document); everything here is plain TypeScript so the service worker can run inference without
 * loading TF.js: a 1-layer GRU forward pass over ≤ 40 steps is a few hundred thousand multiplies.
 *
 * Input per bin: a learned territory embedding (16d) plus D dense features: label one-hot (4),
 * velocity features (7, standardised), time of day sin/cos, minutes in the current state,
 * minutes since the last Deep bin, nudge-shown flag and the last nudge response (3).
 * Heads (both softmax over the vocabulary, from the final hidden state): the next bin's state, and
 * the average state occupancy over the next 20 bins, which gives `predicted_t` (minutes in t over
 * the next 10 minutes = occupancy × 10).
 */
export const SEQ_LEN = 40;
export const HORIZON_BINS = 20;
export const EMBED_DIM = 16;
export const HIDDEN = 64;
export const MAX_VOCAB = 40;
export const VELOCITY_KEYS = ['scroll_px_s_mean', 'items_per_min', 'mean_dwell_ms', 'video_skip_rate', 'tab_switches', 'away_s', 'idle_s'] as const;
const RESPONSES: NudgeResponse[] = ['back', 'snooze', 'ignored'];
/** label(4) + velocity(7) + time(2) + minInCurrent + minSinceDeep + nudgeShown + response(3) */
export const DENSE_DIM = 4 + VELOCITY_KEYS.length + 2 + 1 + 1 + 1 + RESPONSES.length;
const WINDOW_MIN = (HORIZON_BINS * BIN_MS) / 60_000;

export interface GruWeights {
  /** [vocab × EMBED_DIM] row-major */
  embedding: number[];
  /** [(EMBED_DIM + DENSE_DIM) × 3·HIDDEN], gate order z, r, h */
  kernel: number[];
  /** [HIDDEN × 3·HIDDEN] */
  recurrent: number[];
  /** [3·HIDDEN] */
  bias: number[];
  nextW: number[];
  nextB: number[];
  occW: number[];
  occB: number[];
}

/** Serialisable; stored in `models` as `gru`. */
export interface GruModel {
  version: 1;
  vocab: string[];
  /** Mean and std of the 7 velocity features over the training bins. */
  stats: { mean: number[]; std: number[] };
  weights: GruWeights;
  trainedThrough: number | null;
  trainWindows: number;
  epochs: number;
  finalLoss: number | null;
  backend: string;
}

export function buildVocab(bins: Array<Pick<BinRecord, 'territoryId' | 'away' | 'idle'>>, maxVocab = MAX_VOCAB): string[] {
  const freq = new Map<string, number>();
  for (const b of bins) freq.set(binState(b), (freq.get(binState(b)) ?? 0) + 1);
  const territories = [...freq.entries()]
    .filter(([s]) => !(INTERNAL_STATES as readonly string[]).includes(s))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, maxVocab - INTERNAL_STATES.length)
    .map(([s]) => s);
  return [...INTERNAL_STATES, ...territories];
}

export function velocityStats(bins: BinRecord[]): { mean: number[]; std: number[] } {
  const mean = VELOCITY_KEYS.map(() => 0);
  const m2 = VELOCITY_KEYS.map(() => 0);
  bins.forEach((b, n) => {
    VELOCITY_KEYS.forEach((k, j) => {
      const x = b[k] ?? 0;
      const d = x - mean[j]!;
      mean[j]! += d / (n + 1);
      m2[j]! += d * (x - mean[j]!);
    });
  });
  const n = Math.max(1, bins.length);
  return { mean, std: m2.map((v) => Math.max(1e-6, Math.sqrt(v / n)) || 1) };
}

/** Per-bin context that depends on the history before it: run length in the current state, time since Deep. */
export interface RunningContext {
  minInCurrent: number;
  minSinceDeep: number;
}

/** Computes `RunningContext` for every bin of one list (sorted, gaps reset the run). */
export function runningContexts(bins: BinRecord[], territories: Map<string, TerritoryInfo>): RunningContext[] {
  const out: RunningContext[] = [];
  let run = 0;
  let sinceDeep = 60;
  let prev: BinRecord | null = null;
  for (const b of bins) {
    const contiguous = prev != null && b.binStart - prev.binStart === BIN_MS;
    if (!contiguous) {
      run = 0;
      sinceDeep = 60;
    }
    const s = binState(b);
    run = contiguous && binState(prev!) === s ? run + 1 : 1;
    sinceDeep = territories.get(s)?.label === 'deep' && !b.away && !b.idle ? 0 : Math.min(60, sinceDeep + 0.5);
    out.push({ minInCurrent: run * 0.5, minSinceDeep: sinceDeep });
    prev = b;
  }
  return out;
}

const LABELS: Array<Label | null> = ['deep', 'shallow', 'drain', null];

/** The dense features of one bin (D = DENSE_DIM numbers). */
export function denseFeatures(b: BinRecord, ctx: RunningContext, territories: Map<string, TerritoryInfo>, stats: GruModel['stats']): number[] {
  const label = territories.get(binState(b))?.label ?? null;
  const hour = new Date(b.binStart);
  const frac = (hour.getHours() * 60 + hour.getMinutes() + hour.getSeconds() / 60) / 1440;
  return [
    ...LABELS.map((l) => (l === label ? 1 : 0)),
    ...VELOCITY_KEYS.map((k, j) => Math.max(-5, Math.min(5, ((b[k] ?? 0) - stats.mean[j]!) / stats.std[j]!))),
    Math.sin(2 * Math.PI * frac),
    Math.cos(2 * Math.PI * frac),
    Math.min(1, ctx.minInCurrent / 20),
    Math.min(1, ctx.minSinceDeep / 60),
    b.nudgeShown ? 1 : 0,
    ...RESPONSES.map((r) => (b.nudgeResponse === r ? 1 : 0)),
  ];
}

export const stateIndex = (vocab: string[], state: string): number => {
  const i = vocab.indexOf(state);
  return i >= 0 ? i : vocab.indexOf(UNASSIGNED);
};

export interface Window {
  ids: number[];
  dense: number[][];
}

/** The last ≤ SEQ_LEN bins ending at index `end` (inclusive), as model input. `ctxs` aligns with `bins`. */
export function windowAt(bins: BinRecord[], ctxs: RunningContext[], end: number, vocab: string[], territories: Map<string, TerritoryInfo>, stats: GruModel['stats']): Window {
  const from = Math.max(0, end - SEQ_LEN + 1);
  const ids: number[] = [];
  const dense: number[][] = [];
  for (let i = from; i <= end; i++) {
    ids.push(stateIndex(vocab, binState(bins[i]!)));
    dense.push(denseFeatures(bins[i]!, ctxs[i]!, territories, stats));
  }
  return { ids, dense };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function softmax(logits: number[]): number[] {
  const m = Math.max(...logits);
  const e = logits.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/**
 * Forward pass equal to TF.js's `gru` layer with `recurrentActivation: 'sigmoid'` (reset gate applied
 * before the recurrent matmul): z = σ(xW_z + hU_z + b_z), r = σ(…), ĥ = tanh(xW_h + (r∘h)U_h + b_h),
 * h = z∘h + (1−z)∘ĥ. Gate order in the matrices is z, r, h.
 */
export function gruForward(model: GruModel, w: Window): { next: number[]; occupancy: number[] } {
  const { weights: W } = model;
  const V = model.vocab.length;
  const H = HIDDEN;
  const IN = EMBED_DIM + DENSE_DIM;
  let h = new Array<number>(H).fill(0);
  for (let t = 0; t < w.ids.length; t++) {
    const x = new Array<number>(IN);
    const row = w.ids[t]! * EMBED_DIM;
    for (let k = 0; k < EMBED_DIM; k++) x[k] = W.embedding[row + k]!;
    for (let k = 0; k < DENSE_DIM; k++) x[EMBED_DIM + k] = w.dense[t]![k]!;
    const xz = new Array<number>(3 * H);
    for (let j = 0; j < 3 * H; j++) {
      let s = W.bias[j]!;
      for (let k = 0; k < IN; k++) s += x[k]! * W.kernel[k * 3 * H + j]!;
      xz[j] = s;
    }
    const hu = new Array<number>(2 * H).fill(0); // h·U for z and r
    for (let k = 0; k < H; k++) {
      const hk = h[k]!;
      if (hk === 0) continue;
      for (let j = 0; j < 2 * H; j++) hu[j]! += hk * W.recurrent[k * 3 * H + j]!;
    }
    const z = new Array<number>(H);
    const r = new Array<number>(H);
    for (let j = 0; j < H; j++) {
      z[j] = sigmoid(xz[j]! + hu[j]!);
      r[j] = sigmoid(xz[H + j]! + hu[H + j]!);
    }
    const hh = new Array<number>(H);
    for (let j = 0; j < H; j++) {
      let s = xz[2 * H + j]!;
      for (let k = 0; k < H; k++) s += r[k]! * h[k]! * W.recurrent[k * 3 * H + 2 * H + j]!;
      hh[j] = Math.tanh(s);
    }
    h = h.map((hv, j) => z[j]! * hv + (1 - z[j]!) * hh[j]!);
  }
  const head = (Wm: number[], b: number[]) => {
    const logits = new Array<number>(V);
    for (let j = 0; j < V; j++) {
      let s = b[j]!;
      for (let k = 0; k < H; k++) s += h[k]! * Wm[k * V + j]!;
      logits[j] = s;
    }
    return softmax(logits);
  };
  return { next: head(W.nextW, W.nextB), occupancy: head(W.occW, W.occB) };
}

/** Expected minutes per state over the next 10 minutes from the occupancy head, keyed by state. */
export function predictedMinutes(model: GruModel, w: Window): Map<string, number> {
  const { occupancy } = gruForward(model, w);
  return new Map(model.vocab.map((s, i) => [s, occupancy[i]! * WINDOW_MIN]));
}

export interface TrainingSet {
  ids: number[][]; // [N][SEQ_LEN]
  dense: number[][][]; // [N][SEQ_LEN][D]
  next: number[]; // [N] state index
  occupancy: number[][]; // [N][V]
}

/**
 * Training windows from sorted bins: SEQ_LEN contiguous bins as input, the next bin as head-1 target
 * and the occupancy over the following HORIZON_BINS as head-2 target. Only fully contiguous
 * stretches qualify (a gap breaks the sequence, as in Markov). At most `max` windows, evenly spread.
 */
export function buildTrainingSet(bins: BinRecord[], territories: Map<string, TerritoryInfo>, vocab: string[], stats: GruModel['stats'], max = 2500): TrainingSet {
  const ctxs = runningContexts(bins, territories);
  // run start index for each i: smallest j such that bins j..i are contiguous
  const starts: number[] = [];
  for (let i = 0; i < bins.length; i++) starts.push(i > 0 && bins[i]!.binStart - bins[i - 1]!.binStart === BIN_MS ? starts[i - 1]! : i);
  const ends: number[] = []; // end of contiguous run containing i
  for (let i = bins.length - 1; i >= 0; i--) ends[i] = i < bins.length - 1 && bins[i + 1]!.binStart - bins[i]!.binStart === BIN_MS ? ends[i + 1]! : i;
  const candidates: number[] = [];
  for (let i = SEQ_LEN - 1; i < bins.length; i++) if (starts[i]! <= i - SEQ_LEN + 1 && ends[i]! >= i + HORIZON_BINS) candidates.push(i);
  const stride = Math.max(1, Math.ceil(candidates.length / max));
  const set: TrainingSet = { ids: [], dense: [], next: [], occupancy: [] };
  const V = vocab.length;
  for (let c = 0; c < candidates.length; c += stride) {
    const i = candidates[c]!;
    const w = windowAt(bins, ctxs, i, vocab, territories, stats);
    const occ = new Array<number>(V).fill(0);
    for (let j = i + 1; j <= i + HORIZON_BINS; j++) occ[stateIndex(vocab, binState(bins[j]!))]! += 1 / HORIZON_BINS;
    set.ids.push(w.ids);
    set.dense.push(w.dense);
    set.next.push(stateIndex(vocab, binState(bins[i + 1]!)));
    set.occupancy.push(occ);
  }
  return set;
}

export { AWAY, IDLE };
