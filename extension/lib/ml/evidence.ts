import { openDb, type Label, type TerritoryRecord } from '@/lib/db';
import { silhouette } from './kmeans';
import { pathSegment } from './names';
import { toStoredDim } from './territories';

/**
 * Evidence for the post (PDD 9.10, milestone task 7): one domain split into several territories,
 * compared with grouping by domain alone. Counts and origin/path names only: no titles, text or URLs
 * with queries.
 */

export interface EvidenceSample {
  origin: string;
  path: string;
  territoryId: string;
  vec: Float32Array;
}

export interface OriginSplit {
  origin: string;
  samples: number;
  territories: Array<{
    id: string;
    name: string;
    label: Label | null;
    suggestedLabel: Label | null;
    samples: number;
    share: number;
    topPaths: Array<{ segment: string; count: number }>;
  }>;
  /** Normalised mutual information between territory and first path segment (0–1). */
  pathAgreementNmi: number | null;
  /** Territories carry different effective labels (confirmed, else suggested). */
  labelsDiffer: boolean;
}

export interface EvidenceReport {
  generatedAt: string;
  samples: number;
  territories: number;
  origins: number;
  /** Mean cosine silhouette of the same vectors, grouped by domain vs. by territory. */
  silhouetteByDomain: number | null;
  silhouetteByTerritory: number | null;
  /** Origins that span ≥ 2 territories (each with ≥ 5% and ≥ 5 samples). */
  originsSplit: number;
  /** Share of samples of split origins that sit outside their origin's biggest territory: what a domain-only view hides. */
  hiddenByDomainShare: number | null;
  /** Best example first. */
  examples: OriginSplit[];
}

const effective = (t: { label: Label | null; suggestedLabel: Label | null }): Label | null => t.label ?? t.suggestedLabel;

/** Normalised mutual information of two labelings (arithmetic-mean normalisation). */
export function nmi(a: string[], b: string[]): number | null {
  const n = a.length;
  if (n === 0 || n !== b.length) return null;
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  const joint = count(a.map((x, i) => `${x}\u0000${b[i]}`));
  const H = (m: Map<string, number>) => -[...m.values()].reduce((s, c) => s + (c / n) * Math.log(c / n), 0);
  const ha = H(ca);
  const hb = H(cb);
  if (ha === 0 || hb === 0) return 0;
  let mi = 0;
  for (const [key, c] of joint) {
    const [x, y] = key.split('\u0000') as [string, string];
    mi += (c / n) * Math.log((c * n) / (ca.get(x)! * cb.get(y)!));
  }
  return Math.max(0, Math.min(1, mi / ((ha + hb) / 2)));
}

export function buildEvidence(samples: EvidenceSample[], territories: TerritoryRecord[], now = Date.now()): EvidenceReport {
  const tById = new Map(territories.map((t) => [t.id, t]));
  const byOrigin = new Map<string, EvidenceSample[]>();
  for (const s of samples) {
    const list = byOrigin.get(s.origin) ?? [];
    list.push(s);
    byOrigin.set(s.origin, list);
  }

  const splits: OriginSplit[] = [];
  let splitSamples = 0;
  let hidden = 0;
  for (const [origin, list] of byOrigin) {
    const byT = new Map<string, EvidenceSample[]>();
    for (const s of list) byT.set(s.territoryId, [...(byT.get(s.territoryId) ?? []), s]);
    const parts = [...byT.entries()]
      .filter(([, m]) => m.length >= 5 && m.length / list.length >= 0.05)
      .sort((a, b) => b[1].length - a[1].length);
    if (parts.length < 2) continue;
    splitSamples += list.length;
    hidden += list.length - parts[0]![1].length;
    const territoriesOut = parts.map(([id, members]) => {
      const t = tById.get(id)!;
      const segs = new Map<string, number>();
      for (const m of members) {
        const seg = pathSegment(m.path) ?? (m.path === '/' ? 'home' : 'other');
        segs.set(seg, (segs.get(seg) ?? 0) + 1);
      }
      return {
        id,
        name: t.name,
        label: t.label,
        suggestedLabel: t.suggestedLabel,
        samples: members.length,
        share: members.length / list.length,
        topPaths: [...segs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([segment, count]) => ({ segment, count })),
      };
    });
    const inParts = parts.flatMap(([id, m]) => m.map((s) => ({ id, seg: pathSegment(s.path) ?? (s.path === '/' ? 'home' : 'other') })));
    const labels = new Set(territoriesOut.map((t) => effective(t)).filter((l) => l != null));
    splits.push({
      origin,
      samples: list.length,
      territories: territoriesOut,
      pathAgreementNmi: nmi(inParts.map((x) => x.id), inParts.map((x) => x.seg)),
      labelsDiffer: labels.size >= 2,
    });
  }
  // Best example: labels differ first (the Deep/Drain story), then more samples.
  splits.sort((a, b) => Number(b.labelsDiffer) - Number(a.labelsDiffer) || b.samples - a.samples);

  // Silhouette of the same vectors under both groupings.
  const originIdx = new Map<string, number>();
  const terrIdx = new Map<string, number>();
  const pts = samples.map((s) => s.vec);
  const byDomain = samples.map((s) => originIdx.get(s.origin) ?? (originIdx.set(s.origin, originIdx.size), originIdx.size - 1));
  const byTerr = samples.map((s) => terrIdx.get(s.territoryId) ?? (terrIdx.set(s.territoryId, terrIdx.size), terrIdx.size - 1));
  return {
    generatedAt: new Date(now).toISOString(),
    samples: samples.length,
    territories: terrIdx.size,
    origins: originIdx.size,
    silhouetteByDomain: originIdx.size >= 2 ? silhouette(pts, byDomain, originIdx.size) : null,
    silhouetteByTerritory: terrIdx.size >= 2 ? silhouette(pts, byTerr, terrIdx.size) : null,
    originsSplit: splits.length,
    hiddenByDomainShare: splitSamples > 0 ? hidden / splitSamples : null,
    examples: splits.slice(0, 5),
  };
}

/** Loads the most recent vectored, assigned samples (default 3,000) and builds the report. */
export async function loadEvidence(limit = 3000, now = Date.now()): Promise<EvidenceReport> {
  const db = await openDb();
  const samples: EvidenceSample[] = [];
  let cursor = await db.transaction('samples').store.index('ts').openCursor(null, 'prev');
  while (cursor && samples.length < limit) {
    const s = cursor.value;
    const vec = s.vector ? toStoredDim(s.vector) : null;
    if (vec && s.territoryId) samples.push({ origin: s.origin, path: s.path, territoryId: s.territoryId, vec });
    cursor = await cursor.continue();
  }
  return buildEvidence(samples, await db.getAll('territories'), now);
}

