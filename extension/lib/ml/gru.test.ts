import { describe, expect, it } from 'vitest';
import type { BinRecord } from '@/lib/db';
import { BIN_MS } from '@/lib/observer/pipeline';
import {
  buildTrainingSet,
  buildVocab,
  DENSE_DIM,
  denseFeatures,
  gruForward,
  HORIZON_BINS,
  predictedMinutes,
  runningContexts,
  SEQ_LEN,
  velocityStats,
  windowAt,
} from './gru';
import { buildKerasModel, extractWeights, loadTf, trainGru } from './gru-train';
import type { TerritoryInfo } from './scoring';

const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime();
const info = new Map<string, TerritoryInfo>([
  ['work', { label: 'deep', allowanceMin: 15 }],
  ['mail', { label: 'shallow', allowanceMin: 15 }],
  ['reels', { label: 'drain', allowanceMin: 15 }],
]);

function bin(i: number, territoryId: string | null, extra: Partial<BinRecord> = {}): BinRecord {
  return {
    binStart: T0 + i * BIN_MS,
    active_s: 30,
    territoryId,
    away: false,
    idle: false,
    nudgeShown: false,
    nudgeResponse: null,
    scroll_px_s_mean: territoryId === 'reels' ? 120 : 10,
    items_per_min: territoryId === 'reels' ? 9 : 1,
    mean_dwell_ms: 3000,
    video_skip_rate: territoryId === 'reels' ? 0.5 : 0,
    tab_switches: 0,
    away_s: 0,
    idle_s: 0,
    ...extra,
  };
}

/** A repeating day: 30 bins of work, 10 of mail, 20 of reels. Fully predictable from the current state and run length. */
function cycle(nBins: number): BinRecord[] {
  const out: BinRecord[] = [];
  const pattern = ['work', 'mail', 'reels'] as const;
  const lens = [30, 10, 20];
  let i = 0;
  while (i < nBins) {
    for (let p = 0; p < 3 && i < nBins; p++) for (let k = 0; k < lens[p]! && i < nBins; k++) out.push(bin(i++, pattern[p]!));
  }
  return out;
}

