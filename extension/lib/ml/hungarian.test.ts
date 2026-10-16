import { describe, expect, it } from 'vitest';
import { hungarian, matchCentroids } from './hungarian';
import { createRng } from './kmeans';
import { plantedClusters } from './testutil';

function bruteForce(cost: number[][]): number {
  const n = cost.length;
  const m = cost[0]!.length;
  let best = Infinity;
  const used = new Array(m).fill(false);
  const go = (i: number, sum: number) => {
    if (i === n) return void (best = Math.min(best, sum));
    for (let j = 0; j < m; j++)
      if (!used[j]) {
        used[j] = true;
        go(i + 1, sum + cost[i]![j]!);
        used[j] = false;
      }
  };
  go(0, 0);
  return best;
}

describe('hungarian', () => {
  it('finds the optimum on random square and wide matrices', () => {
    const rng = createRng(5);
    for (const [n, m] of [[4, 4], [5, 5], [3, 6], [6, 6]]) {
      const cost = Array.from({ length: n! }, () => Array.from({ length: m! }, () => Math.floor(rng() * 20)));
      const asg = hungarian(cost);
      expect(new Set(asg.filter((j) => j >= 0)).size).toBe(n);
      expect(asg.reduce((s, j, i) => s + cost[i]![j]!, 0)).toBe(bruteForce(cost));
    }
  });

  it('handles more rows than columns (leaves extra rows unmatched)', () => {
    const cost = [[1, 9], [9, 1], [5, 5]];
    const asg = hungarian(cost);
    expect(asg.slice(0, 2)).toEqual([0, 1]);
    expect(asg[2]).toBe(-1);
  });

  it('handles empty input', () => {
    expect(hungarian([])).toEqual([]);
    expect(hungarian([[], []])).toEqual([-1, -1]);
  });
});

describe('matchCentroids', () => {
  const { centers } = plantedClusters(6, 1);

  it('matches a permuted copy of the centroids back to their indices', () => {
    const perm = [3, 0, 5, 1, 4, 2];
    const shuffled = perm.map((i) => centers[i]!);
    const m = matchCentroids(shuffled, centers);
    expect(m.newToOld).toEqual(perm);
  });

  it('leaves a below-threshold pair unmatched (a new territory)', () => {
    const m = matchCentroids([centers[0]!, centers[1]!], [centers[0]!, centers[2]!]);
    expect(m.newToOld[0]).toBe(0);
    expect(m.newToOld[1]).toBeNull();
  });

  it('handles k changing in either direction', () => {
    expect(matchCentroids(centers.slice(0, 4), centers).newToOld).toEqual([0, 1, 2, 3]);
    const more = matchCentroids(centers, centers.slice(0, 4)).newToOld;
    expect(more.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(more.slice(4)).toEqual([null, null]);
  });

  it('keeps matches through small centroid drift', () => {
    const drifted = centers.map((c, i) => Float32Array.from(c, (x, d) => x + (d % 7 === i ? 0.01 : 0)));
    expect(matchCentroids(drifted, centers).newToOld).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
