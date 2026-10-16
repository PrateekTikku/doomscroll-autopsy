import Ajv from 'ajv/dist/2020';
import schema from '@shared/daily-facts.schema.json';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/ml/kmeans';
import type { DailyFacts } from '@shared/types';
import { renderAutopsy } from './autopsy';
import { emptyFacts } from './testutil';
import { checkAutopsy, OUTSIDE_BROWSER } from './validate';

const words = (s: string) => s.trim().split(/\s+/).length;

const busy: DailyFacts = {
  date: '2026-10-14',
  deepBlocks: {
    count: 3,
    longestMin: 74,
    totalMin: 168,
    blocks: [
      { start: '09:10', end: '10:24', minutes: 74, territory: 'Design doc' },
      { start: '13:00', end: '13:50', minutes: 50, territory: 'Design doc' },
      { start: '15:00', end: '15:44', minutes: 44, territory: 'Code review' },
    ],
  },
  residue: { switchesOutOfDeep: 41, meanMinBackToDeep: 3.4 },
  totalsMin: { deep: 190, shallow: 62, drain: 58 },
  drainOverAllowance: [{ territory: 'Reels feed', allowanceMin: 15, minutesOver: 43 }],
  topTriggers: [
    { fromTerritory: 'Design doc', toTerritory: 'Reels feed', hour: 14, count: 6 },
    { fromTerritory: 'Code review', toTerritory: 'Inbox', hour: 11, count: 4 },
  ],
  strongestStretch: { territory: 'Design doc', start: '09:10', end: '10:24', minutes: 74 },
  nudges: { shown: 3, accepted: 2, snoozed: 1, ignored: 0, medianReturnMin: 4.5 },
  vs7Day: { deepBlocksDelta: 1.5, drainOverDelta: -12.2 },
};

