import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, get, put } from '@/lib/db';
import { getNightlyMeta, isNightlyDue, runNightly } from './background';
import { binsFrom, TERRITORIES } from './testutil';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('nightly job', () => {
  it('is due when it has not run since the last 03:00', () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).getTime();
    expect(isNightlyDue(null, at(16, 12))).toBe(true);
    expect(isNightlyDue(at(16, 3) + 60_000, at(16, 12))).toBe(false);
    expect(isNightlyDue(at(15, 22), at(16, 2))).toBe(false); // before 03:00 the boundary is yesterday's
    expect(isNightlyDue(at(15, 22), at(16, 4))).toBe(true);
  });

  it('runs retention, then writes reports for finished days, and records itself', async () => {
    for (const t of TERRITORIES) await put('territories', t);
    for (const b of binsFrom('2026-10-15', '09:00', [[40, 'doc'], [20, 'reels']])) await put('bins', b);
    const now = new Date(2026, 9, 16, 4, 0).getTime();
    const meta = await runNightly(now);
    expect(meta.error).toBeNull();
    expect(meta.reportsWritten).toEqual(['2026-10-15']);
    const report = await get('reports', '2026-10-15');
    expect(report!.facts.deepBlocks.count).toBe(1);
    expect(report!.autopsy.length).toBeGreaterThan(100);
    expect(await getNightlyMeta()).toMatchObject({ lastRunAt: now });
  });

  it('also works with a single short day', async () => {
    // A bin for a day far past retention is removed; reports still run.
    for (const b of binsFrom('2026-10-15', '09:00', [[30, 'doc']])) await put('bins', b);
    const meta = await runNightly(new Date(2026, 9, 16, 4, 0).getTime());
    expect(meta.reportsWritten).toEqual(['2026-10-15']);
  });
});
