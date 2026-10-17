import { get, getAll, put, type TerritoryRecord } from '@/lib/db';
import topicsFile from '../../assets/topics.json';
import { topicsVersion, topTags, type TopicVectors } from './topics';

/** Storage side of the topic tags: the phrase vectors (`models/topic-vectors`) and each territory's tags. */
export const MODEL_TOPIC_VECTORS = 'topic-vectors';
export const topicPhrases: string[] = (topicsFile as { topics: string[] }).topics;

export type EmbedText = (text: string) => Promise<number[] | null>;

export interface TagReport {
  vectors: 'cached' | 'computed' | 'unavailable';
  phrases: number;
  territories: number;
  tagged: number;
  changed: number;
}

/** True when the phrase vectors for the current phrase list are already stored (no embedding needed). */
export async function hasCachedTopicVectors(phrases = topicPhrases): Promise<boolean> {
  const stored = (await get('models', MODEL_TOPIC_VECTORS))?.data as TopicVectors | undefined;
  return !!stored && stored.version === topicsVersion(phrases);
}

/** The phrase vectors, embedded once as text and cached until the phrase list changes. */
export async function ensureTopicVectors(embed: EmbedText, phrases = topicPhrases): Promise<{ topics: TopicVectors | null; computed: boolean }> {
  const version = topicsVersion(phrases);
  const stored = (await get('models', MODEL_TOPIC_VECTORS))?.data as TopicVectors | undefined;
  if (stored && stored.version === version) return { topics: stored, computed: false };
  const vectors: Float32Array[] = [];
  for (const p of phrases) {
    const v = await embed(p);
    if (!v || !v.every(Number.isFinite)) return { topics: null, computed: false };
    vectors.push(Float32Array.from(v));
  }
  const topics: TopicVectors = { version, phrases: [...phrases], vectors };
  await put('models', { name: MODEL_TOPIC_VECTORS, updatedAt: Date.now(), data: topics });
  return { topics, computed: true };
}

const sameTags = (a: TerritoryRecord['topicTags'], b: TerritoryRecord['topicTags']) => a.length === b.length && a.every((t, i) => t.tag === b[i]!.tag && t.score === b[i]!.score);

/** Recomputes every territory's top-3 tags from its centroid. Embedding failures leave the old tags. */
export async function refreshTopicTags(embed: EmbedText, phrases = topicPhrases): Promise<TagReport> {
  const report: TagReport = { vectors: 'cached', phrases: phrases.length, territories: 0, tagged: 0, changed: 0 };
  const { topics, computed } = await ensureTopicVectors(embed, phrases);
  if (!topics) return { ...report, vectors: 'unavailable' };
  if (computed) report.vectors = 'computed';
  const territories = (await getAll('territories')) as TerritoryRecord[];
  report.territories = territories.length;
  for (const t of territories) {
    const tags = topTags(t.centroid, topics);
    if (tags.length) report.tagged++;
    if (!sameTags(t.topicTags ?? [], tags)) {
      // Re-read so an edit made while embedding ran (a label click) isn't overwritten.
      const fresh = (await get('territories', t.id)) ?? t;
      await put('territories', { ...fresh, topicTags: tags });
      report.changed++;
    }
  }
  return report;
}
