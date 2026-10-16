import { describe, expect, it } from 'vitest';
import { chooseK, createRng, fitClusters, kmeans, meanUnit, nearestCentroid, silhouette } from './kmeans';
import { plantedClusters, purity } from './testutil';

describe('kmeans', () => {
  it('recovers planted separable clusters', () => {
    const { points, labels } = plantedClusters(5, 60);
    const res = kmeans(points, 5, { seed: 3 });
    expect(purity(res.assignments, labels, 5)).toBe(1);
    for (const c of res.centroids) expect(Math.hypot(...c)).toBeCloseTo(1, 4);
  });

  it('is deterministic for a seed', () => {
    const { points } = plantedClusters(4, 40);
    const a = kmeans(points, 4, { seed: 9 });
    const b = kmeans(points, 4, { seed: 9 });
    expect([...a.assignments]).toEqual([...b.assignments]);
  });

  it('survives k larger than the number of distinct points', () => {
    const v = Float32Array.from([1, 0, 0]);
    const res = kmeans([v, v, v, v], 3, { seed: 1 });
    expect(res.assignments).toHaveLength(4);
  });

  it('nearestCentroid returns cosine distance', () => {
    const c = [Float32Array.from([1, 0]), Float32Array.from([0, 1])];
    const r = nearestCentroid(Float32Array.from([0.6, 0.8]), c);
    expect(r.index).toBe(1);
    expect(r.dist).toBeCloseTo(0.2, 5);
  });

  it('meanUnit normalises and handles empty input', () => {
    expect(meanUnit([], 2)).toBeNull();
    const m = meanUnit([Float32Array.from([1, 0]), Float32Array.from([0, 1])], 2)!;
    expect(m[0]).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe('silhouette', () => {
  it('matches a brute-force O(n²) computation', () => {
    const { points } = plantedClusters(3, 20, 32, 0.9);
    const res = kmeans(points, 3, { seed: 2 });
    const n = points.length;
    const d = (i: number, j: number) => 1 - points[i]!.reduce((s, x, t) => s + x * points[j]![t]!, 0);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const sums = new Array(3).fill(0);
      const cnt = new Array(3).fill(0);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        sums[res.assignments[j]!] += d(i, j);
        cnt[res.assignments[j]!]++;
      }
      const own = res.assignments[i]!;
      const a = sums[own] / cnt[own];
      const b = Math.min(...[0, 1, 2].filter((c) => c !== own && cnt[c] > 0).map((c) => sums[c] / cnt[c]));
      total += (b - a) / Math.max(a, b);
    }
    expect(silhouette(points, res.assignments, 3)).toBeCloseTo(total / n, 4);
  });

  it('is high for separated clusters and low for one blob', () => {
    const sep = plantedClusters(4, 40);
    const r = kmeans(sep.points, 4, { seed: 1 });
    expect(silhouette(sep.points, r.assignments, 4)).toBeGreaterThan(0.5);
    const blob = plantedClusters(1, 160, 256, 3);
    const rb = kmeans(blob.points, 4, { seed: 1 });
    expect(silhouette(blob.points, rb.assignments, 4)).toBeLessThan(0.3);
  });
});

describe('chooseK', () => {
  for (const k of [4, 7, 12]) {
    it(`picks the planted k = ${k}`, () => {
      const { points } = plantedClusters(k, 60, 256, 0.3, 11 + k);
      expect(chooseK(points, { seed: 2 }).k).toBe(k);
    });
  }

  it('prefers fewer clusters on a near tie', () => {
    const { points } = plantedClusters(5, 60);
    const res = chooseK(points, { seed: 1, tolerance: 0.5 });
    expect(res.k).toBe(4); // within a wide tolerance, the smallest k wins
  });

  it('degrades to a small fixed k with very little data', () => {
    const { points } = plantedClusters(2, 10);
    const res = chooseK(points);
    expect(res.k).toBeGreaterThanOrEqual(2);
    expect(res.k).toBeLessThanOrEqual(4);
  });

  it('subsamples deterministically', () => {
    const rng = createRng(1);
    expect(rng()).toBe(createRng(1)());
  });
});

describe('fitClusters', () => {
  it('dissolves tiny clusters into the nearest territory', () => {
    const { points } = plantedClusters(4, 80);
    const outlier = plantedClusters(1, 2, 256, 0.1, 99).points; // 2 odd points
    const res = fitClusters([...points, ...outlier], { k: 6, minClusterSize: 5, seed: 1 });
    const sizes = new Map<number, number>();
    for (const a of res.assignments) sizes.set(a, (sizes.get(a) ?? 0) + 1);
    expect(Math.min(...sizes.values())).toBeGreaterThanOrEqual(5);
    expect(res.k).toBeLessThanOrEqual(6);
    expect(res.assignments.every((a) => a >= 0 && a < res.k)).toBe(true);
  });

  it('fits planted clusters end to end', () => {
    const { points, labels } = plantedClusters(6, 70);
    const res = fitClusters(points, { seed: 4 });
    expect(res.k).toBe(6);
    expect(purity(res.assignments, labels, res.k)).toBe(1);
    expect(res.dists.every((d) => d >= 0 && d < 1)).toBe(true);
  });
});
