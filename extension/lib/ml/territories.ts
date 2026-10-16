import { clearStore, get, getAll, getByTs, getRange, openDb, put, type BinRecord, type Label, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { fitClusters } from './kmeans';
import { topOrigins } from './names';
import {
  applyLabel,
  assignSample,
  binTerritories,
  buildTerritories,
  carryTerritories,
  EMPTY_META,
  MIN_FIRST_CLUSTER_VECTORS,
  MIN_FORCED_VECTORS,
  type Assignment,
  type TerritoryMeta,
  type TimedSample,
} from './territories-core';
import { truncateAndNormalize } from './truncate';

/**
 * Territory storage and orchestration (PDD 9.2): re-clustering, online assignment, the sync sweep
 * for samples and bins, and label edits. Pure logic lives in `territories-core.ts`.
 */

export const STORED_DIM = 256;
export const MAX_CLUSTER_VECTORS = 6000;
const META_KEY = 'territories-meta';
const SYNC_OVERLAP_MS = 2 * 60_000;
const BIN_LOOKBACK_MS = 5 * 60_000;
const DAY_MS = 24 * 3600_000;

let reclustering = false;
export const isReclustering = () => reclustering;

export async function getMeta(): Promise<TerritoryMeta> {
  const rec = await get('models', META_KEY);
  return { ...EMPTY_META, ...(rec?.data as Partial<TerritoryMeta> | undefined) };
}

async function putMeta(meta: TerritoryMeta): Promise<void> {
  await put('models', { name: META_KEY, updatedAt: Date.now(), data: meta });
}

/** 256d view of a stored vector (dev-mode rows are 768d, PDD 8.3). */
export function toStoredDim(v: Float32Array): Float32Array | null {
  return v.length === STORED_DIM ? v : truncateAndNormalize(v, STORED_DIM);
}

/** Counts vectored samples, stopping at `limit` (cheap enough for the 30-minute check). */
export async function countVectors(limit: number): Promise<number> {
  const db = await openDb();
  let n = 0;
  let cursor = await db.transaction('samples').store.index('ts').openCursor(null, 'prev');
  while (cursor && n < limit) {
    if (cursor.value.vector) n++;
    cursor = await cursor.continue();
  }
  return n;
}

interface Vectored {
  ts: number;
  origin: string;
  path: string;
  vec: Float32Array;
}

/** The most recent `limit` samples that have a vector, oldest first. */
async function loadRecentVectored(limit: number): Promise<Vectored[]> {
  const db = await openDb();
  const out: Vectored[] = [];
  let cursor = await db.transaction('samples').store.index('ts').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    const s = cursor.value;
    const vec = s.vector ? toStoredDim(s.vector) : null;
    if (vec) out.push({ ts: s.ts, origin: s.origin, path: s.path, vec });
    cursor = await cursor.continue();
  }
  return out.reverse();
}

export interface ReclusterReport {
  ok: boolean;
  reason?: string;
  k?: number;
  territories?: number;
  matched?: number;
  created?: number;
  dormant?: number;
  samples?: number;
  silhouette?: number;
  /** Centroid similarity of each kept territory (C2 stability measurement). */
  similarities?: number[];
  ms?: number;
}

