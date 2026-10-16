import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAll, closeDb, count, get, getAll, put, STORE_NAMES, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { ensureReports } from '@/lib/metrics/service';
import { binsFrom, territory } from '@/lib/metrics/testutil';
import { dayStart } from '@/lib/metrics/time';
import { addDomain, addKeyword, listEntries, normalizeDomain, removeEntry } from './blocklist-edit';
import { forgetRange, forgetSite, originMatchesSite, siteKey } from './forget';
import { applyRetention, stripTitles } from './retention';
import { DEFAULT_SETTINGS } from '@/lib/settings';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const NOW = new Date(2026, 9, 16, 12, 0, 0).getTime();
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return dayStart(date) + (h! * 60 + m!) * 60_000;
};

function vec(axis: number, dim = 256): Float32Array {
  const v = new Float32Array(dim);
  v[axis] = 1;
  return v;
}

const sample = (ts: number, origin: string, territoryId: string | null, vector: Float32Array | null, extra: Partial<SampleRecord> = {}): SampleRecord => ({
  ts, tabId: 1, origin, path: '/feed', isVisual: false, dwellMs: 20_000, vector, territoryId, territoryDist: 0.1, ...extra,
});

async function seed() {
  const t = (id: string, name: string, label: TerritoryRecord['label'], axis: number, extra: Partial<TerritoryRecord> = {}) =>
    territory(id, name, label, { centroid: vec(axis), size: 0, ...extra });
  await put('territories', t('docs', 'docs.example · guide', 'deep', 0));
  await put('territories', t('reels', 'youtube.com · shorts', null, 1, { suggestedLabel: 'drain', labelConfirmed: false }));
  await put('territories', t('news', 'news.example · item', 'shallow', 2));
  // 2026-10-15: docs 09:00-09:40 (80 samples), reels 09:40-09:55
  for (let i = 0; i < 40; i++) await put('samples', sample(at('2026-10-15', '09:00') + i * 60_000, 'https://docs.example', 'docs', vec(0)));
  for (let i = 0; i < 15; i++) await put('samples', sample(at('2026-10-15', '09:40') + i * 60_000, 'https://www.youtube.com', 'reels', vec(1)));
  for (let i = 0; i < 5; i++) await put('samples', sample(at('2026-10-15', '10:00') + i * 60_000, 'https://news.example', 'news', vec(2), { title: 'A headline' }));
  for (const b of binsFrom('2026-10-15', '09:00', [[40, 'docs'], [15, 'reels'], [5, 'news']])) await put('bins', b);
  // 2026-10-16: docs only
  for (let i = 0; i < 10; i++) await put('samples', sample(at('2026-10-16', '09:00') + i * 60_000, 'https://docs.example', 'docs', vec(0)));
  for (const b of binsFrom('2026-10-16', '09:00', [[10, 'docs']])) await put('bins', b);
  await put('nudges', { ts: at('2026-10-15', '09:50'), step: 1, score: 0.7, mode: 'rules', response: 'back', secondsToReturn: 100 });
  await put('recorderEvents', { ts: at('2026-10-15', '09:45'), tabId: 1, event: { type: 'item', origin: 'https://www.youtube.com' } });
  await put('territories', { ...(await get('territories', 'docs'))!, size: 50 });
  await ensureReports(NOW);
}

describe('forgetRange', () => {
  it('removes samples, bins, nudges and recorder events in the range and nothing else', async () => {
    await seed();
    const r = await forgetRange(at('2026-10-15', '09:40'), at('2026-10-15', '09:59'));
    expect(r).toMatchObject({ samples: 15, nudges: 1, recorderEvents: 1 });
    expect(r.bins).toBeGreaterThanOrEqual(30);
    expect((await getAll('samples')).filter((s) => s.territoryId === 'reels')).toHaveLength(0);
    expect((await getAll('samples')).filter((s) => s.territoryId === 'docs')).toHaveLength(50);
    expect(await count('nudges')).toBe(0);
  });

  it('removes an emptied unconfirmed territory, keeps a confirmed one dormant, and recomputes centroids and sizes', async () => {
    await seed();
    await forgetRange(at('2026-10-15', '09:40'), at('2026-10-15', '09:59')); // reels (unconfirmed) emptied
    expect(await get('territories', 'reels')).toBeUndefined();
    await forgetRange(at('2026-10-15', '10:00'), at('2026-10-15', '10:10')); // news (confirmed) emptied
    expect((await get('territories', 'news'))!.size).toBe(0);
    // partial removal: docs loses 20 of 50 samples, centroid stays on axis 0
    await forgetRange(at('2026-10-15', '09:00'), at('2026-10-15', '09:19'));
    const docs = (await get('territories', 'docs'))!;
    expect(docs.size).toBe(30);
    expect(docs.centroid[0]).toBeCloseTo(1, 5);
  });

  it('shifts a centroid toward the samples that remain', async () => {
    await seed();
    await put('samples', sample(at('2026-10-15', '11:00'), 'https://docs.example', 'docs', vec(3)));
    await forgetRange(at('2026-10-15', '09:00'), at('2026-10-15', '09:39'));
    const docs = (await get('territories', 'docs'))!;
    // remaining docs members: 10 on 2026-10-16 (axis 0) and 1 on axis 3
    expect(docs.size).toBe(11);
    expect(docs.centroid[0]!).toBeGreaterThan(docs.centroid[3]!);
    expect(docs.centroid[3]!).toBeGreaterThan(0);
  });

  it('regenerates the report of an affected day and logs only the kind and range', async () => {
    await seed();
    const before = (await get('reports', '2026-10-15'))!;
    expect(before.facts.totalsMin.drain).toBe(15);
    await forgetRange(at('2026-10-15', '09:40'), at('2026-10-15', '09:59'));
    const after = (await get('reports', '2026-10-15'))!;
    expect(after.facts.totalsMin.drain).toBe(0);
    expect(after.autopsy).not.toBe(before.autopsy);
    const log = await getAll('forgetLog');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'range' });
    expect(JSON.stringify(log)).not.toMatch(/youtube|docs\.example|headline/);
  });

  it('drops the report of a day that has no data left', async () => {
    await seed();
    await forgetRange(at('2026-10-15', '00:00'), at('2026-10-15', '23:59'));
    expect(await get('reports', '2026-10-15')).toBeUndefined();
    expect(await count('samples')).toBe(10);
  });
});

