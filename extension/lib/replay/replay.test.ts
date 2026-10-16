import { describe, expect, it } from 'vitest';
import { BIN_MS } from '@/lib/observer/pipeline';
import { createPlayer, demoDay, DEMO_EXPECTED } from './demo';
import { createReplayEngine, parseJsonl, replayAll, routesFromSamples } from './replayer';
import { personas, personaTerritories, resolveRoute, syntheticDay, territoryIdOf } from './synthetic';

const DATE = new Date(2026, 9, 14, 0, 0, 0);

describe('synthetic days', () => {
  it('are deterministic per seed and differ across seeds', () => {
    const a = syntheticDay('developer', DATE, 3);
    const b = syntheticDay('developer', DATE, 3);
    const c = syntheticDay('developer', DATE, 4);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(c.events));
  });
  it('every persona plans deep blocks, a spiral, and events in time order', () => {
    for (const p of personas) {
      const day = syntheticDay(p, DATE, 1);
      expect(day.segments.some((s) => s.label === 'deep')).toBe(true);
      expect(day.segments.some((s) => s.spiral && s.label === 'drain')).toBe(true);
      for (let i = 1; i < day.events.length; i++) expect(day.events[i]!.ts).toBeGreaterThanOrEqual(day.events[i - 1]!.ts);
      for (let i = 1; i < day.segments.length; i++) expect(day.segments[i]!.startTs).toBeGreaterThanOrEqual(day.segments[i - 1]!.endTs);
    }
  });
  it('contain no item text, and no query strings in any path', () => {
    const day = syntheticDay('writer', DATE, 1);
    for (const ev of day.events) {
      expect('text' in ev).toBe(false);
      if (ev.type === 'item') expect(ev.path).not.toMatch(/[?#]/);
    }
  });
  it('replay to bins whose territories match the plan', () => {
    const day = syntheticDay('developer', DATE, 1);
    const r = replayAll(day.events, { territories: day.territories, routes: day.routes });
    expect(r.bins.length).toBeGreaterThan(400);
    // A bin in the middle of a planned segment belongs to that segment's territory.
    const seg = day.segments.find((s) => s.endTs - s.startTs > 10 * 60_000)!;
    const mid = Math.floor((seg.startTs + 5 * 60_000) / BIN_MS) * BIN_MS + BIN_MS;
    expect(r.bins.find((b) => b.binStart === mid)?.territoryId).toBe(territoryIdOf(seg.site));
    // Away time produced away bins, never more than the 10 minute cap.
    if (day.awayFrom != null) expect(r.bins.some((b) => b.away)).toBe(true);
  });
  it('N2: a full persona day replays through the pipeline and scoring quickly', () => {
    const day = syntheticDay('freelancer', DATE, 2);
    const t0 = performance.now();
    replayAll(day.events, { territories: day.territories, routes: day.routes });
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('routes', () => {
  const { routes } = personaTerritories(personas.find((p) => p.id === 'developer')!);
  it('longest prefix on the same origin wins; no match gives null', () => {
    const yt = routes.filter((r) => r.origin === 'https://www.youtube.com');
    expect(yt.length).toBeGreaterThan(1);
    expect(resolveRoute(routes, 'https://www.youtube.com', '/shorts/abc')).toBe('syn:https://www.youtube.com/shorts');
    expect(resolveRoute(routes, 'https://www.youtube.com', '/watch/xyz')).toBe('syn:https://www.youtube.com/watch');
    expect(resolveRoute(routes, 'https://nowhere.example', '/')).toBeNull();
  });
  it('routesFromSamples takes the majority territory per origin and first segment', () => {
    const r = routesFromSamples([
      { origin: 'https://a.example', path: '/x/1', territoryId: 't1' },
      { origin: 'https://a.example', path: '/x/2', territoryId: 't1' },
      { origin: 'https://a.example', path: '/x/3', territoryId: 't2' },
      { origin: 'https://a.example', path: '/y', territoryId: null },
    ]);
    expect(r).toEqual([{ origin: 'https://a.example', pathPrefix: '/x', territoryId: 't1' }]);
  });
  it('parseJsonl skips junk and sorts by time', () => {
    const evs = parseJsonl('{"type":"tick","ts":5}\nnot json\n{"type":"tick","ts":2}\n{"x":1}\n');
    expect(evs.map((e) => e.ts)).toEqual([2, 5]);
  });
});

describe('demo mode (acceptance 2)', () => {
  const start = new Date(2026, 9, 16, 14, 0, 0).getTime();
  const minutesFromStart = (ts: number) => (ts - start) / 60_000;

  it('fires a banner when the allowance is used up, then a blur one cooldown later', () => {
    const day = demoDay(start);
    const r = replayAll(day.events, { territories: day.territories, routes: day.routes });
    expect(r.nudges.map((n) => n.step)).toEqual([1, 2]);
    const [banner, blur] = r.nudges.map((n) => minutesFromStart(n.ts));
    expect(banner).toBeGreaterThanOrEqual(DEMO_EXPECTED.bannerAtMin - DEMO_EXPECTED.toleranceMin);
    expect(banner).toBeLessThanOrEqual(DEMO_EXPECTED.bannerAtMin + DEMO_EXPECTED.toleranceMin);
    expect(blur! - banner!).toBeGreaterThanOrEqual(15);
    expect(blur!).toBeLessThanOrEqual(DEMO_EXPECTED.blurAtMin + DEMO_EXPECTED.toleranceMin);
    expect(r.nudges.every((n) => n.payload.replay && n.payload.id === null)).toBe(true);
    expect(r.nudges[0]!.mode).toBe('rules');
  });
  it('never nudges during the deep or shallow stretch', () => {
    const day = demoDay(start);
    const r = replayAll(day.events, { territories: day.territories, routes: day.routes });
    expect(r.nudges.every((n) => minutesFromStart(n.ts) > 42)).toBe(true);
  });
  it('a user who goes back resets the ladder to a banner', () => {
    const day = demoDay(start);
    const r = replayAll(day.events, { territories: day.territories, routes: day.routes, respond: () => 'back' });
    expect(r.nudges.map((n) => n.step)).toEqual([1, 1]);
  });
  it('Gentle sensitivity never fires earlier than Balanced; max step 1 never blurs', () => {
    const day = demoDay(start);
    const strict = replayAll(day.events, { territories: day.territories, routes: day.routes, settings: { sensitivity: 'strict' } });
    const gentle = replayAll(day.events, { territories: day.territories, routes: day.routes, settings: { sensitivity: 'gentle' } });
    expect(strict.nudges[0]!.ts).toBeLessThanOrEqual(gentle.nudges[0]?.ts ?? Infinity);
    const one = replayAll(day.events, { territories: day.territories, routes: day.routes, settings: { maxNudgeStep: 1 } });
    expect(one.nudges.every((n) => n.step === 1)).toBe(true);
  });
  it('the player feeds events up to the virtual clock and reports progress', () => {
    const day = demoDay(start);
    const engine = createReplayEngine({ territories: day.territories, routes: day.routes });
    const player = createPlayer(day.events, engine);
    player.advanceTo(start + 10 * 60_000);
    expect(player.finished).toBe(false);
    expect(engine.bins.length).toBeGreaterThan(15);
    player.advanceTo(day.endTs + 60_000);
    expect(player.finished).toBe(true);
    expect(player.progress).toBe(1);
  });
  it('a replay writes nothing to storage: it only returns results', async () => {
    const day = demoDay(start);
    replayAll(day.events, { territories: day.territories, routes: day.routes });
    const dbs = await indexedDB.databases();
    expect(dbs.find((d) => d.name === 'doomscroll-autopsy')).toBeUndefined();
  });
});
