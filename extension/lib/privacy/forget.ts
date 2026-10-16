import { getAll, openDb, put, type ForgetLogRecord, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { meanUnit } from '@/lib/ml/kmeans';
import { baselineName } from '@/lib/ml/names';
import { toStoredDim } from '@/lib/ml/territories';
import { uniqueNames } from '@/lib/ml/territories-core';
import { regenerateReports } from '@/lib/metrics/service';
import { BIN_MS, dateKey } from '@/lib/metrics/time';
import { refreshPrediction } from '@/lib/ml/evaluate';

/**
 * Forget with cascade (PDD 11.4): delete the samples and bins, recompute the centroids of the
 * territories they belonged to, rename unconfirmed ones, regenerate affected reports, retrain the
 * Markov model on what is left, and log only *what kind* of thing was forgotten.
 */
export interface ForgetReport {
  samples: number;
  bins: number;
  nudges: number;
  recorderEvents: number;
  territoriesUpdated: number;
  territoriesRemoved: number;
  reportsRegenerated: number;
}

interface Removed {
  samples: number;
  bins: number;
  nudges: number;
  recorderEvents: number;
  territoryIds: Set<string>;
  dates: Set<string>;
}

const emptyRemoved = (): Removed => ({ samples: 0, bins: 0, nudges: 0, recorderEvents: 0, territoryIds: new Set(), dates: new Set() });

/** Site key from a user entry or an origin: lower-case host without scheme, path or "www.". */
export function siteKey(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return s;
}

/** True if `origin` (or a bare host) is `site` or one of its subdomains. */
export function originMatchesSite(origin: string, site: string): boolean {
  const host = siteKey(origin);
  return host === site || host.endsWith(`.${site}`);
}

/** Forgets everything observed in [from, to] (epoch ms, inclusive). */
export async function forgetRange(from: number, to: number, now = Date.now()): Promise<ForgetReport> {
  const db = await openDb();
  const removed = emptyRemoved();
  const range = IDBKeyRange.bound(from, to);

  const tx = db.transaction('samples', 'readwrite');
  let cur = await tx.store.index('ts').openCursor(range);
  while (cur) {
    const s = cur.value;
    if (s.territoryId) removed.territoryIds.add(s.territoryId);
    removed.dates.add(dateKey(s.ts));
    await cur.delete();
    removed.samples++;
    cur = await cur.continue();
  }
  await tx.done;

  // A bin is covered if it overlaps the range at all.
  const binFrom = Math.floor(from / BIN_MS) * BIN_MS;
  const binTx = db.transaction('bins', 'readwrite');
  let bc = await binTx.store.openCursor(IDBKeyRange.bound(binFrom, to));
  while (bc) {
    removed.dates.add(dateKey(bc.value.binStart));
    if (bc.value.territoryId) removed.territoryIds.add(bc.value.territoryId);
    await bc.delete();
    removed.bins++;
    bc = await bc.continue();
  }
  await binTx.done;

  removed.nudges = await deleteByTs('nudges', range);
  removed.recorderEvents = await deleteByTs('recorderEvents', range);

  return cascade(removed, { kind: 'range', range: { from, to } }, now);
}

/** Forgets everything from one site (host and its subdomains). Optionally adds it to the blocklist (done by the caller). */
export async function forgetSite(siteInput: string, now = Date.now()): Promise<ForgetReport> {
  const site = siteKey(siteInput);
  if (!site || !site.includes('.')) throw new Error('Enter a site like example.com');
  const db = await openDb();
  const removed = emptyRemoved();
  const covered: Array<[number, number]> = [];

  // Distinct origins from the index, then only those samples.
  const origins: string[] = [];
  let kc = await db.transaction('samples').store.index('origin').openKeyCursor(null, 'nextunique');
  while (kc) {
    if (originMatchesSite(String(kc.key), site)) origins.push(String(kc.key));
    kc = await kc.continue();
  }
  const tx = db.transaction('samples', 'readwrite');
  for (const origin of origins) {
    let cur = await tx.store.index('origin').openCursor(IDBKeyRange.only(origin));
    while (cur) {
      const s = cur.value as SampleRecord;
      if (s.territoryId) removed.territoryIds.add(s.territoryId);
      removed.dates.add(dateKey(s.ts));
      covered.push([s.ts, s.ts + Math.max(0, s.dwellMs)]);
      await cur.delete();
      removed.samples++;
      cur = await cur.continue();
    }
  }
  await tx.done;

  // Bins carry no origin: remove the bins that the forgotten items overlapped.
  const binKeys = new Set<number>();
  for (const [a, b] of covered) {
    for (let k = Math.floor(a / BIN_MS) * BIN_MS; k <= b; k += BIN_MS) binKeys.add(k);
  }
  const binTx = db.transaction('bins', 'readwrite');
  for (const k of binKeys) {
    const bin = await binTx.store.get(k);
    if (!bin) continue;
    removed.dates.add(dateKey(bin.binStart));
    if (bin.territoryId) removed.territoryIds.add(bin.territoryId);
    await binTx.store.delete(k);
    removed.bins++;
  }
  await binTx.done;

  // Dev-mode recorder events name origins too.
  const rtx = db.transaction('recorderEvents', 'readwrite');
  let rc = await rtx.store.openCursor();
  while (rc) {
    const o = (rc.value.event as { origin?: unknown }).origin;
    if (typeof o === 'string' && originMatchesSite(o, site)) {
      await rc.delete();
      removed.recorderEvents++;
    }
    rc = await rc.continue();
  }
  await rtx.done;

  return cascade(removed, { kind: 'site', site }, now);
}

async function deleteByTs(store: 'nudges' | 'recorderEvents', range: IDBKeyRange): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  let n = 0;
  let cur = await tx.store.index('ts').openCursor(range);
  while (cur) {
    await cur.delete();
    n++;
    cur = await cur.continue();
  }
  await tx.done;
  return n;
}

