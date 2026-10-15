import { browser } from 'wxt/browser';
import { countByTs, get, getRange, put } from '@/lib/db';
import { recordEvent } from '@/lib/replay/recorder';
import { getSettings, isPaused, type Settings } from '@/lib/settings';
import { initialState, liveStats, needsTick, step, type PipelineOutput, type PipelineState } from './pipeline';
import { isObserverEvent, type PipelineEvent } from './types';
import { sanitizePath } from './url';

/**
 * The service worker's observer service: scrubs incoming events, records them (dev mode), runs
 * them through the pipeline in order, and persists samples and bins. Chrome wiring lives in
 * ./background.ts; this module only touches storage, so it can be tested with fakes.
 *
 * Privacy (PDD 11): item text is removed here, before the pipeline or the recorder sees an event,
 * and titles are kept only when "store titles" is on. Nothing is processed while paused.
 */

export const STATE_KEY = 'observer-state';
const TITLE_MAX = 300;

interface ServiceState {
  pipeline: PipelineState;
  /** tabId → IndexedDB id of the tab's latest sample, for dwell updates. */
  sampleIdByTab: Record<string, number>;
}

export interface LiveStats {
  samplesToday: number;
  activeMinToday: number;
  itemsPerMinNow: number;
  pausedUntil: Settings['pausedUntil'];
}

/** Removes everything the pipeline and recorder must never see. Returns a new object. */
export function scrubEvent(ev: PipelineEvent, settings: Pick<Settings, 'storeTitles'>): PipelineEvent {
  if (ev.type === 'item') {
    const { text: _text, title, ...rest } = ev;
    const clean = { ...rest, path: sanitizePath(rest.path) };
    return settings.storeTitles && title ? { ...clean, title: title.slice(0, TITLE_MAX) } : clean;
  }
  if (ev.type === 'heartbeat') return { ...ev, path: sanitizePath(ev.path) };
  return { ...ev };
}

export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createObserverService(opts: { now?: () => number; onTickNeeded?: (needed: boolean) => void } = {}) {
  const now = opts.now ?? Date.now;
  let state: ServiceState | null = null;
  let settings: Settings | null = null;
  let chain: Promise<void> = Promise.resolve();
  let tickNeeded: boolean | null = null;

  async function load(): Promise<{ state: ServiceState; settings: Settings }> {
    if (!state) {
      const stored = (await browser.storage.session.get(STATE_KEY))[STATE_KEY] as ServiceState | undefined;
      state = stored?.pipeline?.v === 1 ? stored : { pipeline: initialState(), sampleIdByTab: {} };
    }
    settings ??= await getSettings();
    return { state, settings };
  }

  /** Runs `job` after every job queued before it, so events are processed strictly in order. */
  function queue<T>(job: () => Promise<T>): Promise<T> {
    const result = chain.then(job);
    chain = result.then(
      () => undefined,
      (err: unknown) => console.error('[doomscroll] observer service:', err),
    );
    return result;
  }

  async function persist(s: ServiceState, outputs: PipelineOutput[]): Promise<void> {
    for (const o of outputs) {
      if (o.kind === 'bin') {
        await put('bins', o.record);
      } else if (o.kind === 'sample') {
        s.sampleIdByTab[String(o.record.tabId)] = await put('samples', o.record);
      } else {
        const id = s.sampleIdByTab[String(o.tabId)];
        const sample = id == null ? undefined : await get('samples', id);
        if (sample) await put('samples', { ...sample, dwellMs: o.dwellMs });
      }
    }
  }

  async function process(ev: PipelineEvent): Promise<void> {
    const { state: s, settings: cfg } = await load();
    // Defence in depth: content scripts stop while paused, but drop anything that still arrives.
    if (isObserverEvent(ev) && (isPaused(cfg, now()) || s.pipeline.paused)) return;
    const clean = scrubEvent(ev, cfg);
    // While paused nothing is recorded except the pause/resume markers; resuming records a fresh
    // snapshot of focus, tabs and idle state, so a replay starts from the right state.
    const pausedNow = s.pipeline.paused && clean.type !== 'pause';
    if (cfg.devMode && clean.type !== 'tick' && !pausedNow) await recordEvent(clean);
    await persist(s, step(s.pipeline, clean));
    if (clean.type === 'tab-removed') delete s.sampleIdByTab[String(clean.tabId)];
    await browser.storage.session.set({ [STATE_KEY]: s });
    const needed = needsTick(s.pipeline, now());
    if (needed !== tickNeeded) {
      tickNeeded = needed;
      opts.onTickNeeded?.(needed);
    }
  }

  return {
    /** Queue one event. The returned promise settles when it has been processed and persisted. */
    enqueue(ev: PipelineEvent): Promise<void> {
      return queue(() => process(ev));
    },

    /** New settings. Emits a `pause` event when the paused state flips; returns true if it did. */
    setSettings(next: Settings): Promise<boolean> {
      return queue(async () => {
        const { state: s } = await load();
        settings = next;
        const paused = isPaused(next, now());
        if (paused === s.pipeline.paused) return false;
        await process({ type: 'pause', ts: now(), paused });
        return true;
      });
    },

    /** Whether the pipeline has state from earlier in this browser session. */
    hasState(): Promise<boolean> {
      return queue(async () => (await load()).state.pipeline.lastTs != null);
    },

    async liveStats(): Promise<LiveStats> {
      await this.enqueue({ type: 'tick', ts: now() });
      return queue(async () => {
        const { state: s, settings: cfg } = await load();
        const t = now();
        const dayStart = startOfLocalDay(t);
        const bins = await getRange('bins', dayStart, t);
        const live = liveStats(s.pipeline, t);
        const activeS = bins.reduce((sum, b) => sum + (b.active_s ?? 0), 0) + live.openBinActiveS;
        return {
          samplesToday: await countByTs('samples', dayStart, t),
          activeMinToday: Math.floor(activeS / 60),
          itemsPerMinNow: live.itemsPerMinNow,
          pausedUntil: cfg.pausedUntil,
        };
      });
    },
  };
}

export type ObserverService = ReturnType<typeof createObserverService>;
