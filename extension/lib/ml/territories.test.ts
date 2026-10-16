import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll, get, put, STORE_NAMES, type BinRecord, type SampleRecord } from '@/lib/db';
import { plantedClusters } from './testutil';
import { assignOnline, getMeta, loadTerritoryView, recluster, setTerritoryAllowance, setTerritoryLabel, syncAssignments } from './territories';
import { writeVector } from './service';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const T0 = new Date(2026, 9, 16, 10, 0, 0).getTime();
const hosts = ['https://www.youtube.com', 'https://docs.example', 'https://news.example', 'https://www.reddit.com', 'https://mail.example'];

async function seed(k = 5, per = 40, opts: { vectorless?: number; seed?: number } = {}) {
  const { points, labels } = plantedClusters(k, per, 256, 0.3, opts.seed ?? 7);
  // Interleave clusters in time so every cluster spans the whole window.
  const order = points.map((_, i) => i).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
  let n = 0;
  for (const i of order) {
    const rec: SampleRecord = {
      ts: T0 + n * 10_000,
      tabId: 1,
      origin: hosts[labels[i]! % hosts.length]!,
      path: `/sec${labels[i]}/page`,
      isVisual: false,
      dwellMs: 10_000,
      vector: points[i]!,
      territoryId: null,
      territoryDist: null,
    };
    await put('samples', rec);
    n++;
  }
  for (let v = 0; v < (opts.vectorless ?? 0); v++) {
    await put('samples', { ts: T0 + n++ * 10_000, tabId: 1, origin: hosts[0]!, path: '/x', isVisual: false, dwellMs: 0, vector: null, territoryId: null, territoryDist: null });
  }
  return { points, labels, total: n };
}

const bin = (binStart: number): BinRecord => ({
  binStart, active_s: 30, territoryId: null, away: false, idle: false, nudgeShown: false, nudgeResponse: null,
  scroll_px_s_mean: 0, items_per_min: 0, mean_dwell_ms: 0, video_skip_rate: 0, tab_switches: 0, away_s: 0, idle_s: 0,
});

