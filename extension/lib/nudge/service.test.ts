import { IDBFactory } from 'fake-indexeddb';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getAll, put, type BinRecord, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { updateSettings } from '@/lib/settings';
import type { NudgePayload } from './messages';
import { createNudgeService, currentFromSamples, trackNudgeOutcomes } from './service';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  fakeBrowser.reset();
});

const NOW = new Date(2026, 9, 16, 15, 0, 20).getTime();
const slot = (i: number) => Math.floor(NOW / 30_000) * 30_000 - i * 30_000;

const terr = (id: string, label: TerritoryRecord['label'], allowanceMin: number | null = null, name = id): TerritoryRecord => ({
  id, centroid: new Float32Array(4), size: 10, name, topicTags: [], suggestedLabel: null, label, labelConfirmed: label != null, allowanceMin, firstSeen: 0, lastSeen: 0,
});
const bin = (binStart: number, territoryId: string | null, over: Partial<BinRecord> = {}): BinRecord => ({
  binStart, active_s: 30, territoryId, away: false, idle: false, nudgeShown: false, nudgeResponse: null,
  scroll_px_s_mean: 110, items_per_min: 8, mean_dwell_ms: 4000, video_skip_rate: 0.4, tab_switches: 0, away_s: 0, idle_s: 0, ...over,
});
const sample = (ts: number, territoryId: string | null, vector: Float32Array | null = new Float32Array(4)): SampleRecord => ({
  ts, tabId: 1, origin: 'https://www.youtube.com', path: '/shorts/x', isVisual: true, dwellMs: 5000, vector, territoryId, territoryDist: 0.1,
});

/** 20 minutes of Reels bins ending at NOW, with a 15 min allowance already used up. */
async function seedSpiral(opts: { allowance?: number; minutes?: number } = {}) {
  await put('territories', terr('deep', 'deep', null, 'docs · guide'));
  await put('territories', terr('reels', 'drain', opts.allowance ?? 15, 'youtube.com · shorts'));
  const n = (opts.minutes ?? 20) * 2;
  for (let i = n; i >= 1; i--) await put('bins', bin(slot(i), 'reels'));
  await put('samples', sample(NOW - 5000, 'reels'));
}

function service(delivered = true) {
  const sent: NudgePayload[] = [];
  const deliver = vi.fn(async (p: NudgePayload) => {
    sent.push(p);
    return delivered;
  });
  return { svc: createNudgeService({ now: () => NOW, deliver }), sent, deliver };
}

