import Ajv from 'ajv/dist/2020';
import schema from '@shared/daily-facts.schema.json';
import { describe, expect, it } from 'vitest';
import { computeFacts } from './facts';
import { addDays, dayStart } from './time';
import { binsFrom, emptyFacts, nudge, TERRITORIES } from './testutil';

const D = '2026-10-14';
const facts = (steps: Parameters<typeof binsFrom>[2], extra: Partial<Parameters<typeof computeFacts>[0]> = {}, at = '09:00') =>
  computeFacts({ date: D, bins: binsFrom(D, at, steps), territories: TERRITORIES, nudges: [], previous: [], ...extra });

const validate = new Ajv({ strict: false }).compile(schema);

describe('deep blocks', () => {
  it('needs at least 25 minutes', () => {
    expect(facts([[24.5, 'doc']]).deepBlocks.count).toBe(0);
    const f = facts([[25, 'doc']]);
    expect(f.deepBlocks).toMatchObject({ count: 1, longestMin: 25, totalMin: 25 });
    expect(f.deepBlocks.blocks[0]).toEqual({ start: '09:00', end: '09:25', minutes: 25, territory: 'Design doc' });
  });

  it('keeps a block alive through an interruption of exactly 2 minutes', () => {
    const f = facts([[20, 'doc'], [2, 'mail'], [20, 'doc']]);
    expect(f.deepBlocks.count).toBe(1);
    expect(f.deepBlocks.blocks[0]).toMatchObject({ start: '09:00', end: '09:42', minutes: 42 });
  });

  it('ends a block when an interruption is longer than 2 minutes', () => {
    const f = facts([[26, 'doc'], [2.5, 'reels'], [20, 'doc']]);
    expect(f.deepBlocks.count).toBe(1);
    expect(f.deepBlocks.blocks[0]).toMatchObject({ end: '09:26', minutes: 26 });
  });

  it('does not count a trailing interruption', () => {
    expect(facts([[30, 'doc'], [1, 'mail']]).deepBlocks.blocks[0]!.minutes).toBe(30);
  });

  it('treats an unlabelled territory as an interruption', () => {
    expect(facts([[15, 'doc'], [3, 'mystery'], [15, 'doc']]).deepBlocks.count).toBe(0);
  });

  it('pauses the clock over away time: neither breaks the block nor adds to it', () => {
    const f = facts([[15, 'doc'], [10, 'away'], [10, 'doc']]);
    expect(f.deepBlocks.count).toBe(1);
    expect(f.deepBlocks.blocks[0]!.minutes).toBe(25); // 15 + 10, the 10 away minutes are not added
    expect(f.totalsMin.deep).toBe(25);
  });

  it('pauses over idle and unobserved gaps too, but a gap over 30 minutes ends the block', () => {
    expect(facts([[15, 'doc'], [10, 'idle'], [10, 'doc']]).deepBlocks.count).toBe(1);
    expect(facts([[15, 'doc'], [10, 'gap'], [10, 'doc']]).deepBlocks.count).toBe(1);
    expect(facts([[15, 'doc'], [45, 'away'], [15, 'doc']]).deepBlocks.count).toBe(0);
    expect(facts([[26, 'doc'], [45, 'away'], [26, 'doc']]).deepBlocks.count).toBe(2);
  });

  it('spans several Deep territories and names the one with most time', () => {
    const f = facts([[10, 'doc'], [20, 'code']]);
    expect(f.deepBlocks.blocks[0]).toMatchObject({ minutes: 30, territory: 'Code review' });
  });

  it('keeps a block that crosses midnight whole, on the day it started', () => {
    const bins = binsFrom(D, '23:40', [[40, 'doc']]);
    const today = computeFacts({ date: D, bins, territories: TERRITORIES, nudges: [], previous: [] });
    expect(today.deepBlocks.blocks[0]).toMatchObject({ start: '23:40', end: '00:20', minutes: 40 });
    const next = computeFacts({ date: addDays(D, 1), bins, territories: TERRITORIES, nudges: [], previous: [] });
    expect(next.deepBlocks.count).toBe(0);
    expect(next.totalsMin.deep).toBe(20);
    expect(today.totalsMin.deep).toBe(20);
  });

  it('uses the effective label: a suggested label counts until the owner confirms one', () => {
    const t = [{ ...TERRITORIES[4]!, suggestedLabel: 'deep' as const }];
    expect(computeFacts({ date: D, bins: binsFrom(D, '09:00', [[30, 'mystery']]), territories: t, nudges: [], previous: [] }).deepBlocks.count).toBe(1);
  });
});

