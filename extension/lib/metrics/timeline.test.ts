import { describe, expect, it } from 'vitest';
import { binsFrom, nudge, TERRITORIES } from './testutil';
import { buildTimeline, MAX_LANES } from './timeline';
import { dayStart } from './time';

const D = '2026-10-14';
const build = (steps: Parameters<typeof binsFrom>[2], nudges = [] as ReturnType<typeof nudge>[]) =>
  buildTimeline({ date: D, bins: binsFrom(D, '09:10', steps), territories: TERRITORIES, nudges });

describe('buildTimeline', () => {
  it('orders lanes Deep, Shallow, Drain and merges adjacent bins into segments', () => {
    const m = build([[30, 'doc'], [10, 'reels'], [5, 'mail']]);
    expect(m.lanes.map((l) => l.name)).toEqual(['Design doc', 'Inbox', 'Reels feed']);
    expect(m.segments).toHaveLength(3);
    expect(m.segments[0]).toMatchObject({ lane: 0, startTs: dayStart(D) + (9 * 60 + 10) * 60_000 });
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks[0]!.minutes).toBe(30);
  });

  it('leaves away time as a plain gap: no segment covers it', () => {
    const m = build([[10, 'doc'], [20, 'away'], [10, 'doc']]);
    expect(m.segments).toHaveLength(2);
    const gapStart = m.segments[0]!.endTs;
    const gapEnd = m.segments[1]!.startTs;
    expect(gapEnd - gapStart).toBe(20 * 60_000);
    expect(m.lanes.every((l) => !/away|idle/i.test(l.name))).toBe(true);
  });

  it('computes the visible range on whole hours and velocity buckets', () => {
    const m = build([[20, 'doc']]);
    expect(new Date(m.from).getHours()).toBe(9);
    expect(new Date(m.to).getHours()).toBe(11); // at least two hours
    expect(m.velocity.length).toBeGreaterThan(0);
    expect(m.maxVelocity).toBe(2);
  });

  it('marks nudges and reports an empty day', () => {
    const m = build([[20, 'doc']], [nudge(D, '09:30', 'back', 60)]);
    expect(m.nudges).toEqual([{ ts: dayStart(D) + (9 * 60 + 30) * 60_000, step: 1, response: 'back' }]);
    const empty = build([[10, 'away']]);
    expect(empty.hasData).toBe(false);
    expect(empty.segments).toEqual([]);
  });

  it('caps the number of lanes', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...TERRITORIES[0]!, id: `t${i}`, name: `T${i}` }));
    const steps = many.map((t, i) => [2 + i, t.id] as [number, string]);
    const m = buildTimeline({ date: D, bins: binsFrom(D, '09:00', steps), territories: many, nudges: [] });
    expect(m.lanes).toHaveLength(MAX_LANES);
    expect(m.lanes[MAX_LANES - 1]!.name).toMatch(/smaller territories/);
  });
});
