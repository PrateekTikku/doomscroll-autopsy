import { browser } from 'wxt/browser';
import type { createRouter } from '@/lib/messaging';
import { send } from '@/lib/messaging';
import { getByTs, type SampleRecord } from '@/lib/db';
import { ensureOffscreenDocument } from '@/lib/offscreen';
import { getSettings, isPaused } from '@/lib/settings';
import { createCaptureLimiter } from './capture';
import './messages';
import type { EmbedderStatus, EmbedStatusView } from './messages';
import { createEmbedService, type ItemInput } from './service';

/**
 * Wires embedding into the service worker: screenshot capture (PDD 7.5), the offscreen model host,
 * the 10-minute idle unload (PDD 9.9) and the status message for the popup.
 */
const IDLE_ALARM = 'embedder-idle';
const IDLE_UNLOAD_MIN = 10;

type Router = ReturnType<typeof createRouter>;

const EMPTY_STATUS: EmbedderStatus = {
  state: 'not-started',
  percent: 0,
  device: null,
  dtype: null,
  vision: null,
  error: null,
  embeds: 0,
  failed: 0,
  medianMs: null,
  p95Ms: null,
};

async function offscreenExists(): Promise<boolean> {
  const url = browser.runtime.getURL('/offscreen.html' as never);
  const ctx = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  return ctx.length > 0;
}

export function registerEmbedding(router: Router): { submitItem(item: ItemInput): void } {
  const limiter = createCaptureLimiter();

  async function capture(tabId: number): Promise<string | null> {
    const tab = await browser.tabs.get(tabId);
    if (!tab.active || tab.incognito || tab.windowId == null) return null;
    const win = await browser.windows.get(tab.windowId);
    if (!win.focused) return null;
    if (!limiter.tryAcquire(Date.now())) return null;
    return browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
  }

  const service = createEmbedService({
    capture: (tabId) => capture(tabId).catch(() => null),
    async embed(input) {
      await ensureOffscreenDocument();
      return send('offscreen', 'embed', input);
    },
    devMode: async () => (await getSettings()).devMode,
    isPaused: async () => isPaused(await getSettings()),
    onIdle: () => void browser.alarms.create(IDLE_ALARM, { delayInMinutes: IDLE_UNLOAD_MIN }),
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== IDLE_ALARM) return;
    void (async () => {
      if (service.stats().queued > 0 || !(await offscreenExists())) return;
      await send('offscreen', 'embedder-unload').catch(() => undefined);
    })();
  });

  router.register('embed-status', async (): Promise<EmbedStatusView> => {
    // Don't create the offscreen document just to answer a popup poll.
    const model = (await offscreenExists()) ? await send('offscreen', 'embedder-status').catch(() => EMPTY_STATUS) : EMPTY_STATUS;
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const rows = (await getByTs('samples', day.getTime(), Date.now())) as SampleRecord[];
    const s = service.stats();
    return {
      ...model,
      queued: s.queued,
      skipped: s.skipped,
      droppedImages: s.droppedImages,
      droppedJobs: s.droppedJobs,
      submitted: s.submitted,
      written: s.written,
      noInput: s.noInput,
      noInputVisual: s.noInputVisual,
      unmatched: s.unmatched,
      nonFinite: s.nonFinite,
      errors: s.errors,
      samplesToday: rows.length,
      vectorsToday: rows.filter((r) => r.vector !== null).length,
    };
  });

  return { submitItem: (item) => void service.submit(item) };
}
