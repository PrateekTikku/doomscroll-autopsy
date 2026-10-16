import { GEN_IDLE_UNLOAD_MS } from './config';
import { loadGenerator, type GenOptions, type GenResult, type Generator } from './generator';
import type { GenStatus } from './messages';

/**
 * The writer model's host in the offscreen document (PDD 9.9): loaded on the first request, one
 * generation at a time, unloaded after `idleMs` without requests or on demand. All state is
 * recoverable: if the document is recreated the next request loads the model again.
 */
export interface GenHostDeps {
  load?: (onProgress: (p: number) => void) => Promise<Generator>;
  idleMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export function createGenHost(deps: GenHostDeps = {}) {
  const load = deps.load ?? ((p) => loadGenerator(p));
  const idleMs = deps.idleMs ?? GEN_IDLE_UNLOAD_MS;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as never));

  let generator: Generator | null = null;
  let loading: Promise<Generator> | null = null;
  let timer: unknown = null;
  let queue: Promise<unknown> = Promise.resolve();
  const speeds: number[] = [];
  const status: GenStatus = { state: 'not-started', percent: 0, error: null, device: null, loadMs: null, generations: 0, medianTokPerS: null };

  async function ensure(): Promise<Generator> {
    if (generator) return generator;
    loading ??= (async () => {
      status.state = 'loading';
      status.error = null;
      status.percent = 0;
      const t0 = performance.now();
      try {
        const g = await load((p) => {
          status.percent = p;
        });
        generator = g;
        status.state = 'ready';
        status.percent = 100;
        status.device = g.device;
        status.loadMs = Math.round(performance.now() - t0);
        return g;
      } catch (err) {
        status.state = 'error';
        status.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function armIdle() {
    if (timer != null) clearTimer(timer);
    timer = setTimer(() => void unload(), idleMs);
  }

  async function unload(): Promise<GenStatus> {
    if (timer != null) clearTimer(timer);
    timer = null;
    const g = generator;
    generator = null;
    if (g) {
      await g.dispose().catch(() => undefined);
      status.state = 'unloaded';
    }
    return { ...status };
  }

  return {
    status: (): GenStatus => ({ ...status }),
    /** Runs one generation; requests are queued so the model never runs two at once. */
    generate(opts: GenOptions): Promise<GenResult> {
      const run = async () => {
        if (timer != null) clearTimer(timer);
        const g = await ensure();
        try {
          const r = await g.generate(opts);
          status.generations++;
          if (r.ms > 0 && r.newTokens > 0) {
            speeds.push(r.newTokens / (r.ms / 1000));
            if (speeds.length > 100) speeds.shift();
            const s = [...speeds].sort((a, b) => a - b);
            status.medianTokPerS = Math.round(s[s.length >> 1]! * 10) / 10;
          }
          return r;
        } finally {
          armIdle();
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
    unload,
  };
}

export type GenHost = ReturnType<typeof createGenHost>;
