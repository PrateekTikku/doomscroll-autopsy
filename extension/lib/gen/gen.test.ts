import Ajv from 'ajv/dist/2020';
import descriptionSchema from '@shared/territory-description.schema.json';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DailyFacts } from '@shared/types';
import { closeDb, get, getAll, put, type BinRecord, type SampleRecord } from '@/lib/db';
import { generateReport, setAutopsyWriter, templateWriter } from '@/lib/metrics/service';
import { renderAutopsy } from '@/lib/metrics/autopsy';
import { binsFrom, emptyFacts, territory } from '@/lib/metrics/testutil';
import { dayStart } from '@/lib/metrics/time';
import { writeAutopsy } from './autopsy';
import { modelAutopsyWriter } from './background';
import type { GenerateFn } from './client';
import { describeTerritory, nameWithModel, pathPrefixOf } from './naming';
import { nameTerritories } from './naming-service';
import { getGenStats } from './stats';
import fixtures from './fixtures/prompts.json';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  setAutopsyWriter(templateWriter);
});

const ok = (text: string) => ({ text, newTokens: 10, ms: 100 });
const scripted = (...outs: Array<string | Error>): GenerateFn & { calls: Array<{ sample: boolean; prompt: string }> } => {
  const calls: Array<{ sample: boolean; prompt: string }> = [];
  const fn = (async (req) => {
    calls.push({ sample: req.sample, prompt: req.prompt });
    const o = outs[Math.min(calls.length - 1, outs.length - 1)]!;
    if (o instanceof Error) throw o;
    return ok(o);
  }) as GenerateFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
};

const validDescription = new Ajv({ strict: false }).compile(descriptionSchema);
const D = '2026-10-14';

const sample = (ts: number, origin: string, path: string, territoryId: string, title?: string): SampleRecord => ({
  ts, tabId: 1, origin, path, ...(title ? { title } : {}), isVisual: false, dwellMs: 20_000, vector: null, territoryId, territoryDist: 0.1,
});

function seedTerritory(id: string, origin: string, path: string, over: Parameters<typeof territory>[3] = {}) {
  return { samples: Array.from({ length: 30 }, (_, i) => sample(dayStart(D) + (9 * 60 + i) * 60_000, origin, path, id, i < 3 ? `Title ${i}` : undefined)), territory: territory(id, `${origin.replace('https://', '')} · x`, null, { size: 30, labelConfirmed: false, ...over }) };
}

const goodNaming = '{"name":"Short form video feed","suggested_label":"drain","why":"A high pace of 2.0 items per minute suggests passive consumption."}';

describe('describeTerritory', () => {
  it('builds a schema-valid description from samples and bins', () => {
    const { samples } = seedTerritory('t1', 'https://www.youtube.com', '/shorts/AbCdEf123456789012');
    const bins = binsFrom(D, '09:00', [[20, 't1']]);
    const d = describeTerritory({ samples, bins, storeTitles: true })!;
    expect(validDescription(d), JSON.stringify(validDescription.errors)).toBe(true);
    expect(d.origins).toEqual([{ origin: 'https://www.youtube.com', pathPrefix: '/shorts', count: 30 }]);
    expect(d.sampleTitles).toEqual(['Title 2', 'Title 1', 'Title 0']);
    expect(d.velocity).toEqual({ itemsPerMin: 2, skipRate: 0, meanDwellS: 20 });
    expect(d.minutesToday).toBe(20);
  });

  it('passes the top-3 topic tags into the description, clamped and still schema-valid', () => {
    const { samples } = seedTerritory('t1', 'https://www.youtube.com', '/shorts/x');
    const bins = binsFrom(D, '09:00', [[20, 't1']]);
    const tags = [{ tag: 'memes', score: 0.51 }, { tag: 'celebrity news', score: 0.4 }, { tag: 'gaming clips', score: 0.33 }, { tag: 'fourth', score: 0.31 }];
    const d = describeTerritory({ samples, bins, storeTitles: false, topicTags: tags })!;
    expect(d.topicTags).toEqual(tags.slice(0, 3));
    expect(validDescription(d), JSON.stringify(validDescription.errors)).toBe(true);
    expect(describeTerritory({ samples, bins, storeTitles: false })!.topicTags).toEqual([]);
  });

  it('leaves titles out when "store titles" is off, uses "/" for IDs, and needs some activity', () => {
    const { samples } = seedTerritory('t1', 'https://x.com', '/1234567890');
    expect(describeTerritory({ samples, bins: binsFrom(D, '09:00', [[5, 't1']]), storeTitles: false })!.sampleTitles).toEqual([]);
    expect(pathPrefixOf('/1234567890/status')).toBe('/');
    expect(pathPrefixOf('/en-US/docs/x')).toBe('/en-us');
    expect(describeTerritory({ samples, bins: binsFrom(D, '09:00', [[0.5, 't1']]), storeTitles: true })).toBeNull();
  });

  it('keeps at most 5 origins, most frequent first', () => {
    const samples = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].flatMap((h, i) => Array.from({ length: 10 - i }, (_, k) => sample(k, `https://${h}.com`, '/', 't1')));
    const d = describeTerritory({ samples, bins: binsFrom(D, '09:00', [[5, 't1']]), storeTitles: true })!;
    expect(d.origins.map((o) => o.origin)).toEqual(['a', 'b', 'c', 'd', 'e'].map((h) => `https://${h}.com`));
  });
});

