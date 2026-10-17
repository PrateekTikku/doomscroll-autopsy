import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/ml/kmeans';
import { CONTENT } from './demo-content';
import { buildDemoSeed, chooseSources, hostWeights, personaForDay, profileFor, siteSpec, withLunch, type HistoryDays, type HistoryVisit } from './demo-profile';
import { planDay } from './synthetic';

// Fake visits only: the real history never goes into a committed test.
const at = (day: string, hhmm: string, host: string, seg = '', durMs = 0): HistoryVisit => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${day}T00:00:00`);
  d.setHours(h!, m!);
  return { ts: d.getTime(), host, seg, durMs };
};
const day = (d: string): HistoryVisit[] => [
  at(d, '09:05', 'github.com', 'pulls'),
  at(d, '09:20', 'docs.pytorch.org'),
  at(d, '09:45', 'claude.ai'),
  at(d, '10:30', 'www.google.com', 'search'),
  at(d, '11:00', 'www.coursera.org'),
  at(d, '12:10', 'www.youtube.com', 'shorts'),
  at(d, '14:00', 'github.com'),
  at(d, '14:25', 'meet.google.com'),
  at(d, '15:30', 'www.instagram.com'),
  at(d, '17:00', 'dev.to'),
];

describe('profiles', () => {
  it('treats YouTube shorts and home as a feed and /watch as half learning, half entertainment', () => {
    const rng = createRng(3);
    expect(profileFor({ host: 'www.youtube.com', seg: 'shorts' }, rng)!.profile.absorbs).toBe(true);
    expect(profileFor({ host: 'www.youtube.com', seg: '' }, rng)!.label).toBe('drain');
    const kinds = new Set(Array.from({ length: 40 }, () => profileFor({ host: 'www.youtube.com', seg: 'watch' }, rng)!.kindKey));
    expect(kinds).toEqual(new Set(['yt-learn', 'yt-fun']));
  });
  it('drops hosts that are not whitelisted', () => {
    expect(profileFor({ host: 'eportal.incometax.gov.in', seg: '' }, createRng(1))).toBeNull();
    expect(profileFor({ host: 'mail.google.com', seg: '' }, createRng(1))).toBeNull();
  });
  it('has phrases for every content pool a profile points to', () => {
    const rng = createRng(1);
    for (const host of ['github.com', 'claude.ai', 'www.instagram.com', 'www.netflix.com', 'www.reddit.com', 'meet.google.com', 'www.linkedin.com', 'discord.com']) {
      expect(CONTENT[profileFor({ host, seg: '' }, rng)!.profile.content]!.length).toBeGreaterThanOrEqual(3);
    }
    for (const k of ['feed', 'learn', 'build']) expect(CONTENT[k]!.length).toBeGreaterThanOrEqual(12);
    for (const host of ['www.youtube.com']) for (const seg of ['shorts', 'watch', '']) expect(CONTENT[profileFor({ host, seg }, rng)!.profile.content]!.length).toBeGreaterThanOrEqual(12);
  });
});

describe('a persona from the owner history', () => {
  const days: HistoryDays = { '2026-10-05': day('2026-10-05') };
  const weights = hostWeights(days);
  const target = new Date(2026, 9, 12);

  it('weights hosts by role; YouTube is both a feed and a place for talks', () => {
    expect(weights.deep.map((w) => w.host)).toEqual(expect.arrayContaining(['github.com', 'docs.pytorch.org', 'claude.ai']));
    expect(weights.drain.map((w) => w.host)).toEqual(expect.arrayContaining(['www.instagram.com', 'www.youtube.com']));
    expect(weights.deep.map((w) => w.host)).toContain('www.youtube.com');
    expect(weights.shallow.map((w) => w.host)).toContain('meet.google.com');
  });

  it('takes work hours and the day\'s spiral hours from the real visits', () => {
    const { persona } = personaForDay(day('2026-10-05'), target, weights, createRng(2));
    expect(persona.workHours.start).toBe('09:00');
    expect(Number(persona.workHours.end.slice(0, 2))).toBeGreaterThanOrEqual(17);
    expect(persona.spiralTriggers[0]!.hours).toContain(12); // the shorts visit at 12:10
    expect(persona.sites.drain.length).toBeGreaterThan(0);
  });

  it('scales how busy the day is with how much was visited', () => {
    const light = personaForDay([at('2026-10-05', '10:00', 'github.com')], target, weights, createRng(2)).persona;
    const heavy = personaForDay(Array.from({ length: 45 }, (_, i) => at('2026-10-05', `${9 + Math.floor(i / 6)}:${String((i % 6) * 10).padStart(2, '0')}`, 'github.com')), target, weights, createRng(2)).persona;
    expect(light.dayShape.deepBlocks[1]).toBeLessThan(heavy.dayShape.deepBlocks[1]);
    expect(light.dayShape.deepBlockMinutes[1]).toBeLessThan(heavy.dayShape.deepBlockMinutes[1]);
  });

  it('describes every site\'s content with a pool of phrases and never uses a dropped host', () => {
    for (let seed = 1; seed < 6; seed++) {
      const { persona, content } = personaForDay(day('2026-10-05'), target, weights, createRng(seed));
      for (const site of [...persona.sites.deep, ...persona.sites.shallow, ...persona.sites.drain]) {
        const pool = content.get(`${site.origin}${site.pathPrefix}`);
        expect(pool && CONTENT[pool]!.length).toBeGreaterThanOrEqual(3);
        expect(siteSpec(site.origin.replace('https://', ''), 'deep')).not.toBeNull();
      }
    }
  });

  it('puts an away stretch around lunch and shifts what follows', () => {
    const { persona } = personaForDay(day('2026-10-05'), target, weights, createRng(2));
    const segs = planDay(persona, target, createRng(2));
    const shifted = withLunch(segs, target, createRng(2));
    const gaps = shifted.slice(1).map((s, i) => s.startTs - shifted[i]!.endTs);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(20 * 60_000);
    expect(shifted[0]!.startTs).toBe(segs[0]!.startTs);
  });

  it('gives each host-and-section one territory', () => {
    const seed = buildDemoSeed({ days: { '2026-10-04': day('2026-10-04'), '2026-10-16': day('2026-10-16') }, now: new Date(2026, 9, 17, 16, 0), windowDays: 3, anchorSource: '2026-10-16', seed: 2 });
    expect(seed.bins.length).toBeGreaterThan(300);
    expect(new Set(seed.samples.map((s) => s.origin + s.path.split('/').slice(0, 2).join('/'))).size).toBeGreaterThan(3);
  });
});

describe('chooseSources and buildDemoSeed', () => {
  const days: HistoryDays = {};
  for (const d of ['2026-10-03', '2026-10-04', '2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11', '2026-10-14', '2026-10-15', '2026-10-16']) days[d] = day(d);
  const now = new Date(2026, 9, 17, 16, 0);

  it('uses real days where they exist and similar weekdays elsewhere', () => {
    const targets = Array.from({ length: 14 }, (_, i) => new Date(2026, 9, 4 + i));
    const s = chooseSources(days, targets, '2026-10-16', createRng(1), 6);
    expect(s[0]).toEqual({ source: '2026-10-04', real: true });
    expect(s[12]).toEqual({ source: '2026-10-16', real: true }); // yesterday
    expect(s[13]!.real).toBe(false); // today is a template
    expect(s[1]!.real).toBe(false); // 5 Oct has no data
  });

  it('builds a window of bins, items and nudges through the real pipeline, with no titles', () => {
    const seed = buildDemoSeed({ days, now, anchorSource: '2026-10-16', seed: 3 });
    expect(seed.perDay).toHaveLength(14);
    expect(seed.bins.length).toBeGreaterThan(2000);
    expect(seed.samples.length).toBeGreaterThan(2000);
    expect(seed.nudges.length).toBeGreaterThan(3);
    expect(seed.samples.every((s) => s.territoryId === null && !('title' in s) && !('vector' in s))).toBe(true);
    expect(seed.samples.every((s) => s.content in CONTENT)).toBe(true);
    expect(seed.bins.every((b) => b.territoryId === null)).toBe(true);
    const last = Math.max(...seed.bins.map((b) => b.binStart));
    expect(last).toBeLessThanOrEqual(now.getTime() + 60_000);
    expect(new Set(seed.nudges.map((n) => n.response)).size).toBeGreaterThanOrEqual(2);
    expect(seed.bins.some((b) => b.nudgeShown)).toBe(true);
    const again = buildDemoSeed({ days, now, anchorSource: '2026-10-16', seed: 3 });
    expect(again.samples.length).toBe(seed.samples.length);
  }, 60_000);
});

// `DEMO_BUILD=1 npm run demo:seed` reads the owner's reduced history (.demo-history/days.json, git-ignored)
// and writes `.output/demo-seed.json` for the loader.
describe.skipIf(!process.env.DEMO_BUILD)('demo seed from the owner history', () => {
  it('writes .output/demo-seed.json', () => {
    const file = resolve(__dirname, '../../../.demo-history/days.json');
    expect(existsSync(file)).toBe(true);
    const days = JSON.parse(readFileSync(file, 'utf8')) as HistoryDays;
    const anchor = process.env.DEMO_ANCHOR ?? '2026-10-16';
    const seed = buildDemoSeed({ days, now: new Date(), anchorSource: anchor, windowDays: Number(process.env.DEMO_DAYS ?? 14), seed: 11 });
    const out = resolve(__dirname, '../../.output');
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'demo-seed.json'), JSON.stringify(seed));
    console.log(JSON.stringify({ bins: seed.bins.length, samples: seed.samples.length, nudges: seed.nudges.length }), '\n' + seed.perDay.map((d) => `${d.date} ← ${d.source}: ${d.segments} segs, deep ${d.deepMin} min, drain ${d.drainMin} min`).join('\n'));
    expect(seed.samples.length).toBeGreaterThan(5000);
  }, 300_000);
});