describe('forgetSite', () => {
  it('matches the site and its subdomains only', () => {
    expect(originMatchesSite('https://www.youtube.com', siteKey('YouTube.com'))).toBe(true);
    expect(originMatchesSite('https://m.youtube.com', 'youtube.com')).toBe(true);
    expect(originMatchesSite('https://notyoutube.com', 'youtube.com')).toBe(false);
    expect(siteKey('https://www.Example.com/a?b=1#c')).toBe('example.com');
  });

  it('removes that site, its covered bins, its recorder events, and updates territories and reports', async () => {
    await seed();
    const r = await forgetSite('youtube.com');
    expect(r.samples).toBe(15);
    expect(r.recorderEvents).toBe(1);
    expect(r.bins).toBeGreaterThanOrEqual(15);
    expect((await getAll('samples')).some((s) => s.origin.includes('youtube'))).toBe(false);
    expect(await get('territories', 'reels')).toBeUndefined();
    expect((await get('reports', '2026-10-15'))!.facts.totalsMin.drain).toBe(0);
    expect(await getAll('forgetLog')).toEqual([expect.objectContaining({ kind: 'site', site: 'youtube.com' })]);
  });

  it('rejects something that is not a site', async () => {
    await expect(forgetSite('hello')).rejects.toThrow();
  });
});

describe('wipe and retention', () => {
  it('clearAll empties every store', async () => {
    await seed();
    await clearAll();
    for (const s of STORE_NAMES) expect(await count(s), s).toBe(0);
  });

  it('retention drops data older than N days from every store', async () => {
    await seed();
    const r = await applyRetention(1, NOW);
    expect(r.samples).toBe(60);
    expect(await count('samples')).toBe(10);
    // a report is dropped once its whole day is outside the window
    expect(await get('reports', '2026-10-15')).toBeDefined();
    expect((await applyRetention(1, NOW + 86_400_000)).reports).toBe(1);
    expect(await get('reports', '2026-10-15')).toBeUndefined();
    expect(await count('nudges')).toBe(0);
    expect(r.bins).toBeGreaterThan(0);
  });

  it('keeps everything inside the window', async () => {
    await seed();
    const r = await applyRetention(30, NOW);
    expect(r).toMatchObject({ samples: 0, bins: 0, nudges: 0, recorderEvents: 0, reports: 0 });
  });

  it('strips stored titles', async () => {
    await seed();
    expect(await stripTitles()).toBe(5);
    expect((await getAll('samples')).some((s) => s.title !== undefined)).toBe(false);
  });
});

describe('blocklist editing', () => {
  const base = DEFAULT_SETTINGS.blocklist;

  it('normalises domains and rejects junk', () => {
    expect(normalizeDomain('https://www.Example.com/path?q=1')).toBe('example.com');
    expect(normalizeDomain('*.bank.co.uk')).toBe('bank.co.uk');
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(addDomain(base, 'nope').error).toBeTruthy();
  });

  it('adds, lists and removes your own entries', () => {
    let edits = addDomain(base, 'mybank.example.com').edits;
    edits = addKeyword(edits, 'payroll').edits;
    expect(edits.addedDomains).toEqual(['mybank.example.com']);
    const list = listEntries(edits);
    expect(list.find((e) => e.value === 'mybank.example.com')).toMatchObject({ isDefault: false, removable: true });
    expect(list.find((e) => e.value === 'payroll')).toBeTruthy();
    edits = removeEntry(edits, 'domain', 'mybank.example.com');
    edits = removeEntry(edits, 'keyword', 'payroll');
    expect(edits).toEqual(base);
  });

  it('removing a shipped domain records it, and adding it back undoes that', () => {
    let edits = removeEntry(base, 'domain', 'chase.com');
    expect(edits.removedDomains).toEqual(['chase.com']);
    expect(listEntries(edits).some((e) => e.value === 'chase.com')).toBe(false);
    edits = addDomain(edits, 'chase.com').edits;
    expect(edits.removedDomains).toEqual([]);
    expect(listEntries(edits).some((e) => e.value === 'chase.com')).toBe(true);
  });

  it('rejects short or spaced keywords', () => {
    expect(addKeyword(base, 'ab').error).toBeTruthy();
    expect(addKeyword(base, 'two words').error).toBeTruthy();
  });
});
