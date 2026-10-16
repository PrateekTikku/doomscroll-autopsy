/**
 * Embedding queue with backpressure (PDD 9.9, D-49). Pure logic: one job in flight (the caller pops
 * one at a time), at most `maxPerMin` embeds per minute (sub-sampling above that), and when more than
 * `maxQueued` jobs wait, the oldest visual jobs lose their image first (and are dropped if they have
 * no text). Skipped and dropped items simply stay vectorless.
 */
export interface EmbedJob {
  tabId: number;
  ts: number;
  text: string | null;
  /** Data URL, in memory only. */
  image: string | null;
}

export interface QueueOptions {
  maxPerMin?: number;
  maxQueued?: number;
  now?: () => number;
}

export type PushResult = 'queued' | 'skipped';

export function createEmbedQueue(opts: QueueOptions = {}) {
  const maxPerMin = opts.maxPerMin ?? 20;
  const maxQueued = opts.maxQueued ?? 10;
  const now = opts.now ?? Date.now;
  const jobs: EmbedJob[] = [];
  /** Times at which accepted jobs entered the queue during the last minute. */
  const accepted: number[] = [];
  const stats = { skipped: 0, droppedImages: 0, droppedJobs: 0 };

  function prune(t: number): void {
    while (accepted.length > 0 && t - accepted[0]! >= 60_000) accepted.shift();
  }

  function relieve(): void {
    while (jobs.length > maxQueued) {
      const visual = jobs.findIndex((j) => j.image !== null);
      if (visual >= 0) {
        const j = jobs[visual]!;
        j.image = null;
        stats.droppedImages++;
        if (!j.text) {
          jobs.splice(visual, 1);
          stats.droppedJobs++;
        }
      } else {
        jobs.shift();
        stats.droppedJobs++;
      }
    }
  }

  return {
    push(job: EmbedJob): PushResult {
      const t = now();
      prune(t);
      if (accepted.length >= maxPerMin) {
        stats.skipped++;
        return 'skipped';
      }
      accepted.push(t);
      jobs.push(job);
      relieve();
      return 'queued';
    },
    next(): EmbedJob | undefined {
      return jobs.shift();
    },
    get size(): number {
      return jobs.length;
    },
    stats(): Readonly<typeof stats> {
      return { ...stats };
    },
  };
}

export type EmbedQueue = ReturnType<typeof createEmbedQueue>;
