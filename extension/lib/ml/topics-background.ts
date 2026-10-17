import type { createRouter } from '@/lib/messaging';
import { send } from '@/lib/messaging';
import { ensureOffscreenDocument } from '@/lib/offscreen';
import { refreshTopicTags, type TagReport } from './topics-service';
import './topics-messages';

type Router = ReturnType<typeof createRouter>;

/** Text embedding through the offscreen model host (the same path items take). */
export async function embedTextViaOffscreen(text: string): Promise<number[] | null> {
  await ensureOffscreenDocument();
  const { vector } = await send('offscreen', 'embed', { text, image: null });
  return vector;
}

export const runTopicTags = (): Promise<TagReport> => refreshTopicTags(embedTextViaOffscreen);

export function registerTopics(router: Router): void {
  router.register('topics-refresh', () => runTopicTags());
}
