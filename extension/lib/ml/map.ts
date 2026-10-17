import type { Label, SampleRecord, TerritoryRecord } from '@/lib/db';
import { createRng } from './kmeans';
import { effectiveLabel } from './scoring';

/**
 * Attention map (PDD 4.4, 9.x Should): each sampled item as a dot, UMAP-projected from its stored
 * vector to 2-D, coloured by label and grouped by territory. Only vectors and territory ids are used:
 * the map never shows titles, paths or text, so it adds no new stored or displayed content.
 */
export const MAP_MAX_POINTS = 1500;
export const MAP_MIN_POINTS = 30;

export interface MapInput {
  vectors: Float32Array[];
  /** Territory id per vector (null = unassigned). */
  territoryIds: Array<string | null>;
}

/**
 * Up to `max` samples with a vector, spread evenly over the territories (every territory keeps a
 * share, so small ones stay visible) and evenly over time inside each. Deterministic for a seed.
 */
export function sampleForMap(samples: Array<Pick<SampleRecord, 'vector' | 'territoryId' | 'ts'>>, max = MAP_MAX_POINTS, seed = 1): MapInput {
  const withVec = samples.filter((s): s is typeof s & { vector: Float32Array } => s.vector != null);
  if (withVec.length <= max) {
    const sorted = [...withVec].sort((a, b) => a.ts - b.ts);
    return { vectors: sorted.map((s) => s.vector), territoryIds: sorted.map((s) => s.territoryId) };
  }
  const groups = new Map<string, typeof withVec>();
  for (const s of withVec) {
    const k = s.territoryId ?? '';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  for (const g of groups.values()) g.sort((a, b) => a.ts - b.ts);
  // Water-fill: give every group min(size, fair share), redistribute what small groups leave.
  const quota = new Map<string, number>();
  let left = max;
  let open = [...groups.entries()].sort((a, b) => a[1].length - b[1].length);
  while (open.length) {
    const share = Math.floor(left / open.length);
    const [k, g] = open[0]!;
    if (g.length <= share) {
      quota.set(k, g.length);
      left -= g.length;
      open = open.slice(1);
    } else {
      for (const [kk] of open) quota.set(kk, share);
      break;
    }
  }
  const rng = createRng(seed);
  const picked: typeof withVec = [];
  for (const [k, g] of groups) {
    const q = quota.get(k) ?? 0;
    if (q >= g.length) {
      picked.push(...g);
      continue;
    }
    const offset = rng();
    for (let i = 0; i < q; i++) picked.push(g[Math.min(g.length - 1, Math.floor(((i + offset) * g.length) / q))]!);
  }
  picked.sort((a, b) => a.ts - b.ts);
  return { vectors: picked.map((s) => s.vector), territoryIds: picked.map((s) => s.territoryId) };
}

export interface MapPoint {
  x: number;
  y: number;
  territoryId: string | null;
  label: Label | null;
}

/** Scales raw 2-D coordinates into [pad, 1 − pad]² (aspect ratio kept) and attaches the label of each dot's territory. */
export function layoutPoints(coords: number[][], territoryIds: Array<string | null>, territories: Array<Pick<TerritoryRecord, 'id' | 'label' | 'suggestedLabel'>>, pad = 0.04): MapPoint[] {
  const labelOf = new Map(territories.map((t) => [t.id, effectiveLabel(t)]));
  const xs = coords.map((c) => c[0]!);
  const ys = coords.map((c) => c[1]!);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(1e-9, Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY));
  const scale = (1 - 2 * pad) / span;
  return coords.map((c, i) => ({
    x: pad + (c[0]! - minX) * scale,
    y: pad + (c[1]! - minY) * scale,
    territoryId: territoryIds[i] ?? null,
    label: territoryIds[i] != null ? (labelOf.get(territoryIds[i]!) ?? null) : null,
  }));
}

/** The dot nearest to (x, y) within `radius`, or -1. */
export function nearestPoint(points: MapPoint[], x: number, y: number, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  points.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Mean position of each territory's dots, for the labels on the map. */
export function territoryCentres(points: MapPoint[]): Map<string, { x: number; y: number; n: number }> {
  const acc = new Map<string, { x: number; y: number; n: number }>();
  for (const p of points) {
    if (p.territoryId == null) continue;
    const a = acc.get(p.territoryId) ?? { x: 0, y: 0, n: 0 };
    a.x += p.x;
    a.y += p.y;
    a.n++;
    acc.set(p.territoryId, a);
  }
  for (const a of acc.values()) {
    a.x /= a.n;
    a.y /= a.n;
  }
  return acc;
}

/** UMAP to 2-D (cosine on unit vectors), seeded, yielding to the page between epochs. */
export async function projectUmap(vectors: Float32Array[], opts: { seed?: number; onProgress?: (fraction: number) => void } = {}): Promise<number[][]> {
  const { UMAP } = await import('umap-js');
  const n = vectors.length;
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.max(2, Math.min(15, n - 1)),
    minDist: 0.15,
    random: createRng(opts.seed ?? 1),
    distanceFn: (a, b) => {
      let d = 0;
      for (let i = 0; i < a.length; i++) d += a[i]! * b[i]!;
      return 1 - d;
    },
  });
  const epochs = umap.initializeFit(vectors.map((v) => Array.from(v)));
  for (let e = 0; e < epochs; e++) {
    umap.step();
    if (e % 20 === 0) {
      opts.onProgress?.(e / epochs);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  opts.onProgress?.(1);
  return umap.getEmbedding();
}
