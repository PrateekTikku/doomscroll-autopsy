import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAll, closeDb, DB_NAME, DB_VERSION, get, getAll, getByTs, getRange, openDb, put, STORE_NAMES } from './index';
import type { BinRecord, SampleRecord } from './schema';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const sample = (ts: number, vector: Float32Array | null = null): SampleRecord => ({
  ts,
  tabId: 1,
  origin: 'https://example.com',
  path: '/a',
  isVisual: false,
  dwellMs: 1200,
  vector,
  territoryId: null,
  territoryDist: null,
});

const bin = (binStart: number): BinRecord => ({
  binStart,
  scroll_px_s_mean: 0,
  items_per_min: 0,
  mean_dwell_ms: 0,
  video_skip_rate: 0,
  tab_switches: 0,
  away_s: 0,
  idle_s: 0,
  territoryId: null,
  away: false,
  idle: false,
  nudgeShown: false,
  nudgeResponse: null,
});

describe('lib/db', () => {
  it('creates every store from PDD 8.1 (plus recorderEvents) at the current version', async () => {
    const db = await openDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort());
    expect(db.objectStoreNames.contains('settings' as never)).toBe(false); // D-52
  });

  it('creates the expected indexes', async () => {
    const db = await openDb();
    const tx = db.transaction(['samples', 'nudges', 'recorderEvents']);
    expect([...tx.objectStore('samples').indexNames].sort()).toEqual(['origin', 'territoryId', 'ts']);
    expect([...tx.objectStore('nudges').indexNames]).toEqual(['ts']);
    expect([...tx.objectStore('recorderEvents').indexNames]).toEqual(['ts']);
  });

  it('round-trips a sample and keeps its Float32Array vector', async () => {
    const vector = new Float32Array([0.6, 0.8]);
    const id = await put('samples', sample(1000, vector));
    const stored = await get('samples', id);
    expect(stored?.vector).toBeInstanceOf(Float32Array);
    expect(Array.from(stored!.vector!)).toEqual([Array.from(vector)[0], Array.from(vector)[1]]);
  });

  it('reads bins by key range and samples by ts index', async () => {
    for (const t of [0, 30_000, 60_000, 90_000]) await put('bins', bin(t));
    expect((await getRange('bins', 30_000, 60_000)).map((b) => b.binStart)).toEqual([30_000, 60_000]);

    for (const t of [10, 20, 30]) await put('samples', sample(t));
    expect((await getByTs('samples', 15, 30)).map((s) => s.ts)).toEqual([20, 30]);
  });

  it('clearAll empties every store', async () => {
    await put('samples', sample(1));
    await put('bins', bin(0));
    await put('forgetLog', { ts: 1, kind: 'site', site: 'https://example.com' });
    await clearAll();
    for (const store of STORE_NAMES) expect(await getAll(store)).toEqual([]);
  });

  it('reopens an existing database without re-running the upgrade', async () => {
    await put('samples', sample(5));
    await closeDb();
    expect((await getAll('samples')).length).toBe(1);
  });
});
