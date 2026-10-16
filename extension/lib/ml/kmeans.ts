/**
 * Spherical k-means on unit vectors with cosine distance (PDD 9.2, D-19). Our own code, no library.
 * Vectors are Float32Array, unit length. distance = 1 - dot.
 */

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so tests are reproducible. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Mean of the vectors, re-normalised to unit length. Returns null for an empty or zero-sum set. */
export function meanUnit(vectors: Float32Array[], dim: number): Float32Array | null {
  if (vectors.length === 0) return null;
  const out = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i]! += v[i]!;
  let n = 0;
  for (let i = 0; i < dim; i++) n += out[i]! * out[i]!;
  n = Math.sqrt(n);
  if (n === 0) return null;
  for (let i = 0; i < dim; i++) out[i]! /= n;
  return out;
}

export interface Nearest {
  index: number;
  /** Cosine distance (1 - dot) to that centroid. */
  dist: number;
}

export function nearestCentroid(v: Float32Array, centroids: Float32Array[]): Nearest {
  let best = -1;
  let bestDot = -Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const d = dot(v, centroids[c]!);
    if (d > bestDot) {
      bestDot = d;
      best = c;
    }
  }
  return { index: best, dist: best < 0 ? Infinity : 1 - bestDot };
}

function kmeansPlusPlus(points: Float32Array[], k: number, rng: Rng): Float32Array[] {
  const centroids: Float32Array[] = [points[Math.floor(rng() * points.length)]!];
  const minDist = new Float64Array(points.length).fill(Infinity);
  while (centroids.length < k) {
    const last = centroids[centroids.length - 1]!;
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const d = Math.max(0, 1 - dot(points[i]!, last));
      if (d < minDist[i]!) minDist[i] = d;
      total += minDist[i]! * minDist[i]!;
    }
    let pick = points.length - 1;
    if (total > 0) {
      let r = rng() * total;
      for (let i = 0; i < points.length; i++) {
        r -= minDist[i]! * minDist[i]!;
        if (r <= 0) {
          pick = i;
          break;
        }
      }
    } else {
      pick = Math.floor(rng() * points.length);
    }
    centroids.push(points[pick]!);
  }
  return centroids.map((c) => Float32Array.from(c));
}

export interface KMeansResult {
  centroids: Float32Array[];
  assignments: Int32Array;
  /** Sum of cosine distances to the assigned centroid (lower is better). */
  inertia: number;
}

function runOnce(points: Float32Array[], k: number, rng: Rng, maxIter: number): KMeansResult {
  const n = points.length;
  const dim = points[0]!.length;
  let centroids = kmeansPlusPlus(points, k, rng);
  const assignments = new Int32Array(n).fill(-1);
  const dists = new Float64Array(n);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const { index, dist } = nearestCentroid(points[i]!, centroids);
      dists[i] = dist;
      if (assignments[i] !== index) {
        assignments[i] = index;
        changed++;
      }
    }
    const sums = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const s = sums[assignments[i]!]!;
      const p = points[i]!;
      for (let d = 0; d < dim; d++) s[d]! += p[d]!;
      counts[assignments[i]!]!++;
    }
    const next: Float32Array[] = [];
    for (let c = 0; c < k; c++) {
      let norm = 0;
      const s = sums[c]!;
      for (let d = 0; d < dim; d++) norm += s[d]! * s[d]!;
      norm = Math.sqrt(norm);
      if (counts[c] === 0 || norm === 0) {
        // Empty cluster: re-seed on the point farthest from its centroid.
        let far = 0;
        for (let i = 1; i < n; i++) if (dists[i]! > dists[far]!) far = i;
        next.push(Float32Array.from(points[far]!));
        dists[far] = 0;
        changed++;
      } else {
        const u = new Float32Array(dim);
        for (let d = 0; d < dim; d++) u[d] = s[d]! / norm;
        next.push(u);
      }
    }
    centroids = next;
    if (changed === 0) break;
  }
  // Final assignment against the final centroids.
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    const { index, dist } = nearestCentroid(points[i]!, centroids);
    assignments[i] = index;
    inertia += dist;
  }
  return { centroids, assignments, inertia };
}

export interface KMeansOptions {
  seed?: number;
  restarts?: number;
  maxIter?: number;
}

/** Best of `restarts` k-means++ runs by inertia. */
export function kmeans(points: Float32Array[], k: number, opts: KMeansOptions = {}): KMeansResult {
  if (points.length === 0 || k <= 0) throw new Error('kmeans: need points and k > 0');
  const kk = Math.min(k, points.length);
  const rng = createRng(opts.seed ?? 1);
  let best: KMeansResult | null = null;
  for (let r = 0; r < (opts.restarts ?? 3); r++) {
    const res = runOnce(points, kk, rng, opts.maxIter ?? 50);
    if (!best || res.inertia < best.inertia) best = res;
  }
  return best!;
}

/**
 * Mean silhouette with cosine distance. Exact and O(n·k·d) rather than O(n²·d): for unit vectors the
 * sum of distances from x to a cluster C is |C| - x·S_C, where S_C is the sum of C's vectors.
 */