describe('nudge service', () => {
  it('fires a banner once the allowance is used up, and logs it', async () => {
    await seedSpiral();
    const { svc, sent } = service();
    const r = await svc.tick();
    expect(r).toMatchObject({ acted: true, step: 1, delivered: true });
    expect(sent[0]!.body).toContain('youtube.com · shorts');
    const logged = await getAll('nudges');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ step: 1, mode: 'rules', response: null });
    expect(sent[0]!.id).toBe(logged[0]!.id);
  });
  it('does not nudge within the allowance', async () => {
    await seedSpiral({ minutes: 5 });
    expect(await service().svc.tick()).toEqual({ acted: false, reason: 'within-allowance' });
  });
  it('cooldown then escalation to the blur', async () => {
    await seedSpiral();
    const { svc } = service();
    await svc.tick();
    expect(await svc.tick()).toEqual({ acted: false, reason: 'cooldown' });
    // 16 minutes later with the user still scrolling and the first nudge ignored.
    const later = NOW + 16 * 60_000;
    for (let i = 0; i < 32; i++) await put('bins', bin(slot(-i - 1), 'reels'));
    await put('samples', sample(later - 5000, 'reels'));
    const svc2 = createNudgeService({ now: () => later, deliver: async () => true });
    expect(await svc2.tick()).toMatchObject({ acted: true, step: 2 });
  });
  it('logs nothing when no page could show the nudge', async () => {
    await seedSpiral();
    const r = await service(false).svc.tick();
    expect(r).toMatchObject({ acted: true, delivered: false });
    expect(await getAll('nudges')).toHaveLength(0);
  });
  it('is silent while paused, and when nothing is being observed', async () => {
    await seedSpiral();
    await updateSettings({ pausedUntil: 'forever' });
    expect(await service().svc.tick()).toEqual({ acted: false, reason: 'paused' });
    await updateSettings({ pausedUntil: null });
    await closeDb();
    globalThis.indexedDB = new IDBFactory();
    expect(await service().svc.tick()).toEqual({ acted: false, reason: 'not-observing' });
  });
  it('does not nudge when the latest bin is away or idle', async () => {
    await seedSpiral();
    await put('bins', bin(slot(1), 'reels', { idle: true, idle_s: 30, active_s: 0 }));
    expect(await service().svc.tick()).toEqual({ acted: false, reason: 'not-observing' });
  });
  it('uses the latest sample, not the lagging bin sweep, as the current territory', async () => {
    await seedSpiral();
    await put('samples', sample(NOW - 2000, 'deep'));
    expect(await service().svc.tick()).toEqual({ acted: false, reason: 'not-drain' });
  });
  it('hour 0: a feed page with no territories is a pseudo Drain territory with the default allowance', async () => {
    for (let i = 40; i >= 1; i--) await put('bins', bin(slot(i), null));
    await put('samples', sample(NOW - 3000, null, new Float32Array(4)));
    const { svc } = service();
    // Not nudged at first: 0 minutes spent of 15.
    expect(await svc.tick()).toMatchObject({ acted: false });
    // Spent counter advances with ticks; simulate a long stretch by pre-seeding it.
    const day = new Date(NOW).setHours(0, 0, 0, 0);
    await fakeBrowser.storage.session.set({ 'unassigned-feed-spent': { day, sec: 16 * 60, lastTs: NOW - 30_000 } });
    const r = await svc.tick();
    expect(r).toMatchObject({ acted: true, step: 1 });
  });
  it('records the response, and the time to get back to Deep', async () => {
    await seedSpiral();
    const { svc } = service();
    await svc.tick();
    const [n] = await getAll('nudges');
    await svc.respond(n!.id!, 'back');
    // The user is back in Deep two bins after the nudge.
    const t = n!.ts;
    await put('bins', bin(Math.floor(t / 30_000) * 30_000 + 60_000, 'deep'));
    await trackNudgeOutcomes(t + 120_000);
    const [after] = await getAll('nudges');
    expect(after).toMatchObject({ response: 'back', secondsToReturn: expect.any(Number) });
    expect(after!.secondsToReturn).toBeLessThanOrEqual(60);
  });
  it('flags the nudge bin once that bin exists', async () => {
    await seedSpiral();
    const { svc } = service();
    await svc.tick();
    const startOfNudgeBin = Math.floor(NOW / 30_000) * 30_000;
    await put('bins', bin(startOfNudgeBin, 'reels'));
    await trackNudgeOutcomes(NOW + 1000);
    const flagged = (await getAll('bins')).find((b) => b.binStart === startOfNudgeBin);
    expect(flagged?.nudgeShown).toBe(true);
  });
  it('status gives mode, score and threshold', async () => {
    await seedSpiral();
    const s = await service().svc.status();
    expect(s).toMatchObject({ mode: 'rules', threshold: 0.6, currentLabel: 'drain', replay: false });
    expect(s.score).toBeGreaterThan(0.5);
  });
  it('stored nudges and models hold no text, URLs or query strings', async () => {
    await seedSpiral();
    await service().svc.tick();
    const dump = JSON.stringify([await getAll('nudges'), await getAll('models')]);
    expect(dump).not.toMatch(/https?:|\?|#/);
  });
});

describe('currentFromSamples', () => {
  it('carries past vectorless samples, and treats a vector without territory as unassigned', () => {
    expect(currentFromSamples([sample(1, 'a'), sample(2, null, null)])!.state).toBe('a');
    expect(currentFromSamples([sample(1, 'a'), sample(2, null)])!.state).toBe('unassigned');
    expect(currentFromSamples([])).toBeNull();
  });
});