function newTerritoryId(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return `t-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Re-cluster: k-means on the most recent vectors, Hungarian-match to the old territories, write the
 * territory set in one transaction, then re-assign every sample and bin. `force` lowers the minimum
 * to 60 vectors (the dashboard button).
 */
export async function recluster(opts: { force?: boolean; now?: number } = {}): Promise<ReclusterReport> {
  if (reclustering) return { ok: false, reason: 'already running' };
  reclustering = true;
  const t0 = performance.now();
  try {
    const now = opts.now ?? Date.now();
    const data = await loadRecentVectored(MAX_CLUSTER_VECTORS);
    const min = opts.force ? MIN_FORCED_VECTORS : MIN_FIRST_CLUSTER_VECTORS;
    if (data.length < min) return { ok: false, reason: `need at least ${min} embedded items, have ${data.length}`, samples: data.length };

    const fit = fitClusters(data.map((d) => d.vec), { seed: 1 });
    const old = await getAll('territories');
    const built = buildTerritories({ fit, samples: data, old, now, newId: newTerritoryId });

    // Atomic swap of the territory set.
    const db = await openDb();
    const tx = db.transaction('territories', 'readwrite');
    await tx.store.clear();
    for (const t of built.territories) await tx.store.put(t);
    await tx.done;

    const counts = await relabelAll(built.territories);
    const final = built.territories.map((t) => ({ ...t, size: counts.get(t.id) ?? 0 }));
    for (const t of final) await put('territories', t);

    const meta = await getMeta();
    await putMeta({ ...meta, lastRunAt: now, firstRunAt: meta.firstRunAt ?? now, lastSyncTs: now, k: fit.k });
    return {
      ok: true,
      k: fit.k,
      territories: final.length,
      matched: built.matched,
      created: built.created,
      dormant: built.dormant,
      samples: data.length,
      silhouette: fit.silhouette,
      similarities: built.similarities,
      ms: Math.round(performance.now() - t0),
    };
  } finally {
    reclustering = false;
  }
}

/** Re-assigns every sample (carrying territories to vectorless ones) and every bin. Returns member counts. */
async function relabelAll(territories: TerritoryRecord[]): Promise<Map<string, number>> {
  const db = await openDb();
  const counts = new Map<string, number>();
  const timed: TimedSample[] = [];
  const tx = db.transaction('samples', 'readwrite');
  let prev: string | null = null;
  let cursor = await tx.store.index('ts').openCursor();
  while (cursor) {
    const s = cursor.value;
    let territoryId: string | null;
    let territoryDist: number | null;
    const vec = s.vector ? toStoredDim(s.vector) : null;
    if (vec) {
      ({ territoryId, territoryDist } = assignSample(vec, territories));
      prev = territoryId;
    } else {
      territoryId = prev;
      territoryDist = null;
    }
    if (territoryId !== s.territoryId || territoryDist !== s.territoryDist) await cursor.update({ ...s, territoryId, territoryDist });
    if (territoryId) counts.set(territoryId, (counts.get(territoryId) ?? 0) + 1);
    timed.push({ ts: s.ts, dwellMs: s.dwellMs, territoryId });
    cursor = await cursor.continue();
  }
  await tx.done;
  await relabelBins(timed, 0, Infinity);
  return counts;
}

async function relabelBins(timed: TimedSample[], from: number, to: number): Promise<number> {
  const db = await openDb();
  const bins = (await getRange('bins', from, Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER)) as BinRecord[];
  if (bins.length === 0) return 0;
  const map = binTerritories(bins.map((b) => b.binStart), timed);
  const tx = db.transaction('bins', 'readwrite');
  let changed = 0;
  for (const b of bins) {
    const id = map.get(b.binStart) ?? null;
    if (id !== b.territoryId) {
      // Re-read inside the transaction so nudge flags written meanwhile (M4) are not overwritten.
      const fresh = (await tx.store.get(b.binStart)) ?? b;
      await tx.store.put({ ...fresh, territoryId: id });
      changed++;
    }
  }
  await tx.done;
  return changed;
}

/** Assigns a fresh vector right after it is written (called by the embed service). Null while a re-cluster runs. */
export async function assignOnline(vector: Float32Array): Promise<Assignment | null> {
  if (reclustering) return null;
  const v = toStoredDim(vector);
  if (!v) return null;
  const territories = await getAll('territories');
  if (territories.length === 0) return null;
  return assignSample(v, territories);
}

export interface SyncReport {
  ok: boolean;
  assigned: number;
  carried: number;
  bins: number;
}

/**
 * Incremental sweep (runs every minute and when the dashboard opens): assigns recent samples that
 * have no territory yet, carries territories to vectorless ones, and sets bin territories. Only
 * looks at samples since the last sync (minus an overlap), because IndexedDB can't index `null`.
 */
export async function syncAssignments(now = Date.now()): Promise<SyncReport> {
  if (reclustering) return { ok: false, assigned: 0, carried: 0, bins: 0 };
  const territories = await getAll('territories');
  if (territories.length === 0) return { ok: true, assigned: 0, carried: 0, bins: 0 };
  const meta = await getMeta();
  const from = (meta.lastSyncTs ?? now - 2 * 3600_000) - SYNC_OVERLAP_MS;
  const rows = ((await getByTs('samples', from, now)) as SampleRecord[]).sort((a, b) => a.ts - b.ts);

  // The sample just before the window supplies the carry-over start.
  const db = await openDb();
  const beforeCursor = await db.transaction('samples').store.index('ts').openCursor(IDBKeyRange.upperBound(from, true), 'prev');
  const before = beforeCursor?.value ?? null;

  let assigned = 0;
  let carried = 0;
  const before0 = new Map(rows.map((r) => [r.id!, { id: r.territoryId, dist: r.territoryDist }]));
  for (const r of rows) {
    if (r.vector && r.territoryId == null) {
      const v = toStoredDim(r.vector);
      if (v) {
        const a = assignSample(v, territories);
        if (a.territoryId != null) assigned++;
        r.territoryId = a.territoryId;
        r.territoryDist = a.territoryDist;
      }
    }
  }
  carryTerritories(rows, before?.territoryId ?? null);
  const tx = db.transaction('samples', 'readwrite');
  for (const r of rows) {
    const o = before0.get(r.id!)!;
    if (o.id === r.territoryId && o.dist === r.territoryDist) continue;
    // Re-read so a concurrent dwell update isn't overwritten with the stale copy.
    const fresh = await tx.store.get(r.id!);
    if (!fresh) continue;
    if (!r.vector) carried++;
    await tx.store.put({ ...fresh, territoryId: r.territoryId, territoryDist: r.territoryDist });
  }
  await tx.done;

  const timed: TimedSample[] = [...(before ? [before] : []), ...rows].map((s) => ({ ts: s.ts, dwellMs: s.dwellMs, territoryId: s.territoryId }));
  const bins = await relabelBins(timed, from - BIN_LOOKBACK_MS, now);
  await putMeta({ ...(await getMeta()), lastSyncTs: now });
  return { ok: true, assigned, carried, bins };
}

// ---- Dashboard helpers (labeling, task 6) ----

export async function setTerritoryLabel(id: string, label: Label): Promise<TerritoryRecord | null> {
  const t = await get('territories', id);
  if (!t) return null;
  const next = applyLabel(t, label);
  await put('territories', next);
  return next;
}

export async function setTerritoryAllowance(id: string, minutes: number): Promise<void> {
  const t = await get('territories', id);
  if (!t || t.label !== 'drain') return;
  await put('territories', { ...t, allowanceMin: Math.max(0, Math.min(24 * 60, Math.round(minutes))) });
}

export async function deleteTerritory(id: string): Promise<void> {
  const db = await openDb();
  await db.delete('territories', id);
}

export interface TerritoryView {
  territory: TerritoryRecord;
  topOrigins: Array<{ origin: string; count: number }>;
  todayMin: number;
  /** Confirmed by the owner but no longer produced by the clustering. */
  dormant: boolean;
}

/** Territories with their top origins (last 7 days) and today's minutes (from bins), biggest first. */
export async function loadTerritoryView(now = Date.now()): Promise<TerritoryView[]> {
  const territories = await getAll('territories');
  if (territories.length === 0) return [];
  const db = await openDb();
  const byTerritory = new Map<string, Array<{ origin: string; path: string }>>();
  let cursor = await db.transaction('samples').store.index('ts').openCursor(IDBKeyRange.lowerBound(now - 7 * DAY_MS));
  while (cursor) {
    const s = cursor.value;
    if (s.territoryId) {
      const list = byTerritory.get(s.territoryId) ?? [];
      list.push({ origin: s.origin, path: s.path });
      byTerritory.set(s.territoryId, list);
    }
    cursor = await cursor.continue();
  }
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const bins = (await getRange('bins', day.getTime(), now)) as BinRecord[];
  const seconds = new Map<string, number>();
  for (const b of bins) if (b.territoryId) seconds.set(b.territoryId, (seconds.get(b.territoryId) ?? 0) + b.active_s);
  return territories
    .map((t) => ({
      territory: t,
      topOrigins: topOrigins(byTerritory.get(t.id) ?? [], 3),
      todayMin: Math.round((seconds.get(t.id) ?? 0) / 6) / 10,
      dormant: t.size === 0,
    }))
    .sort((a, b) => b.territory.size - a.territory.size);
}

/** Dev/test helper. */
export async function clearTerritories(): Promise<void> {
  await clearStore('territories');
}
