import { dot } from './kmeans';

/**
 * Hungarian (Kuhn-Munkres) algorithm, O(n²m) with potentials. Minimises total cost for an n×m matrix
 * (n ≤ m is handled directly; n > m by transposing). Returns, for each row, the matched column or -1.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0]!.length;
  if (m === 0) return new Array(n).fill(-1);
  if (n > m) {
    const t = Array.from({ length: m }, (_, j) => cost.map((row) => row[j]!));
    const colToRow = hungarian(t); // for each column of the original, its row
    const out = new Array<number>(n).fill(-1);
    colToRow.forEach((row, col) => {
      if (row >= 0) out[row] = col;
    });
    return out;
  }
  const INF = Infinity;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1); // p[j] = row matched to column j (1-based), 0 = free
  const way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(INF);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else {
          minv[j]! -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j]! - 1] = j - 1;
  return out;
}

export const MATCH_THRESHOLD = 0.8;

export interface CentroidMatch {
  /** For each new centroid, the index of the old territory it keeps, or null (new territory). */
  newToOld: Array<number | null>;
  /** Cosine similarity of each match (null when unmatched). */
  similarity: Array<number | null>;
}

/**
 * Match new centroids to old ones, one to one, maximising total cosine similarity. Pairs at or below
 * `threshold` stay unmatched (PDD 9.2: > 0.8 keeps ID, name, label and allowance).
 */
export function matchCentroids(newC: Float32Array[], oldC: Float32Array[], threshold = MATCH_THRESHOLD): CentroidMatch {
  const sim = newC.map((a) => oldC.map((b) => dot(a, b)));
  const assigned = hungarian(sim.map((row) => row.map((s) => -s)));
  const newToOld: Array<number | null> = [];
  const similarity: Array<number | null> = [];
  assigned.forEach((j, i) => {
    if (j >= 0 && sim[i]![j]! > threshold) {
      newToOld.push(j);
      similarity.push(sim[i]![j]!);
    } else {
      newToOld.push(null);
      similarity.push(null);
    }
  });
  return { newToOld, similarity };
}