describe('features and windows', () => {
  it('builds a vocabulary with the internal states first and territories by frequency', () => {
    const bins = [...cycle(120), bin(120, null, { away: true })];
    const v = buildVocab(bins);
    expect(v.slice(0, 3)).toEqual(['unassigned', 'away', 'idle']);
    expect(v.slice(3)).toEqual(['work', 'reels', 'mail']);
    expect(buildVocab(bins, 4)).toHaveLength(4);
  });

  it('tracks run length and minutes since Deep, resetting at gaps', () => {
    const bins = [bin(0, 'work'), bin(1, 'work'), bin(2, 'mail'), bin(3, 'mail'), bin(10, 'mail')];
    const c = runningContexts(bins, info);
    expect(c.map((x) => x.minInCurrent)).toEqual([0.5, 1, 0.5, 1, 0.5]);
    expect(c[1]!.minSinceDeep).toBe(0);
    expect(c[3]!.minSinceDeep).toBe(1);
    expect(c[4]!.minSinceDeep).toBe(60); // the gap reset it
  });

  it('has DENSE_DIM features in range, with the label one-hot and nudge response', () => {
    const b = bin(0, 'reels', { nudgeShown: true, nudgeResponse: 'ignored' });
    const stats = velocityStats(cycle(60));
    const f = denseFeatures(b, { minInCurrent: 3, minSinceDeep: 12 }, info, stats);
    expect(f).toHaveLength(DENSE_DIM);
    expect(f.slice(0, 4)).toEqual([0, 0, 1, 0]);
    expect(f[f.length - 1]).toBe(1);
    expect(f.every(Number.isFinite)).toBe(true);
  });

  it('makes training windows only from contiguous stretches, with occupancy targets that sum to 1', () => {
    const bins = [...cycle(200), ...cycle(150).map((b, i) => ({ ...b, binStart: T0 + (400 + i) * BIN_MS }))];
    const vocab = buildVocab(bins);
    const set = buildTrainingSet(bins, info, vocab, velocityStats(bins), 10_000);
    expect(set.ids.every((w) => w.length === SEQ_LEN)).toBe(true);
    for (const occ of set.occupancy) expect(occ.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // no window may straddle the gap: 200 bins then a jump to 400
    const perRun = (n: number) => Math.max(0, n - SEQ_LEN - HORIZON_BINS + 1);
    expect(set.ids.length).toBe(perRun(200) + perRun(150));
  });

  it('subsamples to the maximum', () => {
    const bins = cycle(1000);
    const set = buildTrainingSet(bins, info, buildVocab(bins), velocityStats(bins), 100);
    expect(set.ids.length).toBeLessThanOrEqual(100);
    expect(set.ids.length).toBeGreaterThan(50);
  });
});

describe('TF.js GRU', () => {
  it('the plain-TypeScript forward pass matches the TF.js model', async () => {
    const { tf } = await loadTf('cpu');
    const bins = cycle(120);
    const vocab = buildVocab(bins);
    const stats = velocityStats(bins);
    const keras = buildKerasModel(tf, vocab.length, 3);
    // Give the biases non-zero values so the test would notice a wrong gate order.
    const gru = keras.getLayer('gru');
    gru.setWeights(gru.getWeights().map((w, i) => (i === 2 ? tf.randomNormal(w.shape, 0, 0.3, 'float32', 5) : w)));
    const ctxs = runningContexts(bins, info);
    const w = windowAt(bins, ctxs, 70, vocab, info, stats);
    const [nextT, occT] = keras.predict([tf.tensor2d([w.ids], [1, w.ids.length], 'int32'), tf.tensor3d([w.dense])]) as [import('@tensorflow/tfjs').Tensor, import('@tensorflow/tfjs').Tensor];
    const expectedNext = Array.from(await nextT.data());
    const expectedOcc = Array.from(await occT.data());
    const weights = await extractWeights(tf, keras);
    const mine = gruForward({ version: 1, vocab, stats, weights, trainedThrough: null, trainWindows: 0, epochs: 0, finalLoss: null, backend: 'cpu' }, w);
    mine.next.forEach((p, i) => expect(p).toBeCloseTo(expectedNext[i]!, 4));
    mine.occupancy.forEach((p, i) => expect(p).toBeCloseTo(expectedOcc[i]!, 4));
    expect(mine.next.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('learns a repeating day: next-state and occupancy beat the base rates', async () => {
    const bins = cycle(1500);
    const train = bins.slice(0, 1200);
    const model = await trainGru(train, info, { epochs: 6, maxWindows: 600, backend: 'cpu' });
    expect(model).not.toBeNull();
    const vocab = model!.vocab;
    const stats = model!.stats;
    const ctxs = runningContexts(bins, info);
    let hit = 0;
    let n = 0;
    let occErr = 0;
    let baseErr = 0;
    const base = new Array<number>(vocab.length).fill(0);
    for (const b of train) base[vocab.indexOf(b.territoryId!)]! += 1 / train.length;
    for (let i = 1210; i < 1430; i += 3) {
      const w = windowAt(bins, ctxs, i, vocab, info, stats);
      const out = gruForward(model!, w);
      const truthNext = vocab.indexOf(bins[i + 1]!.territoryId!);
      if (out.next.indexOf(Math.max(...out.next)) === truthNext) hit++;
      n++;
      const truthOcc = new Array<number>(vocab.length).fill(0);
      for (let j = i + 1; j <= i + HORIZON_BINS; j++) truthOcc[vocab.indexOf(bins[j]!.territoryId!)]! += 1 / HORIZON_BINS;
      occErr += out.occupancy.reduce((a, p, k) => a + Math.abs(p - truthOcc[k]!), 0);
      baseErr += base.reduce((a, p, k) => a + Math.abs(p - truthOcc[k]!), 0);
    }
    expect(hit / n).toBeGreaterThan(0.8); // the base rate is 0.5; the few misses sit on the phase boundaries
    expect(occErr / n).toBeLessThan(baseErr / n);
    const minutes = predictedMinutes(model!, windowAt(bins, ctxs, 1229, vocab, info, stats));
    expect([...minutes.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(10, 4);
  }, 120_000);

  it('returns null when there are too few windows', async () => {
    expect(await trainGru(cycle(80), info, { backend: 'cpu' })).toBeNull();
  });
});
