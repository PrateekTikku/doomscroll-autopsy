import type { TopicTag } from '@shared/types';
import { truncateAndNormalize } from './truncate';

/**
 * Zero-shot topic tags (PDD 9.3, Should). EmbeddingGemma 2 puts text and images in one space, so the
 * cosine between a territory's centroid and a topic phrase says what a (possibly visual) territory is
 * about. ~300 hand-written phrases (`assets/topics.json`) are embedded once as text; each territory
 * keeps its top 3 above a floor. Pure functions here; storage and embedding are in `topics-service.ts`.
 */
export const TOPIC_TOP_K = 3;
/** Below this cosine a topic says nothing (a visual centroid vs a random phrase sits around 0.1-0.2). */
export const TOPIC_MIN_SCORE = 0.3;

export interface TopicVectors {
  version: string;
  phrases: string[];
  /** Raw (unnormalised-to-dim) vectors as the model produced them; truncated to the centroid's size on use. */
  vectors: Float32Array[];
}

/** Changes when the phrase list changes, so a stale vector set is recomputed. */
export function topicsVersion(phrases: string[]): string {
  let h = 2166136261;
  for (const ch of phrases.join('\n')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${phrases.length}-${h.toString(16)}`;
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

/** Top `k` phrases by cosine to `centroid` (unit length), at least `minScore`, scores rounded to 2 decimals. */
export function topTags(centroid: Float32Array, topics: TopicVectors, k = TOPIC_TOP_K, minScore = TOPIC_MIN_SCORE): TopicTag[] {
  const scored: TopicTag[] = [];
  topics.vectors.forEach((v, i) => {
    const t = truncateAndNormalize(v, centroid.length);
    if (!t) return;
    const score = Math.round(dot(centroid, t) * 100) / 100;
    if (score >= minScore) scored.push({ tag: topics.phrases[i]!, score });
  });
  return scored.sort((a, b) => b.score - a.score || (a.tag < b.tag ? -1 : 1)).slice(0, k);
}
