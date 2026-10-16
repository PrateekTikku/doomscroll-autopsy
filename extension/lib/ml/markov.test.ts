import { describe, expect, it } from 'vitest';
import { AWAY, binState, nextDistribution, rollout, trainMarkov, type StateBin } from './markov';

const bin = (i: number, territoryId: string | null, extra: Partial<StateBin> = {}): StateBin => ({
  binStart: 1_000_000 + i * 30_000,
  territoryId,
  away: false,
  idle: false,
  ...extra,
});

describe('markov', () => {
  it('maps bins to states (away and idle win over the territory)', () => {
    expect(binState(bin(0, 'a'))).toBe('a');
    expect(binState(bin(0, null))).toBe('unassigned');
    expect(binState(bin(0, 'a', { away: true }))).toBe(AWAY);
    expect(binState(bin(0, 'a', { idle: true }))).toBe('idle');
  });

  it('counts only consecutive bins: a gap is not a transition', () => {
    const m = trainMarkov([bin(0, 'a'), bin(1, 'b'), bin(5, 'a'), bin(6, 'a')]);
    expect(m.transitions).toBe(2);
    expect(m.counts.a).toEqual({ b: 1, a: 1 });
    expect(m.counts.b).toBeUndefined();
  });

  it('rollout matches the analytic expectation on a known two-state chain', () => {
    // a→a 0.9, a→b 0.1 ; b absorbing-ish (b→b 1.0). Train with exact counts, alpha 0 for exactness.
    const bins: StateBin[] = [];
    let t = 0;
    for (let rep = 0; rep < 10; rep++) {
      for (let k = 0; k < 10; k++) bins.push(bin(t++, 'a')); // 9 a→a + 1 a→b per block of 10 a's
      bins.push(bin(t++, 'b'));
      bins.push(bin(t++, 'b'));
      t += 3; // gap so the b→a edge is not counted
    }
    const m = trainMarkov(bins, { alpha: 0 });
    const row = Object.fromEntries(nextDistribution(m, 'a'));
    expect(row.a).toBeCloseTo(0.9, 6);
    expect(row.b).toBeCloseTo(0.1, 6);
    const occ = rollout(m, 'a', 20);
    // E[time in a] = Σ_{t=1..20} 0.9^t bins; minutes = ×0.5
    let expA = 0;
    for (let s = 1; s <= 20; s++) expA += 0.9 ** s;
    expect(occ.get('a')!).toBeCloseTo(expA * 0.5, 6);
    expect(occ.get('a')! + occ.get('b')!).toBeCloseTo(10, 6);
  });

  it('smoothing gives unseen transitions a little mass and rows still sum to 1', () => {
    const m = trainMarkov([bin(0, 'a'), bin(1, 'a'), bin(2, 'b')]);
    const row = nextDistribution(m, 'a');
    expect(row.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 9);
    expect(row.every(([, p]) => p > 0)).toBe(true);
  });

  it('a state never left in the data stays put; an unknown state too', () => {
    const m = trainMarkov([bin(0, 'a'), bin(1, 'a')]);
    expect(rollout(m, 'b').get('b')).toBe(10);
    expect(nextDistribution(m, 'zzz')).toEqual([['zzz', 1]]);
  });
});