describe('nameWithModel', () => {
  const desc = describeTerritory({ samples: seedTerritory('t1', 'https://www.youtube.com', '/shorts').samples, bins: binsFrom(D, '09:00', [[20, 't1']]), storeTitles: false })!;

  it('accepts valid output on the first try (greedy)', async () => {
    const gen = scripted(goodNaming);
    const r = await nameWithModel(desc, gen);
    expect(r).toMatchObject({ kind: 'model', name: 'Short form video feed', label: 'drain', attempts: 1 });
    expect(gen.calls[0]!.sample).toBe(false);
    expect(gen.calls[0]!.prompt.startsWith('Name this browsing territory')).toBe(true);
  });

  it('retries once with sampling after invalid output', async () => {
    const gen = scripted('not json', goodNaming);
    const r = await nameWithModel(desc, gen);
    expect(r).toMatchObject({ kind: 'model', attempts: 2, errors: ['bad_json'] });
    expect(gen.calls.map((c) => c.sample)).toEqual([false, true]);
  });

  it('falls back after two refused outputs (an invented number counts)', async () => {
    const r = await nameWithModel(desc, scripted('{"name":"x","suggested_label":"drain","why":"999 items seen"}', '```'));
    expect(r).toMatchObject({ kind: 'fallback', attempts: 2, unavailable: false });
    expect((r as { errors: string[] }).errors).toEqual(['ungrounded_number', 'bad_json']);
  });

  it('reports unavailable when the model cannot run, without retrying', async () => {
    const gen = scripted(new Error('WebGPU is not available'));
    const r = await nameWithModel(desc, gen);
    expect(r).toMatchObject({ kind: 'fallback', unavailable: true });
    expect(gen.calls).toHaveLength(1);
  });
});