describe('template autopsy', () => {
  it('renders a busy day in the coach voice, from the facts only', () => {
    const text = renderAutopsy(busy);
    expect(text).toContain('You had 3 deep blocks today, the longest 74 minutes');
    expect(text).toContain('41 times');
    expect(text).toContain('Reels feed ran 43 minutes past its 15 minute allowance');
    expect(text).toContain('around 14:00');
    expect(text).toContain('1.5 deep blocks more than your average');
    expect(text).toContain('12.2 minutes less Drain time');
    expect(text).toMatch(/Tomorrow/);
    expect(checkAutopsy(text, busy)).toEqual([]);
    expect(words(text)).toBeGreaterThanOrEqual(120);
    expect(words(text)).toBeLessThanOrEqual(180);
  });

  it('handles a day with nothing in it', () => {
    const f = emptyFacts('2026-10-14');
    const text = renderAutopsy(f);
    expect(text).toContain('No deep blocks today');
    expect(text).toContain('no switches');
    expect(text).toContain('No nudges were shown');
    expect(checkAutopsy(text, f)).toEqual([]);
  });

  it('gets the direction of the 7-day comparison right', () => {
    const base: DailyFacts = { ...busy, drainOverAllowance: [], topTriggers: [] };
    const more = renderAutopsy({ ...base, vs7Day: { deepBlocksDelta: 2, drainOverDelta: 5 } });
    expect(more).toContain('2 deep blocks more than your average');
    expect(more).toContain('5 minutes more Drain time');
    const fewer = renderAutopsy({ ...base, vs7Day: { deepBlocksDelta: -1, drainOverDelta: -5 } });
    expect(fewer).toContain('1 deep block fewer than');
    expect(fewer).toContain('5 minutes less Drain time');
    expect(renderAutopsy({ ...base, vs7Day: { deepBlocksDelta: 0, drainOverDelta: 0 } })).toContain('the same number of deep blocks as');
  });

  it('never mentions the 7-day average without data', () => {
    expect(renderAutopsy({ ...busy, vs7Day: null })).not.toMatch(/7-day|your average/);
  });

  it('is deterministic', () => {
    expect(renderAutopsy(busy)).toBe(renderAutopsy(busy));
  });

  it('is always 120-180 words and passes the validator on fuzzed facts', () => {
    const rng = createRng(42);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
    const names = ['Design doc', 'Reels feed', 'Inbox', 'github.com · pulls', 'news.ycombinator.com · item', 'Figma design files', 'x.com · home'];
    const int = (max: number) => Math.floor(rng() * (max + 1));
    const dec = () => Math.round(rng() * 150) / 10;
    for (let i = 0; i < 600; i++) {
      const blocksN = int(5);
      const blocks = Array.from({ length: blocksN }, () => ({ start: '09:00', end: '10:30', minutes: 25 + int(90), territory: pick(names) }));
      const f: DailyFacts = {
        date: '2026-10-14',
        deepBlocks: { count: blocksN, longestMin: Math.max(0, ...blocks.map((b) => b.minutes)), totalMin: blocks.reduce((m, b) => m + b.minutes, 0), blocks },
        residue: { switchesOutOfDeep: int(60), meanMinBackToDeep: rng() < 0.2 ? null : dec() },
        totalsMin: { deep: int(400), shallow: int(200), drain: int(200) },
        drainOverAllowance: Array.from({ length: int(3) }, () => ({ territory: pick(names), allowanceMin: 5 + int(30), minutesOver: 1 + int(80) })),
        topTriggers: Array.from({ length: int(5) }, () => ({ fromTerritory: pick(names), toTerritory: pick(names), hour: int(23), count: 1 + int(9) })) as DailyFacts['topTriggers'],
        strongestStretch: rng() < 0.2 ? null : { territory: pick(names), start: '10:05', end: '11:20', minutes: 1 + int(120) },
        nudges: { shown: 0, accepted: 0, snoozed: 0, ignored: 0, medianReturnMin: null },
        vs7Day: rng() < 0.4 ? null : { deepBlocksDelta: Math.round((rng() * 8 - 4) * 10) / 10, drainOverDelta: Math.round((rng() * 60 - 30) * 10) / 10 },
      };
      if (rng() < 0.7) {
        const shown = 1 + int(8);
        const accepted = int(shown);
        const snoozed = int(shown - accepted);
        f.nudges = { shown, accepted, snoozed, ignored: shown - accepted - snoozed, medianReturnMin: accepted ? dec() : null };
      }
      const text = renderAutopsy(f);
      expect(checkAutopsy(text, f), `${JSON.stringify(f)}\n${text}`).toEqual([]);
    }
  });

  it('validates its own input shape against the shared schema', () => {
    expect(new Ajv({ strict: false }).validate(schema, busy)).toBe(true);
  });
});

describe('browser-only wording (D-45)', () => {
  it('has no phrase about time outside the browser in any rendered text', () => {
    for (const f of [busy, emptyFacts('2026-10-14'), { ...busy, vs7Day: null, nudges: { ...busy.nudges, shown: 0 } }]) {
      expect(renderAutopsy(f)).not.toMatch(OUTSIDE_BROWSER);
    }
  });
});

describe('validator', () => {
  it('catches planted errors', () => {
    const good = renderAutopsy(busy);
    expect(checkAutopsy(good.replace('74 minutes', '75 minutes'), busy)).toContain('ungrounded_number');
    expect(checkAutopsy(good + ' You were offline over lunch.', busy)).toContain('outside_browser');
    expect(checkAutopsy('Short.', busy)).toContain('word_count');
    expect(checkAutopsy(good.replace('14:00', '16:00'), busy)).toContain('ungrounded_clock');
    expect(checkAutopsy(good.replace(/Tomorrow/g, 'Later'), busy)).toContain('missing_suggestion');
    expect(checkAutopsy(good, { ...busy, deepBlocks: { ...busy.deepBlocks, count: 88 } })).toContain('missing_headline_blocks');
    expect(checkAutopsy(renderAutopsy({ ...busy, vs7Day: null }) + ' That is better than usual.', { ...busy, vs7Day: null })).toContain('claims_7day');
    expect(checkAutopsy('', busy)).toEqual(['empty']);
  });
});