describe('recluster', () => {
  it('refuses with too few vectors, and forces at 60', async () => {
    await seed(3, 15); // 45 vectors
    expect((await recluster()).ok).toBe(false);
    expect((await recluster({ force: true })).reason).toMatch(/at least 60/);
    await seed(3, 30, { seed: 9 }); // + 90
    expect((await recluster({ force: true })).ok).toBe(true);
  });

  it('builds territories, assigns every sample and carries vectorless ones', async () => {
    await seed(5, 40, { vectorless: 3 });
    const r = await recluster({ force: true, now: T0 + 1e6 });
    expect(r.ok).toBe(true);
    expect(r.k).toBe(5);
    const ts = await getAll('territories');
    expect(ts).toHaveLength(5);
    expect(ts.reduce((s, t) => s + t.size, 0)).toBe(203); // 200 vectored + 3 carried
    const samples = (await getAll('samples')) as SampleRecord[];
    expect(samples.every((s) => s.territoryId != null)).toBe(true);
    const carried = samples.filter((s) => s.vector == null);
    expect(new Set(carried.map((s) => s.territoryId)).size).toBe(1);
    expect(carried[0]!.territoryDist).toBeNull();
    const meta = await getMeta();
    expect(meta.k).toBe(5);
    expect(meta.firstRunAt).toBe(T0 + 1e6);
  });

  it('keeps IDs, labels and allowances across a forced re-cluster', async () => {
    await seed();
    await recluster({ force: true, now: 1 });
    const [a, b] = await getAll('territories');
    await setTerritoryLabel(a!.id, 'drain');
    await setTerritoryAllowance(a!.id, 25);
    await setTerritoryLabel(b!.id, 'deep');
    const idsBefore = (await getAll('territories')).map((t) => t.id).sort();

    const r = await recluster({ force: true, now: 2 });
    expect(r).toMatchObject({ ok: true, matched: 5, created: 0 });
    expect((await getAll('territories')).map((t) => t.id).sort()).toEqual(idsBefore);
    expect(await get('territories', a!.id)).toMatchObject({ label: 'drain', labelConfirmed: true, allowanceMin: 25 });
    expect(await get('territories', b!.id)).toMatchObject({ label: 'deep', allowanceMin: null });
    const samples = (await getAll('samples')) as SampleRecord[];
    const ids = new Set(idsBefore);
    expect(samples.every((s) => s.territoryId && ids.has(s.territoryId))).toBe(true);
  });

  it('sets bin territories from the samples they cover', async () => {
    await seed();
    for (let i = 0; i < 10; i++) await put('bins', bin(T0 + i * 30_000));
    await recluster({ force: true, now: 1 });
    const bins = (await getAll('bins')) as BinRecord[];
    expect(bins.every((b) => b.territoryId != null)).toBe(true);
  });

  it('serialises concurrent runs', async () => {
    await seed();
    const [a, b] = await Promise.all([recluster({ force: true, now: 1 }), recluster({ force: true, now: 1 })]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it('stores no item text, query strings or fragments', async () => {
    await seed();
    await recluster({ force: true, now: 1 });
    for (const name of STORE_NAMES) {
      const json = JSON.stringify(await getAll(name), (_k, v) => (ArrayBuffer.isView(v) ? '[vec]' : v));
      expect(json).not.toMatch(/\?|#/);
      expect(json).not.toContain('"text"');
    }
  });

  it('truncates 768d dev-mode vectors for clustering', async () => {
    const { points } = plantedClusters(4, 30, 768, 0.3, 3);
    points.forEach((v, i) => void put('samples', { ts: T0 + i * 1000, tabId: 1, origin: 'https://a.example', path: '/', isVisual: false, dwellMs: 0, vector: v, territoryId: null, territoryDist: null }));
    await new Promise((r) => setTimeout(r, 20));
    const r = await recluster({ force: true, now: 1 });
    expect(r.ok).toBe(true);
    expect((await getAll('territories'))[0]!.centroid).toHaveLength(256);
  });
});

describe('online assignment and sync', () => {
  it('assignOnline is null before territories exist, then returns the nearest', async () => {
    const { points } = await seed();
    expect(await assignOnline(points[0]!)).toBeNull();
    await recluster({ force: true, now: 1 });
    const a = await assignOnline(points[0]!);
    expect(a?.territoryId).toBeTruthy();
    expect(a!.territoryDist!).toBeLessThan(0.5);
    const far = Float32Array.from({ length: 256 }, (_, i) => (i === 0 ? 1 : 0));
    expect((await assignOnline(far))?.territoryId).toBeNull();
  });

  it('writeVector stores the territory with the vector', async () => {
    const { points } = await seed();
    await recluster({ force: true, now: 1 });
    await put('samples', { ts: T0 + 9e6, tabId: 2, origin: 'https://a.example', path: '/', isVisual: false, dwellMs: 0, vector: null, territoryId: null, territoryDist: null });
    expect(await writeVector({ tabId: 2, ts: T0 + 9e6 }, points[0]!, async () => undefined, assignOnline)).toBe(true);
    const row = ((await getAll('samples')) as SampleRecord[]).find((s) => s.tabId === 2)!;
    expect(row.territoryId).toBeTruthy();
  });

  it('syncAssignments assigns new vectored samples, carries for vectorless, and sets bins', async () => {
    const { points } = await seed();
    await recluster({ force: true, now: T0 + 1e6 });
    const base = T0 + 2e6;
    await put('samples', { ts: base, tabId: 1, origin: 'https://a.example', path: '/', isVisual: false, dwellMs: 20_000, vector: points[0]!, territoryId: null, territoryDist: null });
    await put('samples', { ts: base + 20_000, tabId: 1, origin: 'https://a.example', path: '/', isVisual: false, dwellMs: 20_000, vector: null, territoryId: null, territoryDist: null });
    await put('bins', bin(base));
    const r = await syncAssignments(base + 60_000);
    expect(r).toMatchObject({ ok: true, assigned: 1, carried: 1 });
    expect(r.bins).toBe(1);
    const rows = ((await getAll('samples')) as SampleRecord[]).filter((s) => s.ts >= base).sort((a, b) => a.ts - b.ts);
    expect(rows[0]!.territoryId).toBeTruthy();
    expect(rows[1]!.territoryId).toBe(rows[0]!.territoryId);
    expect(((await get('bins', base)) as BinRecord).territoryId).toBe(rows[0]!.territoryId);
    // idempotent
    expect(await syncAssignments(base + 90_000)).toMatchObject({ assigned: 0, carried: 0 });
  });

  it('does nothing while there are no territories', async () => {
    await seed();
    expect(await syncAssignments()).toMatchObject({ ok: true, assigned: 0 });
  });
});

describe('labels and view', () => {
  it('setTerritoryAllowance only applies to Drain and is clamped', async () => {
    await seed();
    await recluster({ force: true, now: 1 });
    const [a] = await getAll('territories');
    await setTerritoryAllowance(a!.id, 30);
    expect((await get('territories', a!.id))!.allowanceMin).toBeNull();
    await setTerritoryLabel(a!.id, 'drain');
    expect((await get('territories', a!.id))!.allowanceMin).toBe(15);
    await setTerritoryAllowance(a!.id, 9999);
    expect((await get('territories', a!.id))!.allowanceMin).toBe(1440);
  });

  it("loadTerritoryView reports top origins and today's minutes", async () => {
    await seed();
    for (let i = 0; i < 20; i++) await put('bins', bin(T0 + i * 30_000));
    await recluster({ force: true, now: T0 + 1e6 });
    const view = await loadTerritoryView(T0 + 1e6);
    expect(view).toHaveLength(5);
    expect(view[0]!.topOrigins[0]!.count).toBeGreaterThan(0);
    expect(view.reduce((s, v) => s + v.todayMin, 0)).toBeCloseTo(10, 0); // 20 bins × 30 s
    expect(view.every((v) => !v.dormant)).toBe(true);
  });
});
