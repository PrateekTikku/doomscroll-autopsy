import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { put } from '@/lib/db';
import { evaluateModes, type EvalResult, type ModeMetrics } from './eval';
import { refreshPrediction, getStoredMode } from './evaluate';
import type { GruModel } from './gru';
import { decidePromotion, getPromotedGru, MODEL_GRU, MODEL_GRU_EVAL, type GruEvalRecord } from './gru-promote';
import { trainGru } from './gru-train';
import { scoreSpiral } from './scoring';
import type { BinRecord } from '@/lib/db';
import { BIN_MS } from '@/lib/observer/pipeline';
import { selectMode } from './scoring';

const m = (auc: number | null): ModeMetrics => ({ top1: 0.5, top3: 0.9, switchTop3: 0.5, switchN: 10, auc, nNext: 100, nScore: 100, positives: 10 });
const res = (split: EvalResult['split'], gru: number | null, markov: number | null): Pick<EvalResult, 'split' | 'markov' | 'gru'> => ({ split, markov: m(markov), gru: m(gru) });

describe('GRU promotion (D-20)', () => {
  it('promotes only when the GRU AUC is clearly higher than Markov on the latest day', () => {
    expect(decidePromotion(res('latest-day', 0.9, 0.8)).promoted).toBe(true);
    expect(decidePromotion(res('latest-day', 0.802, 0.8)).promoted).toBe(false); // inside the noise margin
    expect(decidePromotion(res('latest-day', 0.8, 0.8))).toMatchObject({ promoted: false, reason: expect.stringContaining('ties go to Markov') });
    expect(decidePromotion(res('latest-day', 0.7, 0.8)).promoted).toBe(false);
  });
  it('does not promote without a measurable AUC, a full held-out day, or a GRU', () => {
    expect(decidePromotion(res('latest-day', 0.9, null)).promoted).toBe(false);
    expect(decidePromotion(res('latest-day', null, 0.5)).promoted).toBe(false);
    expect(decidePromotion(res('within-day-70-30', 0.9, 0.5)).promoted).toBe(false);
    expect(decidePromotion({ split: 'none', markov: m(0.5) }).promoted).toBe(false);
  });
});

const fakeModel = { version: 1, vocab: ['unassigned', 'away', 'idle'], stats: { mean: [], std: [] }, weights: {}, trainedThrough: null, trainWindows: 1, epochs: 1, finalLoss: 0, backend: 'cpu' } as unknown as GruModel;
const record = (promoted: boolean): GruEvalRecord => ({ ranAt: 1, promoted, reason: 'x', gruAuc: 0.9, markovAuc: 0.8, rulesAuc: 0.5, gruTop1: 0.5, markovTop1: 0.5, gruTop3: 0.9, markovTop3: 0.9, split: 'latest-day', trainBins: 1, testBins: 1, trainWindows: 1, backend: 'cpu', trainMs: 1 });

describe('mode selection with a promoted GRU', () => {
  it('only a promoted GRU changes the mode, and only once Markov would be active', async () => {
    await put('models', { name: MODEL_GRU, updatedAt: 1, data: fakeModel });
    await put('models', { name: MODEL_GRU_EVAL, updatedAt: 1, data: record(false) });
    expect(await getPromotedGru()).toBeNull();
    await put('models', { name: MODEL_GRU_EVAL, updatedAt: 2, data: record(true) });
    expect(await getPromotedGru()).not.toBeNull();
    expect(selectMode({ spanMs: 30 * 3600_000, labelledBins: 500 })).toBe('markov');
  });

  it('becomes gru when a promoted GRU exists and Markov would be active; falls back to markov when it is demoted', async () => {
    const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime();
    for (let i = 0; i < 3000; i++) {
      await put('bins', {
        binStart: T0 + i * BIN_MS * 2, active_s: 30, territoryId: i % 3 === 0 ? 'reels' : 'work', away: false, idle: false, nudgeShown: false, nudgeResponse: null,
        scroll_px_s_mean: 1, items_per_min: 1, mean_dwell_ms: 1, video_skip_rate: 0, tab_switches: 0, away_s: 0, idle_s: 0,
      });
    }
    await put('models', { name: MODEL_GRU_EVAL, updatedAt: 3, data: record(true) });
    expect((await refreshPrediction(Date.now(), true)).mode).toBe('gru');
    expect((await getStoredMode())?.reason).toMatch(/GRU beat Markov/);
    await put('models', { name: MODEL_GRU_EVAL, updatedAt: 4, data: record(false) });
    expect((await refreshPrediction(Date.now(), true)).mode).toBe('markov');
  });
});

describe('scoring in GRU mode', () => {
  it('uses the occupancy minutes for Drain territories, beyond the allowance', () => {
    const territories = new Map([['reels', { label: 'drain' as const, allowanceMin: 2 }], ['work', { label: 'deep' as const, allowanceMin: 15 }]]);
    const s = scoreSpiral({
      mode: 'gru',
      gruPredicted: new Map([['reels', 7], ['work', 3]]),
      state: 'reels',
      features: { items_per_min: 5, scroll_px_s_mean: 50, video_skip_rate: 0 },
      history: ['reels'],
      territories,
      spentMin: new Map([['reels', 1]]),
    });
    expect(s.mode).toBe('gru');
    expect(s.excessMin.get('reels')).toBeCloseTo(6, 6); // 7 predicted − 1 remaining
    expect(s.score).toBeCloseTo(0.6, 6);
  });
  it('falls back to rules when no GRU prediction is available', () => {
    const territories = new Map([['reels', { label: 'drain' as const, allowanceMin: 2 }]]);
    const s = scoreSpiral({ mode: 'gru', gruPredicted: null, state: 'reels', features: { items_per_min: 5, scroll_px_s_mean: 50, video_skip_rate: 0 }, history: ['reels'], territories, spentMin: new Map() });
    expect(s.mode).toBe('rules');
  });
});

describe('evaluateModes with a GRU', () => {
  it('adds GRU metrics on the held-out day and keeps rules and Markov unchanged', async () => {
    const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime();
    const mk = (i: number, t: string, day = 0): BinRecord => ({
      binStart: T0 + day * 86_400_000 + i * BIN_MS, active_s: 30, territoryId: t, away: false, idle: false, nudgeShown: false, nudgeResponse: null,
      scroll_px_s_mean: t === 'reels' ? 120 : 10, items_per_min: t === 'reels' ? 9 : 1, mean_dwell_ms: 3000, video_skip_rate: t === 'reels' ? 0.5 : 0, tab_switches: 0, away_s: 0, idle_s: 0,
    });
    const day = (d: number): BinRecord[] => Array.from({ length: 600 }, (_, i) => mk(i, ['work', 'work', 'work', 'reels', 'mail'][Math.floor(i / 20) % 5]!, d));
    const bins = [...day(0), ...day(1), ...day(2)];
    const info = new Map([['work', { label: 'deep' as const, allowanceMin: 15 }], ['mail', { label: 'shallow' as const, allowanceMin: 15 }], ['reels', { label: 'drain' as const, allowanceMin: 5 }]]);
    const before = evaluateModes(bins, info);
    const model = await trainGru(bins.slice(0, 1200), info, { epochs: 3, maxWindows: 300, backend: 'cpu' });
    expect(model).not.toBeNull();
    const after = evaluateModes(bins, info, { gru: model });
    expect(after.split).toBe('latest-day');
    expect(after.gru).toBeDefined();
    expect(after.gru!.nNext).toBe(after.markov.nNext);
    expect(after.rules).toEqual(before.rules);
    expect(after.markov).toEqual(before.markov);
  }, 120_000);
});
