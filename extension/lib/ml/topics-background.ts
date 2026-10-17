import type { createRouter } from '@/lib/messaging';
import { send } from '@/lib/messaging';
import { ensureOffscreenDocument } from '@/lib/offscreen';
import { hasCachedTopicVectors, refreshTopicTags, type TagReport } from './topics-service';
import './topics-messages';

type Router = ReturnType<typeof createRouter>;

/** Text embedding through the offscreen model host (the same path items take). */
export async function embedTextViaOffscreen(text: string): Promise<number[] | null> {
  await ensureOffscreenDocument();
  const { vector } = await send('offscreen', 'embed', { text, image: null });
  return vector;
}

/** The embedder has been loaded before in this browser, so using it again doesn't start a download. */
async function embedderWasLoaded(): Promise<boolean> {
  await ensureOffscreenDocument();
  const st = await send('offscreen', 'embedder-status');
  return st.state === 'ready' || st.state === 'unloaded';
}

/**
 * Refreshes the tags. Background jobs (naming, the nightly job) pass nothing: they never trigger the
 * one-time model download or hold the exclusive queue for it; the dashboard's explicit refresh does.
 * With cached phrase vectors no embedding is needed at all.
 */
export async function runTopicTags(opts: { allowDownload?: boolean } = {}): Promise<TagReport> {
  const cached = await hasCachedTopicVectors();
  if (!cached && !opts.allowDownload && !(await embedderWasLoaded())) {
    return { vectors: 'unavailable', phrases: 0, territories: 0, tagged: 0, changed: 0 };
  }
  return refreshTopicTags(embedTextViaOffscreen);
}

export function registerTopics(router: Router): void {
  router.register('topics-refresh', () => runTopicTags({ allowDownload: true }));
}
