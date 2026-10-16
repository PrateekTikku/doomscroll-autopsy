import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll, put, STORE_NAMES, type SampleRecord } from '@/lib/db';
import { buildPrompt } from './embedder';
import { createEmbedService, writeVector } from './service';

const SECRET = 'Secret item text: my landlord dispute and a medical question';
const IMAGE = 'data:image/jpeg;base64,SECRETIMAGEBYTES';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const sample = (ts: number, tabId = 1): SampleRecord => ({
  ts,
  tabId,
  origin: 'https://example.org',
  path: '/a',
  isVisual: false,
  dwellMs: 0,
  vector: null,
  territoryId: null,
  territoryDist: null,
});

const fakeVector = () => Array.from({ length: 768 }, (_, i) => Math.sin(i + 1));
const noSleep = () => Promise.resolve();

function service(over: Partial<Parameters<typeof createEmbedService>[0]> = {}) {
  const calls: Array<{ text: string | null; image: string | null }> = [];
  const svc = createEmbedService({
    capture: async () => IMAGE,
    embed: async (input) => {
      calls.push({ ...input });
      return { vector: fakeVector(), ms: 20 };
    },
    devMode: async () => false,
    isPaused: async () => false,
    sleep: noSleep,
    ...over,
  });
  return { svc, calls };
}

describe('writeVector', () => {
  it('writes onto the nearest vectorless sample of the same tab', async () => {
    await put('samples', sample(1000, 1));
    await put('samples', sample(1100, 2));
    await put('samples', sample(1500, 1));
    const v = new Float32Array([1, 0]);
    expect(await writeVector({ tabId: 1, ts: 1400 }, v, noSleep)).toBe(true);
    const rows = await getAll('samples');
    expect(rows.find((r) => r.ts === 1500)!.vector).toEqual(v);
    expect(rows.find((r) => r.ts === 1000)!.vector).toBeNull();
    expect(rows.find((r) => r.tabId === 2)!.vector).toBeNull();
  });

  it('gives up cleanly when no sample matches', async () => {
    expect(await writeVector({ tabId: 1, ts: 5 }, new Float32Array([1]), noSleep)).toBe(false);
  });
});

describe('embed service', () => {
  it('stores a 256d unit vector and nothing else of the item', async () => {
    await put('samples', sample(2000));
    const { svc, calls } = service();
    await svc.submit({ tabId: 1, ts: 2000, text: SECRET, isVisual: true });
    await svc.drain();
    expect(calls).toEqual([{ text: SECRET, image: IMAGE }]);
    const rows = await getAll('samples');
    expect(rows[0]!.vector).toHaveLength(256);
    expect(Math.hypot(...rows[0]!.vector!)).toBeCloseTo(1, 4);
    // privacy: no store contains the item text or the image
    for (const name of STORE_NAMES) {
      const dump = JSON.stringify(await getAll(name));
      expect(dump).not.toContain('landlord');
      expect(dump).not.toContain('SECRETIMAGEBYTES');
    }
  });

  it('stores 768d in dev mode', async () => {
    await put('samples', sample(2000));
    const { svc } = service({ devMode: async () => true });
    await svc.submit({ tabId: 1, ts: 2000, text: 'hello', isVisual: false });
    await svc.drain();
    expect((await getAll('samples'))[0]!.vector).toHaveLength(768);
  });

  it('leaves the sample vectorless when the model returns non-finite values', async () => {
    await put('samples', sample(2000));
    const bad = fakeVector();
    bad[3] = NaN;
    const { svc } = service({ embed: async () => ({ vector: bad, ms: 1 }) });
    await svc.submit({ tabId: 1, ts: 2000, text: 'hello', isVisual: false });
    await svc.drain();
    expect((await getAll('samples'))[0]!.vector).toBeNull();
    expect(svc.stats().nonFinite).toBe(1);
  });

  it('does nothing while paused or when there is nothing to embed', async () => {
    const paused = service({ isPaused: async () => true });
    await paused.svc.submit({ tabId: 1, ts: 1, text: 'x', isVisual: false });
    const empty = service({ capture: async () => null });
    await empty.svc.submit({ tabId: 1, ts: 1, text: null, isVisual: true });
    await empty.svc.submit({ tabId: 1, ts: 2, text: null, isVisual: false });
    expect(paused.calls).toHaveLength(0);
    expect(empty.calls).toHaveLength(0);
  });

  it('survives an embed error', async () => {
    const { svc } = service({
      embed: async () => {
        throw new Error('gpu lost');
      },
    });
    await svc.submit({ tabId: 1, ts: 1, text: 'x', isVisual: false });
    await svc.drain();
    expect(svc.stats().errors).toBe(1);
  });
});

describe('buildPrompt', () => {
  it('uses the clustering prefix, collapses whitespace and caps length', () => {
    expect(buildPrompt({ text: '  a\n\n b  ' })).toBe('task: clustering | query: a b');
    expect(buildPrompt({ text: 'x'.repeat(5000) }).length).toBe('task: clustering | query: '.length + 1500);
  });
  it('marks the image position after the text', () => {
    expect(buildPrompt({ text: 'hi', image: 'data:x' })).toBe('task: clustering | query: hi <|image|>');
    expect(buildPrompt({ image: 'data:x' })).toBe('task: clustering | query: <|image|>');
  });
});