describe('attention residue and triggers', () => {
  it('counts switches out of Deep and the mean time back', () => {
    // doc → mail (2 min) → doc; doc → reels (4 min) → doc
    const f = facts([[10, 'doc'], [2, 'mail'], [10, 'doc'], [4, 'reels'], [10, 'doc']]);
    expect(f.residue).toEqual({ switchesOutOfDeep: 2, meanMinBackToDeep: 3 });
    expect(f.topTriggers).toEqual([
      { fromTerritory: 'Design doc', toTerritory: 'Inbox', hour: 9, count: 1 },
      { fromTerritory: 'Design doc', toTerritory: 'Reels feed', hour: 9, count: 1 },
    ]);
  });

  it('has no mean when Deep was never resumed, and ignores unlabelled detours', () => {
    const f = facts([[10, 'doc'], [3, 'mystery'], [5, 'reels']]);
    expect(f.residue).toEqual({ switchesOutOfDeep: 1, meanMinBackToDeep: null });
    expect(facts([[10, 'doc'], [3, 'mystery'], [10, 'doc']]).residue.switchesOutOfDeep).toBe(0);
  });

  it('groups repeated triggers by territory pair and local hour, most frequent first', () => {
    const f = facts([[5, 'doc'], [1, 'reels'], [5, 'doc'], [1, 'reels'], [5, 'doc'], [1, 'mail'], [5, 'doc']]);
    expect(f.topTriggers[0]).toEqual({ fromTerritory: 'Design doc', toTerritory: 'Reels feed', hour: 9, count: 2 });
    expect(f.residue.switchesOutOfDeep).toBe(3);
  });

  it('returns no triggers or stretch without Deep time', () => {
    const f = facts([[30, 'mail']]);
    expect(f.topTriggers).toEqual([]);
    expect(f.strongestStretch).toBeNull();
    expect(f.residue.switchesOutOfDeep).toBe(0);
  });
});

describe('totals, allowance and stretch', () => {
  it('totals browsing minutes by label and leaves unlabelled time out', () => {
    const f = facts([[20, 'doc'], [10, 'mail'], [5, 'reels'], [7, 'mystery'], [30, 'away']]);
    expect(f.totalsMin).toEqual({ deep: 20, shallow: 10, drain: 5 });
  });

  it('reports a Drain territory only past its allowance', () => {
    expect(facts([[15, 'reels']]).drainOverAllowance).toEqual([]);
    expect(facts([[16, 'reels']]).drainOverAllowance).toEqual([{ territory: 'Reels feed', allowanceMin: 15, minutesOver: 1 }]);
    expect(facts([[40, 'reels']]).drainOverAllowance[0]).toMatchObject({ minutesOver: 25 });
  });

  it('finds the strongest uninterrupted Deep stretch', () => {
    const f = facts([[10, 'doc'], [1, 'mail'], [17, 'code'], [1, 'mail'], [6, 'doc']]);
    expect(f.strongestStretch).toEqual({ territory: 'Code review', start: '09:11', end: '09:28', minutes: 17 });
  });
});

describe('nudges and the 7-day comparison', () => {
  it('summarises nudge outcomes; unanswered nudges count as ignored', () => {
    const f = facts([[5, 'doc']], {
      nudges: [nudge(D, '10:00', 'back', 240), nudge(D, '11:00', 'back', 360), nudge(D, '12:00', 'snooze'), nudge(D, '13:00', 'ignored'), nudge(D, '14:00', null), nudge(addDays(D, -1), '10:00', 'back', 60)],
    });
    expect(f.nudges).toEqual({ shown: 5, accepted: 2, snoozed: 1, ignored: 2, medianReturnMin: 5 });
  });

  it('has a null median without accepted returns', () => {
    expect(facts([[5, 'doc']], { nudges: [nudge(D, '10:00', 'back', null)] }).nudges.medianReturnMin).toBeNull();
  });

  const prior = (n: number, blocks: number, over: number) =>
    Array.from({ length: n }, (_, i) => ({
      date: addDays(D, -(i + 1)),
      facts: emptyFacts(addDays(D, -(i + 1)), {
        deepBlocks: { count: blocks, longestMin: 30, totalMin: 30, blocks: [] },
        drainOverAllowance: over ? [{ territory: 'Reels feed', allowanceMin: 15, minutesOver: over }] : [],
      }),
    }));

  it('is null with fewer than 7 earlier days', () => {
    expect(facts([[30, 'doc']], { previous: prior(6, 2, 0) }).vs7Day).toBeNull();
  });

  it('gives signed deltas against the previous 7-day average', () => {
    const f = facts([[30, 'doc'], [40, 'reels']], { previous: prior(7, 3, 10) });
    expect(f.vs7Day).toEqual({ deepBlocksDelta: -2, drainOverDelta: 15 }); // 1 block vs 3; 25 over vs 10
  });

  it('ignores days that are not before this one', () => {
    const later = [{ date: addDays(D, 1), facts: emptyFacts(addDays(D, 1)) }];
    expect(facts([[30, 'doc']], { previous: [...prior(6, 2, 0), ...later] }).vs7Day).toBeNull();
  });
});

describe('schema', () => {
  it('produces facts that validate against shared/daily-facts.schema.json', () => {
    const cases = [
      facts([]),
      facts([[30, 'doc']]),
      facts([[10, 'doc'], [3, 'reels'], [30, 'doc'], [40, 'reels'], [5, 'mail']], { nudges: [nudge(D, '10:00', 'back', 90)], previous: [] }),
    ];
    for (const f of cases) {
      expect(validate(f), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('is deterministic and starts on local midnight', () => {
    expect(dayStart(D)).toBe(new Date(2026, 9, 14).getTime());
    expect(facts([[30, 'doc']])).toEqual(facts([[30, 'doc']]));
  });
});
