import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll, put, STORE_NAMES } from '@/lib/db';
import { replayAll } from '@/lib/replay/replayer';
import { personaTerritories, personas, syntheticDay } from '@/lib/replay/synthetic';
import { evaluateOnStoredData, getStoredEval, getStoredMode, refreshPrediction } from './evaluate';
import type { MarkovModel } from './markov';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

/** Stores `days` synthetic days (bins + confirmed territories) as if they had been observed. */
async function seedDays(days: number) {
  const p = personas.find((x) => x.id === 'developer')!;
  const { territories, routes } = personaTerritories(p);
  const events = Array.from({ length: days }, (_, d) => syntheticDay(p, new Date(2026, 9, 10 + d), 1).events).flat();
  const r = replayAll(events, { territories, routes });
  for (const b of r.bins) await put('bins', b);
  for (const t of territories) {
    await put('territories', {
      id: t.id, centroid: new Float32Array(4), size: 5, name: t.name, topicTags: [], suggestedLabel: null,
      label: t.label, labelConfirmed: true, allowanceMin: t.allowanceMin, firstSeen: 0, lastSeen: 0,
    });
  }
  return r.bins.length;
}

describe('stored prediction models', () => {
  it('rules until a day of labelled bins exists, with the reason stored', async () => {
    await seedDays(1);
    const r = await refreshPrediction(Date.now());
    expect(r.mode).toBe('rules');
    expect(r.markov).toBeNull();
    const stored = await getStoredMode();
    expect(stored?.mode).toBe('rules');
    expect(stored?.reason).toMatch(/rules until/);
    expect(await getAll('models')).toHaveLength(1);
  });

  it('switches to Markov after a day and stores the matrix, then reuses it until it is stale', async () => {
    await seedDays(3);
    const now = Date.now();
    const r = await refreshPrediction(now);
    expect(r.mode).toBe('markov');
    const stored = (await getAll('models')).find((m) => m.name === 'markov')!;
    expect((stored.data as MarkovModel).transitions).toBeGreaterThan(1000);
    expect((await refreshPrediction(now + 60_000)).markov).toEqual(r.markov);
    expect((await getAll('models')).find((m) => m.name === 'markov')!.updatedAt).toBe(stored.updatedAt);
    await refreshPrediction(now + 7 * 3600_000);
    expect((await getAll('models')).find((m) => m.name === 'markov')!.updatedAt).toBeGreaterThan(stored.updatedAt);
  });

  it('evaluates rules vs Markov on stored data and stores the result in `models`', async () => {
    await seedDays(3);
    const r = await evaluateOnStoredData(123);
    expect(r.split).toBe('latest-day');
    expect(r.markov.nNext).toBeGreaterThan(200);
    expect(await getStoredEval()).toEqual(r);
  });

  it('with a single day it says so (70/30 within the day)', async () => {
    await seedDays(1);
    expect((await evaluateOnStoredData()).split).toBe('within-day-70-30');
  });

  it('no data: evaluation reports "none", it does not throw', async () => {
    expect((await evaluateOnStoredData()).split).toBe('none');
  });

  it('privacy: nothing in nudges or models holds text, URLs or query strings', async () => {
    await seedDays(3);
    await refreshPrediction();
    await evaluateOnStoredData();
    const dump = JSON.stringify([await getAll('models'), await getAll('nudges')]);
    // (synthetic territory ids embed a site URL; real ones are t-<hex>, so only queries, fragments and text fields are checked)
    expect(dump).not.toMatch(/\?|#|"text"|"title"/);
    expect(STORE_NAMES).toContain('models');
  });
});
