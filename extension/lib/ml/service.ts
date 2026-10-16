import { getByTs, get, put, type SampleRecord } from '@/lib/db';
import { createCaptureLimiter } from './capture';
import type { EmbedJob } from './queue';
import { createEmbedQueue } from './queue';
import { truncateAndNormalize } from './truncate';

/**
 * Service-worker side of embedding (PDD 6.2 steps 3–5): decide whether to capture a screenshot,
 * queue the job, run it through the offscreen model host one at a time, truncate, and write the
 * vector onto the sample. Text and image live only in `EmbedJob` objects in memory and are dropped
 * once the vector is written.
 */
export const STORED_DIM = 256;
export const DEV_DIM = 768;
const MATCH_WINDOW_MS = 3000;
const WRITE_RETRIES = 4;
const WRITE_RETRY_MS = 400;

export interface ItemInput {
  tabId: number;
  ts: number;
  text: string | null;
  isVisual: boolean;
}

export interface EmbedServiceDeps {
  now?: () => number;
  /** Returns a JPEG data URL for the tab if capture is allowed, else null. */
  capture(tabId: number): Promise<string | null>;
  embed(input: { text: string | null; image: string | null }): Promise<{ vector: number[] | null; ms: number }>;
  devMode(): Promise<boolean>;
  isPaused(): Promise<boolean>;
  onIdle?(): void;
  sleep?(ms: number): Promise<void>;
}

/** Writes `vector` onto the sample that `job` came from. Returns false if no sample matched. */
export async function writeVector(job: Pick<EmbedJob, 'tabId' | 'ts'>, vector: Float32Array, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<boolean> {
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const rows = await getByTs('samples', job.ts - MATCH_WINDOW_MS, job.ts + MATCH_WINDOW_MS);
    const candidates = (rows as SampleRecord[]).filter((s) => s.tabId === job.tabId && s.vector === null);
    candidates.sort((a, b) => Math.abs(a.ts - job.ts) - Math.abs(b.ts - job.ts));
    const target = candidates[0];
    if (target?.id != null) {
      // Re-read by id so a concurrent dwell update isn't overwritten with a stale copy.
      const fresh = (await get('samples', target.id)) ?? target;
      await put('samples', { ...fresh, vector });
      return true;
    }
    await sleep(WRITE_RETRY_MS);
  }
  return false;
}

export function createEmbedService(deps: EmbedServiceDeps) {
  const now = deps.now ?? Date.now;
  const queue = createEmbedQueue({ now });
  let running = false;
  const counters = { submitted: 0, written: 0, nonFinite: 0, errors: 0, unmatched: 0, noInput: 0, noInputVisual: 0 };

  async function runOne(job: EmbedJob): Promise<void> {
    try {
      const { vector } = await deps.embed({ text: job.text, image: job.image });
      const dim = (await deps.devMode()) ? DEV_DIM : STORED_DIM;
      const v = vector ? truncateAndNormalize(vector, dim) : null;
      if (!v) {
        counters.nonFinite++;
        return;
      }
      if (await writeVector(job, v, deps.sleep)) counters.written++;
      else counters.unmatched++;
    } catch (err) {
      counters.errors++;
      console.warn('[doomscroll] embed failed:', err instanceof Error ? err.message : err);
    } finally {
      // Drop text and image references as soon as the job is done.
      job.text = null;
      job.image = null;
    }
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (let job = queue.next(); job; job = queue.next()) await runOne(job);
    } finally {
      running = false;
      deps.onIdle?.();
    }
  }

  return {
    /** Called for every `item` event, before the text is scrubbed. Never throws. */
    async submit(item: ItemInput): Promise<void> {
      try {
        if (await deps.isPaused()) return;
        counters.submitted++;
        const image = item.isVisual ? await deps.capture(item.tabId) : null;
        if (!item.text && !image) {
          // Nothing to embed: no text, and no screenshot (not visual, or capture not allowed now).
          counters.noInput++;
          if (item.isVisual) counters.noInputVisual++;
          return;
        }
        queue.push({ tabId: item.tabId, ts: item.ts, text: item.text, image });
        void pump();
      } catch (err) {
        console.warn('[doomscroll] embed submit failed:', err instanceof Error ? err.message : err);
      }
    },
    /** Resolves when the queue is empty and nothing is in flight (tests, probes). */
    async drain(): Promise<void> {
      while (running || queue.size > 0) {
        void pump();
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    stats() {
      return { ...queue.stats(), queued: queue.size, ...counters };
    },
  };
}

export type EmbedService = ReturnType<typeof createEmbedService>;
export { createCaptureLimiter };