describe('nameTerritories', () => {
  const NOW = new Date(2026, 9, 14, 12, 0).getTime();
  async function seed() {
    const yt = seedTerritory('yt', 'https://www.youtube.com', '/shorts');
    const docs = seedTerritory('docs', 'https://docs.python.org', '/3');
    const done = seedTerritory('done', 'https://github.com', '/pulls', { labelConfirmed: true, label: 'deep', name: 'My PR review' });
    for (const t of [yt, docs, done]) {
      await put('territories', t.territory);
      for (const s of t.samples) await put('samples', s);
    }
    for (const id of ['yt', 'docs', 'done']) for (const b of binsFrom(D, '09:00', [[20, id]])) await put('bins', { ...b, binStart: b.binStart + (id === 'docs' ? 3600_000 : id === 'done' ? 7200_000 : 0) } as BinRecord);
  }

  it('names unconfirmed territories, keeps confirmed ones, and records the source', async () => {
    await seed();
    const docsNaming = '{"name":"Python documentation reading","suggested_label":"deep","why":"A mean dwell of 20.0 seconds suggests focused reading."}';
    const gen: GenerateFn = async (req) => ok(req.prompt.includes('docs.python.org') ? docsNaming : goodNaming);
    const r = await nameTerritories(gen, { now: NOW });
    expect(r).toMatchObject({ considered: 2, named: 2, fallback: 0 });
    const yt = (await get('territories', 'yt'))!;
    expect(yt).toMatchObject({ name: 'Short form video feed', nameSource: 'model', suggestedLabel: 'drain', suggestionSource: 'model', labelConfirmed: false });
    expect((await get('territories', 'done'))).toMatchObject({ name: 'My PR review', label: 'deep' });
    expect((await getGenStats()).naming).toMatchObject({ items: 2, model: 2, fallback: 0 });
  });

  it('is idempotent: a model name for the same origins is not asked for again unless forced', async () => {
    await seed();
    const gen = scripted(goodNaming);
    await nameTerritories(gen, { now: NOW });
    const first = gen.calls.length;
    const r = await nameTerritories(gen, { now: NOW });
    expect(r.skipped).toBe(2);
    expect(gen.calls.length).toBe(first);
    await nameTerritories(gen, { now: NOW, force: true });
    expect(gen.calls.length).toBe(first * 2);
  });

  it("keeps the rules' Drain for a known feed when the model says otherwise", async () => {
    const feed = seedTerritory('feed', 'https://www.youtube.com', '/shorts/abcDEF12345');
    await put('territories', feed.territory);
    for (const s of feed.samples) await put('samples', s);
    for (const b of binsFrom(D, '10:00', [[20, 'feed']])) await put('bins', b);
    const shallow = '{"name":"Short videos","suggested_label":"shallow","why":"Scrolling a feed."}';
    const r = await nameTerritories(scripted(shallow), { now: NOW });
    expect(r.labelKeptByRules).toBe(1);
    expect(await get('territories', 'feed')).toMatchObject({ name: 'Short videos', nameSource: 'model', suggestedLabel: 'drain', suggestionSource: 'rules' });
  });

  it('falls back to the baseline name and rules label, and stops when the model is unavailable', async () => {
    await seed();
    const r = await nameTerritories(scripted(new Error('no model')), { now: NOW });
    expect(r).toMatchObject({ named: 0, unavailable: true });
    expect(r.fallback).toBe(1); // stopped after the first
    const stats = await getGenStats();
    expect(stats.naming).toMatchObject({ items: 1, model: 0, fallback: 1, unavailable: 1 });
    expect((await getAll('territories')).every((t) => t.nameSource !== 'model')).toBe(true);
  });

  it('does not overwrite a territory the owner confirmed while the model was running', async () => {
    await seed();
    const gen: GenerateFn = async () => {
      const t = (await get('territories', 'yt'))!;
      await put('territories', { ...t, label: 'drain', labelConfirmed: true });
      return ok(goodNaming);
    };
    await nameTerritories(gen, { now: NOW });
    const yt = (await get('territories', 'yt'))!;
    expect(yt).toMatchObject({ label: 'drain', labelConfirmed: true });
    expect(yt.nameSource).toBeUndefined();
  });
});

const factsBusy: DailyFacts = {
  ...emptyFacts('2026-10-14'),
  deepBlocks: { count: 1, longestMin: 60, totalMin: 60, blocks: [{ start: '09:00', end: '10:00', minutes: 60, territory: 'Design doc' }] },
  residue: { switchesOutOfDeep: 3, meanMinBackToDeep: 2.5 },
  totalsMin: { deep: 60, shallow: 20, drain: 30 },
  drainOverAllowance: [{ territory: 'Reels feed', allowanceMin: 15, minutesOver: 15 }],
  topTriggers: [{ fromTerritory: 'Design doc', toTerritory: 'Reels feed', hour: 10, count: 2 }],
  strongestStretch: { territory: 'Design doc', start: '09:00', end: '10:00', minutes: 60 },
  nudges: { shown: 2, accepted: 1, snoozed: 1, ignored: 0, medianReturnMin: 3 },
};

