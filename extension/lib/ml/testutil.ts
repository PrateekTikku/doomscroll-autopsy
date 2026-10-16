import { createRng, meanUnit } from './kmeans';

/** Test/spike helper: unit vectors in `k` planted clusters. Not imported by product code. */
export function plantedClusters(k: number, perCluster: number, dim = 256, noise = 0.35, seed = 7) {
  const rng = createRng(seed);
  const gauss = () => {
    const u = Math.max(rng(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  const unit = (v: Float32Array) => {
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n);
    return v.map((x) => x / n) as Float32Array;
  };
  const centers = Array.from({ length: k }, () => unit(Float32Array.from({ length: dim }, gauss)));
  const points: Float32Array[] = [];
  const labels: number[] = [];
  for (let c = 0; c < k; c++) {
    for (let i = 0; i < perCluster; i++) {
      const v = Float32Array.from(centers[c]!, (x) => x + (noise / Math.sqrt(dim)) * gauss());
      points.push(unit(v));
      labels.push(c);
    }
  }
  return { points, labels, centers, centroidsOf: (assign: ArrayLike<number>, kk: number) => Array.from({ length: kk }, (_, c) => meanUnit(points.filter((_, i) => assign[i] === c), dim)!) };
}

/** Fraction of points whose cluster's majority planted label is their own label. */
export function purity(assign: ArrayLike<number>, labels: number[], k: number): number {
  let ok = 0;
  for (let c = 0; c < k; c++) {
    const counts = new Map<number, number>();
    labels.forEach((l, i) => {
      if (assign[i] === c) counts.set(l, (counts.get(l) ?? 0) + 1);
    });
    ok += Math.max(0, ...counts.values());
  }
  return ok / labels.length;
}
