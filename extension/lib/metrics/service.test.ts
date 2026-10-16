import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, get, getAll, openDb, put } from '@/lib/db';
import { generateReport, datesWithData, ensureReports, popupSummary, regenerateReports, successMetrics, summarizeSuccess } from './service';
import { addDays, dayStart } from './time';
import { binsFrom, emptyFacts, nudge, TERRITORIES } from './testutil';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  for (const t of TERRITORIES) await put('territories', t);
});

async function seedDay(date: string, steps: Parameters<typeof binsFrom>[2]) {
  for (const b of binsFrom(date, '09:00', steps)) await put('bins', b);
}

const NOW = new Date(2026, 9, 16, 12, 0, 0).getTime();

describe('reports', () => {
  it('generates facts and a template autopsy into reports', async () => {
    await seedDay('2026-10-15', [[40, 'doc'], [3, 'reels'], [20, 'doc']]);
    await put('nudges', nudge('2026-10-15', '09:45', 'back', 120));
    const r = await generateReport('2026-10-15', NOW);
    expect(r.facts.deepBlocks.count).toBe(1);
    expect(r.facts.nudges).toMatchObject({ shown: 1, accepted: 1, medianReturnMin: 2 });
    expect(r.autopsy).toMatch(/Tomorrow/);
    expect(r.modelVersion).toBe('template');
    expect(await get('reports', '2026-10-15')).toEqual(r);
  });

  it('backfills finished days oldest first so each compares with the days before it', async () => {
    for (let i = 9; i >= 1; i--) await seedDay(addDays('2026-10-16', -i), [[30 + i, 'doc']]);
    await seedDay('2026-10-16', [[10, 'doc']]);
    const written = await ensureReports(NOW);
    expect(written).toHaveLength(9);
    expect(written[0]).toBe('2026-10-07');
    // the 8th and 9th days have 7 earlier reports, the first ones don't
    expect((await get('reports', '2026-10-14'))!.facts.vs7Day).not.toBeNull();
    expect((await get('reports', '2026-10-08'))!.facts.vs7Day).toBeNull();
    // today is never stored by the nightly job
    expect(await get('reports', '2026-10-16')).toBeUndefined();
    // a second run changes nothing
    expect(await ensureReports(NOW + 1000)).toEqual([]);
  });

  it('regenerates a report that was made before its day ended', async () => {
    await seedDay('2026-10-15', [[30, 'doc']]);
    await generateReport('2026-10-15', dayStart('2026-10-15') + 3600_000);
    expect(await ensureReports(NOW)).toEqual(['2026-10-15']);
  });

  it('regenerateReports redoes days with data and drops reports for days that are now empty', async () => {
    await seedDay('2026-10-14', [[30, 'doc']]);
    await seedDay('2026-10-15', [[30, 'doc']]);
    await ensureReports(NOW);
    const bins = await getAll('bins');
    for (const b of bins.filter((b) => b.binStart < dayStart('2026-10-15'))) await (await openDb()).delete('bins', b.binStart);
    expect(await regenerateReports(['2026-10-14', '2026-10-15'], NOW)).toEqual(['2026-10-15']);
    expect(await get('reports', '2026-10-14')).toBeUndefined();
  });

  it('lists the dates that have bins', async () => {
    await seedDay('2026-10-14', [[1, 'doc']]);
    await seedDay('2026-10-16', [[1, 'doc']]);
    expect(await datesWithData()).toEqual(['2026-10-14', '2026-10-16']);
  });
});

describe('popup and success metrics', () => {
  it('summarises today for the popup', async () => {
    await seedDay('2026-10-16', [[30, 'doc'], [1, 'mail'], [10, 'doc'], [30, 'reels']]);
    const s = await popupSummary(NOW);
    expect(s).toMatchObject({ deepBlocks: 1, longestMin: 41, switchesOutOfDeep: 2, drainOverMin: 15, nudgesShown: 0 });
  });

  it('averages the success metrics over the days present', () => {
    const a = emptyFacts('2026-10-14', { deepBlocks: { count: 2, longestMin: 60, totalMin: 100, blocks: [] }, residue: { switchesOutOfDeep: 10, meanMinBackToDeep: 4 }, nudges: { shown: 4, accepted: 3, snoozed: 1, ignored: 0, medianReturnMin: 3 } });
    const b = emptyFacts('2026-10-15', { deepBlocks: { count: 4, longestMin: 90, totalMin: 200, blocks: [] }, residue: { switchesOutOfDeep: 20, meanMinBackToDeep: null }, nudges: { shown: 0, accepted: 0, snoozed: 0, ignored: 0, medianReturnMin: null } });
    const m = summarizeSuccess([a, b]);
    expect(m).toMatchObject({ days: 2, avgDeepBlocks: 3, longestMin: 90, avgSwitches: 15, avgMeanBack: 4, nudgesShown: 4, nudgesAccepted: 3, acceptanceRate: 0.75, medianReturnMin: 3 });
    expect(summarizeSuccess([]).acceptanceRate).toBeNull();
  });

  it('reads the last 7 days from stored reports and live data', async () => {
    await seedDay('2026-10-14', [[30, 'doc']]);
    await seedDay('2026-10-16', [[30, 'doc']]);
    await ensureReports(NOW);
    const m = await successMetrics(NOW);
    expect(m.days).toBe(2);
    expect(m.avgDeepBlocks).toBe(1);
  });
});
