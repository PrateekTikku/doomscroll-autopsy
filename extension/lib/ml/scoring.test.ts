import { describe, expect, it } from 'vitest';
import { trainMarkov, type StateBin } from './markov';
import { drainSpent, effectiveLabel, scoreSpiral, selectMode, type ScoreContext, type TerritoryInfo } from './scoring';

const territories = new Map<string, TerritoryInfo>([
  ['deep', { label: 'deep', allowanceMin: 15 }],
  ['reels', { label: 'drain', allowanceMin: 15 }],
  ['shorts', { label: 'drain', allowanceMin: 5 }],
]);
const fast = { items_per_min: 8, scroll_px_s_mean: 110, video_skip_rate: 0.4 };

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  mode: 'rules',
  state: 'reels',
  features: fast,
  history: ['reels', 'reels'],
  territories,
  spentMin: new Map(),
  ...over,
});

describe('scoring (PDD 9.5)', () => {
  it('within the allowance the score is 0', () => {
    expect(scoreSpiral(ctx({ spentMin: new Map([['reels', 2]]) })).score).toBe(0);
  });
  it('beyond the allowance it is positive and grows as the allowance runs out', () => {
    const a = scoreSpiral(ctx({ spentMin: new Map([['reels', 9]]) })).score; // 6 left, ~9 predicted
    const b = scoreSpiral(ctx({ spentMin: new Map([['reels', 14]]) })).score; // 1 left
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });
  it('is capped at 1 and zero allowance means the whole window counts', () => {
    const s = scoreSpiral(ctx({ state: 'shorts', history: ['shorts'], spentMin: new Map([['shorts', 100]]) }));
    expect(s.score).toBeLessThanOrEqual(1);
    expect(s.score).toBeGreaterThan(0.8);
    expect(s.remainingCurrentMin).toBe(0);
  });
  it('sums the excess over Drain territories (Markov)', () => {
    const bins: StateBin[] = [];
    const seq = ['reels', 'shorts'];
    for (let i = 0; i < 200; i++) bins.push({ binStart: i * 30_000, territoryId: seq[Math.floor(i / 50) % 2]!, away: false, idle: false });
    const markov = trainMarkov(bins);
    const none = scoreSpiral(ctx({ mode: 'markov', markov, state: 'deep', history: ['deep'] }));
    expect(none.mode).toBe('markov');
    const spent = new Map([['reels', 15], ['shorts', 5]]);
    const hot = scoreSpiral(ctx({ mode: 'markov', markov, state: 'reels', spentMin: spent }));
    expect(hot.excessMin.get('reels')!).toBeGreaterThan(5);
    expect(hot.score).toBeCloseTo(Math.min(1, [...hot.excessMin.values()].reduce((a, b) => a + b, 0) / 10), 9);
  });
  it('uses rules when no Markov model is given', () => {
    expect(scoreSpiral(ctx({ mode: 'markov', markov: null })).mode).toBe('rules');
  });
  it('outside Drain the rules score is attributed to the biggest Drain territory', () => {
    const s = scoreSpiral(ctx({ state: 'deep', history: ['deep'], spentMin: new Map([['reels', 14]]) }));
    expect(s.currentLabel).toBe('deep');
    expect(s.predictedMin.has('reels')).toBe(true);
  });
  it('an unassigned feed item is a pseudo Drain territory with the default allowance', () => {
    const s = scoreSpiral(ctx({ state: 'unassigned', history: ['unassigned'], unassignedFeed: true, territories: new Map(), spentMin: new Map([['unassigned', 14]]) }));
    expect(s.currentLabel).toBe('drain');
    expect(s.score).toBeGreaterThan(0);
  });
  it('effective label prefers the confirmed one, then the suggestion', () => {
    expect(effectiveLabel({ label: 'deep', suggestedLabel: 'drain' })).toBe('deep');
    expect(effectiveLabel({ label: null, suggestedLabel: 'drain' })).toBe('drain');
    expect(effectiveLabel({ label: null, suggestedLabel: null })).toBeNull();
  });
  it('mode selection boundary: rules until a day and enough bins', () => {
    const day = 24 * 3600_000;
    expect(selectMode({ spanMs: day - 1, labelledBins: 1000 })).toBe('rules');
    expect(selectMode({ spanMs: day, labelledBins: 239 })).toBe('rules');
    expect(selectMode({ spanMs: day, labelledBins: 240 })).toBe('markov');
  });
  it('drainSpent sums active seconds of Drain bins inside the window only', () => {
    const bins = [
      { binStart: 0, territoryId: 'reels', active_s: 30 },
      { binStart: 30_000, territoryId: 'reels', active_s: 15 },
      { binStart: 60_000, territoryId: 'deep', active_s: 30 },
      { binStart: 90_000, territoryId: 'reels', active_s: 30 },
    ];
    expect(drainSpent(bins, territories, 0, 90_000).get('reels')).toBeCloseTo(0.75, 9);
  });
});
