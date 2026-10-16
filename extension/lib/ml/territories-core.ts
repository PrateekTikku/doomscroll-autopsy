import type { Label, SampleRecord, TerritoryRecord } from '@/lib/db';
import { nearestCentroid, type FitResult } from './kmeans';
import { matchCentroids } from './hungarian';
import { baselineName, suggestLabel, type Feed } from './names';

/** Pure territory logic (PDD 9.2): no storage, no browser APIs. */

export const DEFAULT_ALLOWANCE_MIN = 15;
/** Used for territories without a stored radius (cosine distance). */
export const DEFAULT_RADIUS = 0.5;
export const RADIUS_MARGIN = 1.25;
export const MIN_FIRST_CLUSTER_VECTORS = 300;
export const MIN_FORCED_VECTORS = 60;
export const DAY1_INTERVAL_MS = 2 * 3600_000;
export const NIGHTLY_HOUR = 3;

export interface Assignment {
  territoryId: string | null;
  /** Cosine distance to the nearest centroid (kept even when unassigned). */
  territoryDist: number | null;
}

/** Nearest centroid; "unassigned" (null id) when farther than the territory's radius. */
export function assignSample(vector: Float32Array, territories: TerritoryRecord[]): Assignment {
  const usable = territories.filter((t) => t.centroid.length === vector.length);
  if (usable.length === 0) return { territoryId: null, territoryDist: null };
  const { index, dist } = nearestCentroid(
    vector,
    usable.map((t) => t.centroid),
  );
  const t = usable[index]!;
  return { territoryId: dist <= (t.radius ?? DEFAULT_RADIUS) ? t.id : null, territoryDist: dist };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

export interface BuildInput {
  fit: FitResult;
  /** Samples in the same order as `fit.assignments`. */
  samples: Array<Pick<SampleRecord, 'ts' | 'origin' | 'path'>>;
  old: TerritoryRecord[];
  now: number;
  newId: () => string;
  feeds?: Feed[];
  shallowHosts?: string[];
}

export interface BuildResult {
  /** New and matched territories, then dormant confirmed ones. Sizes are the cluster sizes. */
  territories: TerritoryRecord[];
  matched: number;
  created: number;
  dormant: number;
  /** Similarity of each matched pair, for the C2 stability measurement. */
  similarities: number[];
}

/**
 * Turns a clustering result into territory records, matching them to the previous ones (Hungarian,
 * > 0.8) so ID, name, label and allowance survive. Unmatched old territories are dropped, except
 * owner-confirmed ones, which stay dormant with their old centroid.
 */
export function buildTerritories(input: BuildInput): BuildResult {
  const { fit, samples, old, now } = input;
  const match = matchCentroids(fit.centroids, old.map((t) => t.centroid));
  const out: TerritoryRecord[] = [];
  const similarities: number[] = [];
  const usedOld = new Set<number>();
  let created = 0;

  fit.centroids.forEach((centroid, c) => {
    const idx: number[] = [];
    fit.assignments.forEach((a, i) => {
      if (a === c) idx.push(i);
    });
    const members = idx.map((i) => samples[i]!);
    const dists = idx.map((i) => fit.dists[i]!);
    const radius = Math.min(1, Math.max(0.05, percentile(dists, 0.95) * RADIUS_MARGIN));
    const lastSeen = members.reduce((m, s) => Math.max(m, s.ts), 0);
    const suggested = suggestLabel(members, input.feeds, input.shallowHosts);
    const oldIdx = match.newToOld[c];
    const prev = oldIdx != null ? old[oldIdx] : undefined;
    if (prev) {
      usedOld.add(oldIdx!);
      similarities.push(match.similarity[c]!);
      out.push({
        ...prev,
        centroid,
        size: members.length,
        radius,
        lastSeen: Math.max(prev.lastSeen, lastSeen),
        // Unconfirmed territories refresh their name and suggestion; confirmed ones keep theirs.
        name: prev.labelConfirmed ? prev.name : baselineName(members),
        suggestedLabel: prev.labelConfirmed ? prev.suggestedLabel : suggested,
      });
    } else {
      created++;
      out.push({
        id: input.newId(),
        centroid,
        size: members.length,
        name: baselineName(members),
        topicTags: [],
        suggestedLabel: suggested,
        label: null,
        labelConfirmed: false,
        allowanceMin: null,
        firstSeen: members.reduce((m, s) => Math.min(m, s.ts), now),
        lastSeen,
        radius,
      });
    }
  });

  uniqueNames(out);

  let dormant = 0;
  old.forEach((t, i) => {
    if (!usedOld.has(i) && t.labelConfirmed) {
      dormant++;
      out.push({ ...t, size: 0 });
    }
  });
  return { territories: out, matched: usedOld.size, created, dormant, similarities };
}

/**
 * Several territories can share a baseline name (e.g. three Shorts territories). Later ones, by size,
 * get " 2", " 3"… so the list is readable; names of confirmed territories are never changed.
 */
export function uniqueNames(territories: TerritoryRecord[]): void {
  const taken = new Set(territories.filter((t) => t.labelConfirmed).map((t) => t.name));
  const bySize = [...territories].filter((t) => !t.labelConfirmed).sort((a, b) => b.size - a.size);
  for (const t of bySize) {
    const base = t.name;
    let n = 1;
    while (taken.has(t.name)) t.name = `${base} ${++n}`;
    taken.add(t.name);
  }
}

/** Label change from the dashboard (task 6): confirms the label; Drain gets the default allowance. */
export function applyLabel(t: TerritoryRecord, label: Label): TerritoryRecord {
  return {
    ...t,
    label,
    labelConfirmed: true,
    allowanceMin: label === 'drain' ? (t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN) : null,
  };
}

export interface TimedSample {
  ts: number;
  dwellMs: number;
  territoryId: string | null;
}

const MAX_SAMPLE_SPAN_MS = 5 * 60_000;
const CARRY_MS = 5 * 60_000;

/** End of the time a sample covers: its dwell (if known), the next sample, or 5 minutes, whichever is first. */
function spanEnd(samples: TimedSample[], i: number): number {
  const s = samples[i]!;
  const next = samples[i + 1]?.ts ?? Infinity;
  const own = s.dwellMs > 0 ? s.ts + s.dwellMs : Infinity;
  return Math.min(own, next, s.ts + MAX_SAMPLE_SPAN_MS);
}

/**
 * Majority territory per bin, by overlap time. A sample covers [ts, spanEnd). A bin with no overlap
 * carries the latest sample that started within 5 minutes before the bin end. `samples` must be
 * sorted by ts; `binStarts` ascending.
 */
export function binTerritories(binStarts: number[], samples: TimedSample[], binMs = 30_000): Map<number, string | null> {
  const out = new Map<number, string | null>();
  let lo = 0; // samples before this can no longer overlap or carry
  for (const start of binStarts) {
    const end = start + binMs;
    while (lo < samples.length && samples[lo]!.ts + MAX_SAMPLE_SPAN_MS <= start - CARRY_MS) lo++;
    const weights = new Map<string, number>();
    let latest: TimedSample | null = null;
    for (let i = lo; i < samples.length && samples[i]!.ts < end; i++) {
      const s = samples[i]!;
      latest = s;
      const overlap = Math.min(end, spanEnd(samples, i)) - Math.max(start, s.ts);
      if (overlap > 0 && s.territoryId != null) weights.set(s.territoryId, (weights.get(s.territoryId) ?? 0) + overlap);
    }
    let best: string | null = null;
    let bestW = 0;
    for (const [id, w] of weights) {
      if (w > bestW) {
        best = id;
        bestW = w;
      }
    }
    if (best == null && latest && end - latest.ts <= CARRY_MS) best = latest.territoryId;
    out.set(start, best);
  }
  return out;
}

/** Vectorless samples inherit the previous sample's territory (K-12, PDD 9.9). Mutates and returns `ts`-sorted input. */
export function carryTerritories<T extends { vector: unknown; territoryId: string | null }>(sorted: T[], initial: string | null = null): T[] {
  let prev = initial;
  for (const s of sorted) {
    if (s.vector == null) s.territoryId = prev;
    else prev = s.territoryId;
  }
  return sorted;
}

export interface TerritoryMeta {
  lastRunAt: number | null;
  firstRunAt: number | null;
  lastSyncTs: number | null;
  k: number | null;
}

export const EMPTY_META: TerritoryMeta = { lastRunAt: null, firstRunAt: null, lastSyncTs: null, k: null };

/** Local 03:00 on the day of `now` (or the previous day if it hasn't happened yet today). */
export function lastNightlyBoundary(now: number): number {
  const d = new Date(now);
  d.setHours(NIGHTLY_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * Is a re-cluster due (PDD 9.2)? First run at ≥ 300 vectors; every 2 h during the first 24 h after
 * that; then once per night, at the first check after 03:00 local (so a sleeping laptop catches up).
 */
export function isReclusterDue(meta: TerritoryMeta, vectorCount: number, now: number): boolean {
  if (meta.lastRunAt == null || meta.firstRunAt == null) return vectorCount >= MIN_FIRST_CLUSTER_VECTORS;
  if (now - meta.firstRunAt < 24 * 3600_000) return now - meta.lastRunAt >= DAY1_INTERVAL_MS;
  return meta.lastRunAt < lastNightlyBoundary(now);
}
