import { describe, expect, it } from 'vitest';
import type { BinRecord } from '@/lib/db';
import { auc, chooseSplit, evaluateModes, inTopK } from './eval';
import type { TerritoryInfo } from './scoring';

const info = new Map<string, TerritoryInfo>([
  ['deep', { label: 'deep', allowanceMin: 15 }],
  ['reels', { label: 'drain', allowanceMin: 5 }],
]);

function bin(start: number, territoryId: string | null, over: Partial<BinRecord> = {}): BinRecord {
  const drain = territoryId === 'reels';
  return {
    binStart: start,
    active_s: 30,
    scroll_px_s_mean: drain ? 110 : 5,
    items_per_min: drain ? 8 : 0.5,
    mean_dwell_ms: 5000,
    video_skip_rate: drain ? 0.4 : 0,
    tab_switches: 0,
    away_s: 0,
    idle_s: 0,
    territoryId,
    away: false,
    idle: false,
    nudgeShown: false,
    nudgeResponse: null,
    ...over,
  };
}

/** `days` days of 8 am–: 40 min deep, 20 min reels, repeated for `reps` cycles. */
function cyclicBins(days: number, reps = 3): BinRecord[] {
  const out: BinRecord[] = [];
  const d0 = new Date(2026, 9, 1, 8, 0, 0).getTime();
  for (let d = 0; d < days; d++) {
    let t = d0 + d * 86_400_000;
    for (let r = 0; r < reps; r++) {
      for (let i = 0; i < 80; i++, t += 30_000) out.push(bin(t, 'deep'));
      for (let i = 0; i < 40; i++, t += 30_000) out.push(bin(t, 'reels'));
    }
  }
  return out;
}

describe('eval metrics', () => {
  it('AUC: perfect, inverted, tie and one-class cases', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [false, false, true, true])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [false, false, true, true])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [false, true, false, true])).toBe(0.5);
    expect(auc([0.1, 0.2], [true, true])).toBeNull();
    expect(auc([], [])).toBeNull();
  });
  it('top-k membership', () => {
    expect(inTopK(['a', 'b', 'c'], 'c', 3)).toBe(true);
    expect(inTopK(['a', 'b', 'c'], 'c', 2)).toBe(false);
  });
  it('split: latest day when there is enough earlier data, else 70/30, else none', () => {
    expect(chooseSplit(cyclicBins(3)).kind).toBe('latest-day');
    expect(chooseSplit(cyclicBins(1)).kind).toBe('within-day-70-30');
    expect(chooseSplit(cyclicBins(1).slice(0, 10)).kind).toBe('none');
    const s = chooseSplit(cyclicBins(3));
    expect(s.testStart).toBe(720);
  });
});

describe('evaluateModes on toy data', () => {
  it('on a periodic multi-day pattern both modes are scored on the held-out day', () => {
    const r = evaluateModes(cyclicBins(3), info, { now: 1 });
    expect(r.split).toBe('latest-day');
    expect(r.testBins).toBe(360);
    expect(r.markov.nNext).toBeGreaterThan(300);
    // Persistence is right except at the switches; Markov matches it here.
    expect(r.rules.top1!).toBeGreaterThan(0.95);
    expect(r.markov.top1!).toBeGreaterThan(0.95);
    expect(r.markov.top3!).toBeGreaterThanOrEqual(r.markov.top1!);
    expect(r.rules.positives).toBeGreaterThan(0);
    expect(r.rules.auc).not.toBeNull();
    expect(r.markov.auc).not.toBeNull();
    // The rules mode sees the fast Drain features, so it separates the classes well.
    expect(r.rules.auc!).toBeGreaterThan(0.8);
  });
  it('a held-out day with no Drain has no positives, so AUC is n/a (null), not 0', () => {
    const bins = cyclicBins(2);
    const lastDay = bins.filter((b) => b.binStart >= new Date(2026, 9, 2).getTime());
    const quiet = bins.filter((b) => b.binStart < new Date(2026, 9, 2).getTime()).concat(lastDay.map((b) => bin(b.binStart, 'deep')));
    const r = evaluateModes(quiet, info);
    expect(r.rules.auc).toBeNull();
    expect(r.markov.auc).toBeNull();
    expect(r.rules.positives).toBe(0);
  });
  it('too little data returns split none with empty metrics', () => {
    const r = evaluateModes(cyclicBins(1).slice(0, 20), info);
    expect(r.split).toBe('none');
    expect(r.markov.top1).toBeNull();
  });
  it('Markov learns a switch that persistence cannot: top-3 on switches', () => {
    const r = evaluateModes(cyclicBins(3), info);
    expect(r.markov.switchN).toBeGreaterThan(0);
    expect(r.markov.switchTop3!).toBeGreaterThanOrEqual(r.rules.switchTop3!);
  });
});
