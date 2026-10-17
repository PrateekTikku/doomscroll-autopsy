import { loadEmbedder, type Device, type Embedder } from './embedder';
import type { EmbedderStatus } from './messages';

/**
 * The model host that lives in the offscreen document: lazy load on first use, status for the popup,
 * latency stats, and unload. All state is recoverable: if the document is recreated, the next embed
 * loads the model again (PDD 6.1, 9.9).
 */
const LATENCY_WINDOW = 200;

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/**
 * WebGPU is required: spike S2 found the quantized models don't run on the WASM CPU provider
 * (missing GatherBlockQuantized kernel), so without a GPU adapter we report that instead of
 * downloading ~250 MB for a model that can't start.
 */
async function pickDevice(): Promise<Device> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    if (gpu && (await gpu.requestAdapter())) return 'webgpu';
  } catch {
    /* handled below */
  }
  throw new Error('WebGPU is not available in this browser, so on-device embeddings are off.');
}

export function createModelHost(load: typeof loadEmbedder = loadEmbedder, detect: () => Promise<Device> = pickDevice) {
  let embedder: Embedder | null = null;
  let loading: Promise<Embedder> | null = null;
  const status: EmbedderStatus = {
    state: 'idle',
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
  const latencies: number[] = [];

  async function ensure(): Promise<Embedder> {
    if (embedder) return embedder;
    loading ??= (async () => {
      status.state = 'downloading';
      status.error = null;
      status.percent = 0;
      try {
        const device = await detect();
        const e = await load({
          device,
          onProgress: (p) => {
            status.percent = p.percent;
          },
        });
        status.state = 'ready';
        status.percent = 100;
        status.device = e.device;
        status.dtype = e.dtype;
        status.vision = e.vision;
        embedder = e;
        return e;
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

  return {
    status(): EmbedderStatus {
      return { ...status };
    },
    async embed(input: { text: string | null; image: string | null }): Promise<{ vector: number[] | null; ms: number }> {
      const e = await ensure();
      const t0 = performance.now();
      try {
        const v = await e.embed(input);
        const ms = performance.now() - t0;
        if (v) {
          status.embeds++;
          latencies.push(ms);
          if (latencies.length > LATENCY_WINDOW) latencies.shift();
          const sorted = [...latencies].sort((a, b) => a - b);
          status.medianMs = percentile(sorted, 0.5);
          status.p95Ms = percentile(sorted, 0.95);
        } else {
          status.failed++;
        }
        return { vector: v ? Array.from(v) : null, ms };
      } catch (err) {
        status.failed++;
        throw err;
      }
    },
    /** Starts the download/load without an item (onboarding's "Download now"); resolves with the status. */
    async warm(): Promise<EmbedderStatus> {
      try {
        await ensure();
      } catch {
        // the failure is in status.error
      }
      return { ...status };
    },
    async unload(): Promise<EmbedderStatus> {
      const e = embedder;
      embedder = null;
      if (e) {
        await e.dispose();
        status.state = 'unloaded';
      }
      return { ...status };
    },
  };
}

export type ModelHost = ReturnType<typeof createModelHost>;
