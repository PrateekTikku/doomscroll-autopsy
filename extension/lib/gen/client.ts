import { ensureOffscreenDocument } from '@/lib/offscreen';
import { send } from '@/lib/messaging';
import './messages';
import type { GenResult } from './generator';
import type { GenStatus } from './messages';

/** Service-worker side of the writer model: requests go to the offscreen document (PDD 6.1). */
export type GenerateFn = (req: { prompt: string; maxNewTokens: number; sample: boolean }) => Promise<GenResult>;

export const generateViaOffscreen: GenerateFn = async (req) => {
  await ensureOffscreenDocument();
  return send('offscreen', 'generate', req);
};

/** Frees the writer's memory. Never creates the offscreen document just to unload. */
export async function unloadWriter(): Promise<void> {
  await send('offscreen', 'gen-unload').catch(() => undefined);
}

export async function writerStatus(): Promise<GenStatus | null> {
  try {
    return await send('offscreen', 'gen-status');
  } catch {
    return null;
  }
}