export function silhouette(points: Float32Array[], assignments: ArrayLike<number>, k: number): number {
  const n = points.length;
  if (n === 0 || k < 2) return 0;
  const dim = points[0]!.length;
  const sums = Array.from({ length: k }, () => new Float32Array(dim));
  const sizes = new Int32Array(k);
  for (let i = 0; i < n; i++) {
    const c = assignments[i]!;
    sizes[c]!++;
    const s = sums[c]!;
    const p = points[i]!;
    for (let d = 0; d < dim; d++) s[d]! += p[d]!;
  }
  let total = 0;
  for (let i = 0; i < n; i++) {
    const own = assignments[i]!;
    if (sizes[own]! <= 1) continue; // singleton: silhouette 0
    const p = points[i]!;
    const a = (sizes[own]! - dot(p, sums[own]!)) / (sizes[own]! - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own || sizes[c] === 0) continue;
      const m = (sizes[c]! - dot(p, sums[c]!)) / sizes[c]!;
      if (m < b) b = m;
    }
    if (!Number.isFinite(b)) continue;
    const denom = Math.max(a, b);
    if (denom > 0) total += (b - a) / denom;
  }
  return total / n;
}

export interface ChooseKOptions {
  kMin?: number;
  kMax?: number;
  /** Max points used to compare candidate k values. */
  sample?: number;
  /** Prefer the smallest k whose silhouette is within this of the best (bias toward fewer, PDD 9.2). */
  tolerance?: number;
  seed?: number;
  restarts?: number;
}

export interface ChooseKResult {
  k: number;
  scores: Array<{ k: number; silhouette: number }>;
}

export function sampleIndices(n: number, m: number, rng: Rng): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (m >= n) return idx;
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, m).sort((a, b) => a - b);
}

/** Silhouette-based choice of k over [kMin, kMax], on a subsample (cost control). */
export function chooseK(points: Float32Array[], opts: ChooseKOptions = {}): ChooseKResult {
  const n = points.length;
  const kMin = opts.kMin ?? 4;
  const kMax = Math.min(opts.kMax ?? 30, Math.floor(n / 15));
  if (n < 2) return { k: 1, scores: [] };
  if (kMax < kMin) {
    // Too little data for the full range: a small fixed k.
    const k = Math.max(2, Math.min(kMin, Math.floor(n / 3)));
    return { k, scores: [] };
  }
  const rng = createRng(opts.seed ?? 1);
  const sub = sampleIndices(n, opts.sample ?? 1200, rng).map((i) => points[i]!);
  const scores: ChooseKResult['scores'] = [];
  for (let k = kMin; k <= kMax; k++) {
    const res = kmeans(sub, k, { seed: (opts.seed ?? 1) + k, restarts: opts.restarts ?? 2 });
    scores.push({ k, silhouette: silhouette(sub, res.assignments, k) });
  }
  const best = Math.max(...scores.map((s) => s.silhouette));
  const tol = opts.tolerance ?? 0.02;
  const chosen = scores.find((s) => s.silhouette >= best - tol)!;
  return { k: chosen.k, scores };
}

export interface FitOptions extends ChooseKOptions {
  /** Clusters smaller than max(minClusterSize, minClusterShare × n) are dissolved. */
  minClusterSize?: number;
  minClusterShare?: number;
  /** Force k instead of choosing it. */
  k?: number;
}

export interface FitResult {
  k: number;
  centroids: Float32Array[];
  /** Index into `centroids` for each input point. */
  assignments: Int32Array;
  /** Cosine distance of each point to its centroid. */
  dists: Float64Array;
  silhouette: number;
  scores: ChooseKResult['scores'];
}

/** Choose k on a subsample, fit all points, dissolve tiny clusters, return final centroids. */
export function fitClusters(points: Float32Array[], opts: FitOptions = {}): FitResult {
  const dim = points[0]!.length;
  const { k: chosen, scores } = opts.k != null ? { k: opts.k, scores: [] } : chooseK(points, opts);
  const full = kmeans(points, chosen, { seed: opts.seed ?? 1, restarts: opts.restarts ?? 3 });
  const n = points.length;
  const minSize = Math.max(opts.minClusterSize ?? 5, Math.ceil((opts.minClusterShare ?? 0.005) * n));
  const sizes = new Int32Array(full.centroids.length);
  for (const a of full.assignments) sizes[a]!++;
  let keep = full.centroids.map((_, c) => c).filter((c) => sizes[c]! >= minSize);
  if (keep.length === 0) keep = [full.centroids.map((_, c) => c).sort((a, b) => sizes[b]! - sizes[a]!)[0]!];
  let centroids = keep.map((c) => full.centroids[c]!);
  let assignments: Int32Array = new Int32Array(n);
  const dists = new Float64Array(n);
  if (keep.length !== full.centroids.length) {
    // Move dissolved points to the nearest kept centroid, then recompute the means.
    for (let i = 0; i < n; i++) {
      const r = nearestCentroid(points[i]!, centroids);
      assignments[i] = r.index;
    }
    centroids = centroids.map((old, c) => {
      const members: Float32Array[] = [];
      for (let i = 0; i < n; i++) if (assignments[i] === c) members.push(points[i]!);
      return meanUnit(members, dim) ?? old;
    });
  } else {
    assignments = full.assignments;
  }
  for (let i = 0; i < n; i++) dists[i] = Math.max(0, 1 - dot(points[i]!, centroids[assignments[i]!]!));
  return { k: centroids.length, centroids, assignments, dists, silhouette: silhouette(points, assignments, centroids.length), scores };
}