async function cascade(removed: Removed, log: Pick<ForgetLogRecord, 'kind' | 'range' | 'site'>, now: number): Promise<ForgetReport> {
  const { updated, dropped } = await recomputeTerritories(removed.territoryIds);
  const redone = await regenerateReports([...removed.dates], now);
  // The Markov model trains on stored bins; refresh it so forgotten time no longer shapes it.
  await refreshPrediction(now, true).catch(() => undefined);
  await put('forgetLog', { ts: now, ...log });
  return {
    samples: removed.samples,
    bins: removed.bins,
    nudges: removed.nudges,
    recorderEvents: removed.recorderEvents,
    territoriesUpdated: updated,
    territoriesRemoved: dropped,
    reportsRegenerated: redone.length,
  };
}

/**
 * Centroid and size from the members that remain. A territory with no members left is removed, unless
 * the owner confirmed its label: then it stays dormant (size 0), like after a re-cluster (D-53).
 * Unconfirmed names are recomputed from what remains.
 */
export async function recomputeTerritories(ids: Set<string>): Promise<{ updated: number; dropped: number }> {
  if (ids.size === 0) return { updated: 0, dropped: 0 };
  const db = await openDb();
  const all = (await getAll('territories')) as TerritoryRecord[];
  let updated = 0;
  let dropped = 0;
  for (const t of all) {
    if (!ids.has(t.id)) continue;
    const members = (await db.getAllFromIndex('samples', 'territoryId', t.id)) as SampleRecord[];
    const vectors = members.flatMap((m) => (m.vector ? [toStoredDim(m.vector)].filter((v): v is Float32Array => v != null) : []));
    if (members.length === 0 || vectors.length === 0) {
      if (t.labelConfirmed) {
        await put('territories', { ...t, size: 0 });
        updated++;
      } else {
        await db.delete('territories', t.id);
        dropped++;
      }
      continue;
    }
    const centroid = meanUnit(vectors, vectors[0]!.length) ?? t.centroid;
    await put('territories', {
      ...t,
      centroid,
      size: members.length,
      name: t.labelConfirmed ? t.name : baselineName(members),
      lastSeen: members.reduce((m, s) => Math.max(m, s.ts), 0),
    });
    updated++;
  }
  // Names stay unique among the unconfirmed territories.
  const fresh = (await getAll('territories')) as TerritoryRecord[];
  uniqueNames(fresh);
  for (const t of fresh) await put('territories', t);
  return { updated, dropped };
}
