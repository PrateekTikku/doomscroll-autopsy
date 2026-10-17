import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { get, getAll, put } from '@/lib/db';
import { TOPIC_MIN_SCORE, topicsVersion, topTags, type TopicVectors } from './topics';
import { ensureTopicVectors, MODEL_TOPIC_VECTORS, refreshTopicTags, topicPhrases } from './topics-service';

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return Float32Array.from(v, (x) => x / n);
};
// Four axes: each phrase points along one; a centroid is a mix.
const phrases = ['recipes', 'memes', 'documentation', 'news'];
const axis = (i: number, len = 8) => Array.from({ length: len }, (_, k) => (k === i ? 1 : 0));
const embedFake = async (text: string) => axis(phrases.indexOf(text));

describe('topTags', () => {
  const topics: TopicVectors = { version: 'v', phrases, vectors: phrases.map((_, i) => Float32Array.from(axis(i, 12))) };
  it('returns the closest phrases above the floor, best first, scores rounded', () => {
    const c = unit([0.8, 0.5, 0.2, 0, 0, 0, 0, 0]);
    const tags = topTags(c, topics);
    expect(tags.map((t) => t.tag)).toEqual(['recipes', 'memes']);
    expect(tags[0]!.score).toBeCloseTo(0.83, 2);
    expect(tags.every((t) => t.score >= TOPIC_MIN_SCORE)).toBe(true);
  });
  it('keeps at most three and may return none', () => {
    expect(topTags(unit([1, 1, 1, 1, 0, 0, 0, 0]), topics, 3, 0.1)).toHaveLength(3);
    expect(topTags(unit([0, 0, 0, 0, 0, 0, 1, 0]), topics)).toEqual([]);
  });
  it('truncates raw phrase vectors to the centroid size', () => {
    const raw: TopicVectors = { version: 'v', phrases: ['x'], vectors: [Float32Array.from([3, 4, 5, 5, 5, 5])] };
    expect(topTags(unit([0.6, 0.8]), raw)[0]).toEqual({ tag: 'x', score: 1 });
  });
  it('version changes with the phrase list', () => {
    expect(topicsVersion(['a', 'b'])).toBe(topicsVersion(['a', 'b']));
    expect(topicsVersion(['a', 'b'])).not.toBe(topicsVersion(['a', 'c']));
  });
});

describe('the shipped phrase list', () => {
  it('has about 300 unique, short phrases', () => {
    expect(topicPhrases.length).toBeGreaterThanOrEqual(280);
    expect(new Set(topicPhrases).size).toBe(topicPhrases.length);
    expect(topicPhrases.every((p) => p.length >= 3 && p.length <= 40 && p === p.trim())).toBe(true);
  });
});

describe('refreshTopicTags', () => {
  const territory = (id: string, centroid: Float32Array) =>
    ({ id, centroid, size: 5, name: id, topicTags: [], suggestedLabel: null, label: null, labelConfirmed: false, allowanceMin: null, createdAt: 1, updatedAt: 1 }) as never;

  it('embeds the phrases once, caches them, and tags every territory', async () => {
    await put('territories', territory('t1', unit([1, 0.1, 0, 0, 0, 0, 0, 0])));
    await put('territories', territory('t2', unit([0, 0, 1, 0.4, 0, 0, 0, 0])));
    let calls = 0;
    const embed = async (t: string) => (calls++, embedFake(t));
    const r1 = await refreshTopicTags(embed, phrases);
    expect(r1).toMatchObject({ vectors: 'computed', territories: 2, tagged: 2, changed: 2 });
    expect(calls).toBe(4);
    const all = await getAll('territories');
    expect(all.find((t) => t.id === 't1')!.topicTags[0]!.tag).toBe('recipes');
    expect(all.find((t) => t.id === 't2')!.topicTags.map((x) => x.tag)).toEqual(['documentation', 'news']);
    const r2 = await refreshTopicTags(embed, phrases);
    expect(r2).toMatchObject({ vectors: 'cached', changed: 0 });
    expect(calls).toBe(4);
    expect((await get('models', MODEL_TOPIC_VECTORS))!.name).toBe(MODEL_TOPIC_VECTORS);
  });

  it('leaves tags alone and reports unavailable when embedding fails', async () => {
    const r = await ensureTopicVectors(async () => null, ['zzz new phrase']);
    expect(r.topics).toBeNull();
    expect(await refreshTopicTags(async () => null, ['zzz new phrase'])).toMatchObject({ vectors: 'unavailable', changed: 0 });
  });
});
