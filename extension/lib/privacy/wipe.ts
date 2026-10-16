import { browser } from 'wxt/browser';
import { clearAll } from '@/lib/db';

/**
 * Wipe everything (PDD 11.4): every IndexedDB store, the model cache (Cache API), session state
 * and all settings (they return to defaults). Nothing is logged: a wipe leaves no trace.
 */
export interface WipeReport {
  caches: number;
}

export async function wipeEverything(): Promise<WipeReport> {
  await clearAll();
  let caches = 0;
  if (typeof globalThis.caches !== 'undefined') {
    for (const key of await globalThis.caches.keys()) {
      if (await globalThis.caches.delete(key)) caches++;
    }
  }
  await browser.storage.session.clear().catch(() => undefined);
  await browser.storage.local.clear();
  return { caches };
}