describe('writeAutopsy', () => {
  const good = renderAutopsy(factsBusy); // the template is, by construction, valid text

  it('uses the model text when it passes every check', async () => {
    const r = await writeAutopsy(factsBusy, scripted(good));
    expect(r).toMatchObject({ text: good, source: { kind: 'model', attempts: 1 }, unavailable: false });
    expect(r.version).toMatch(/doomscroll-gemma-3-270m/);
  });

  it('regenerates once with sampling, then falls back to the template', async () => {
    const swapped = good.replace('1 accepted, 1 snoozed', '1 was snoozed and 1 was accepted'); // fine; plant a real error below
    const bad = good.replace('60 minutes', '75 minutes');
    const gen = scripted(bad, bad);
    const r = await writeAutopsy(factsBusy, gen);
    expect(r).toMatchObject({ text: good, version: 'template', source: { kind: 'template', attempts: 2 } });
    expect(r.source.errors).toContain('ungrounded_number');
    expect(gen.calls.map((c) => c.sample)).toEqual([false, true]);
    void swapped;
  });

  it('accepts the regeneration when the first try was wrong', async () => {
    const r = await writeAutopsy(factsBusy, scripted('Too short.', good));
    expect(r.source).toMatchObject({ kind: 'model', attempts: 2 });
    expect(r.source.errors).toContain('word_count');
  });

  it('refuses the slips the T2 review found (wrong 7-day direction, invented trigger, allowance claim with none)', async () => {
    const f: DailyFacts = { ...factsBusy, drainOverAllowance: [], vs7Day: { deepBlocksDelta: 1.5, drainOverDelta: -4 } };
    const t = renderAutopsy(f);
    const slips: Array<[string, string]> = [
      ['delta_sign_wrong', t.replace('1.5 deep blocks more than your average', '1.5 fewer deep blocks than your average')],
      ['invented_trigger', t.replace('when you moved from Design doc to Reels feed', 'when you moved from Inbox to Reels feed')],
      ['claims_over_allowance', `${t} You went over your allowance.`],
    ];
    for (const [code, text] of slips) {
      const r = await writeAutopsy(f, scripted(text, text));
      expect(r.source.kind, code).toBe('template');
      expect(r.source.errors, code).toContain(code);
    }
  });

  it('falls back to the template when the model cannot run, and for an empty day without asking it', async () => {
    const gen = scripted(new Error('WebGPU is not available'));
    const r = await writeAutopsy(factsBusy, gen);
    expect(r).toMatchObject({ version: 'template', unavailable: true });
    expect(gen.calls).toHaveLength(1);
    const never = scripted(good);
    const empty = await writeAutopsy(emptyFacts('2026-10-14'), never);
    expect(never.calls).toHaveLength(0);
    expect(empty.source).toEqual({ kind: 'template', attempts: 0, errors: ['empty_day'] });
  });
});

describe('reports use the registered writer', () => {
  it('stores the model version and source on the report, and the template otherwise', async () => {
    for (const t of [territory('doc', 'Design doc', 'deep'), territory('mail', 'Inbox', 'shallow')]) await put('territories', t);
    for (const b of binsFrom(D, '09:00', [[40, 'doc'], [10, 'mail']])) await put('bins', b);
    const plain = await generateReport(D, Date.now());
    expect(plain).toMatchObject({ modelVersion: 'template', source: { kind: 'template' } });
    setAutopsyWriter(async (facts) => ({ text: renderAutopsy(facts), version: 'test-model', source: { kind: 'model', attempts: 1, errors: [] } }));
    const r = await generateReport(D, Date.now());
    expect(r).toMatchObject({ modelVersion: 'test-model', source: { kind: 'model' } });
    expect((await get('reports', D))!.modelVersion).toBe('test-model');
  });

  it('modelAutopsyWriter exists and is the registered writer type', () => {
    expect(typeof modelAutopsyWriter).toBe('function');
    expect(fixtures.length).toBeGreaterThan(0);
  });
});
