import { browser } from 'wxt/browser';

const OFFSCREEN_PATH = '/offscreen.html';
let creating: Promise<void> | null = null;

/**
 * Create the offscreen document (the model host, PDD 6.1) if it doesn't exist yet.
 * Only one offscreen document can exist at a time (PDD 12.2).
 */
export async function ensureOffscreenDocument(): Promise<void> {
  const url = browser.runtime.getURL(OFFSCREEN_PATH);
  const existing = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({
      url,
      // WORKERS: S2 confirmed Chrome accepts it for the ML host (V-07). There is no ML-specific reason.
      reasons: [browser.offscreen.Reason.WORKERS],
      justification: 'Runs on-device Gemma models (EmbeddingGemma 2, Gemma 3 270M) with WebGPU.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}
