import type { createRouter } from '@/lib/messaging';
import { send } from '@/lib/messaging';
import { ensureOffscreenDocument } from '@/lib/offscreen';
import { refreshPrediction } from './evaluate';
import { getGruEval, type GruEvalRecord } from './gru-promote';
import './gru-messages';

/** Service-worker side of the GRU: training runs in the offscreen document (TF.js), inference in plain TS. */
type Router = ReturnType<typeof createRouter>;

/** Trains via the offscreen document, then re-decides the active mode so a promotion applies at once. */
export async function runGru(opts: { epochs?: number; maxWindows?: number; backend?: 'webgpu' | 'cpu' | 'auto' } = {}): Promise<GruEvalRecord | null> {
  await ensureOffscreenDocument();
  const record = await send('offscreen', 'gru-train', opts);
  await refreshPrediction(Date.now(), true);
  return record;
}

export function registerGru(router: Router): void {
  router.register('gru-run', (req) => runGru(req ?? {}));
  router.register('gru-status', () => getGruEval());
}
