import { describe, expect, it } from 'vitest';
import { layoutPoints, nearestPoint, projectUmap, sampleForMap, territoryCentres } from './map';
import { plantedClusters } from './testutil';

const sample = (i: number, territoryId: string | null, vec = true) => ({ ts: i, territoryId, vector: vec ? new Float32Array([i, 0]) : null });

describe('sampleForMap', () => {
  it('keeps everything when under the cap, in time order, dropping vectorless samples', () => {
    const r = sampleForMap([sample(3, 'a'), sample(1, 'b'), sample(2, 'a', false)], 10);
    expect(r.vectors.map((v) => v[0])).toEqual([1, 3]);
    expect(r.territoryIds).toEqual(['b', 'a']);
  });
  it('caps, and gives small territories their full share instead of starving them', () => {
    const big = Array.from({ length: 2000 }, (_, i) => sample(i, 'big'));
    const small = Array.from({ length: 40 }, (_, i) => sample(5000 + i, 'small'));
    const r = sampleForMap([...big, ...small], 300);
    expect(r.vectors.length).toBeLessThanOrEqual(300);
    expect(r.vectors.length).toBeGreaterThan(280);
    expect(r.territoryIds.filter((t) => t === 'small')).toHaveLength(40);
  });
  it('is deterministic for a seed', () => {
    const data = Array.from({ length: 500 }, (_, i) => sample(i, i % 2 ? 'a' : 'b'));
    expect(sampleForMap(data, 100, 3).vectors.map((v) => v[0])).toEqual(sampleForMap(data, 100, 3).vectors.map((v) => v[0]));
  });
});

describe('layout and selection', () => {
  const pts = layoutPoints([[0, 0], [10, 0], [10, 5]], ['a', 'b', null], [{ id: 'a', label: null, suggestedLabel: 'drain' }, { id: 'b', label: 'deep', suggestedLabel: 'drain' }]);
  it('fits into the unit square and labels dots by confirmed-else-suggested', () => {
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0.04 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(0.96 + 1e-9);
      expect(p.y).toBeLessThanOrEqual(0.96 + 1e-9);
    }
    expect(pts.map((p) => p.label)).toEqual(['drain', 'deep', null]);
  });
  it('finds the nearest dot within a radius, else -1', () => {
    expect(nearestPoint(pts, pts[1]!.x + 0.01, pts[1]!.y, 0.05)).toBe(1);
    expect(nearestPoint(pts, 0.5, 0.9, 0.01)).toBe(-1);
  });
  it('computes territory centres', () => {
    const c = territoryCentres(layoutPoints([[0, 0], [2, 0], [9, 9]], ['a', 'a', 'b'], []));
    expect(c.get('a')!.n).toBe(2);
    expect(c.has('b')).toBe(true);
  });
});

describe('projectUmap', () => {
  it('separates planted clusters in 2-D (same-cluster neighbours stay together)', async () => {
    const { points, labels } = plantedClusters(3, 40, 32, 0.3, 11);
    const coords = await projectUmap(points, { seed: 2 });
    expect(coords).toHaveLength(120);
    const centre = (c: number) => {
      const own = coords.filter((_, i) => labels[i] === c);
      return [own.reduce((a, p) => a + p[0]!, 0) / own.length, own.reduce((a, p) => a + p[1]!, 0) / own.length];
    };
    let ok = 0;
    coords.forEach((p, i) => {
      const dists = [0, 1, 2].map((c) => Math.hypot(p[0]! - centre(c)![0]!, p[1]! - centre(c)![1]!));
      if (dists.indexOf(Math.min(...dists)) === labels[i]) ok++;
    });
    expect(ok / coords.length).toBeGreaterThan(0.95);
  }, 60_000);
});
