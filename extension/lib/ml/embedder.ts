import { browser } from 'wxt/browser';

/**
 * EmbeddingGemma 2 through Transformers.js (PDD 9.1). Runs in the offscreen document.
 * Model card: https://huggingface.co/onnx-community/embeddinggemma-2-ONNX (revision pinned, D-26).
 */
export const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
export const MODEL_REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0';
/** Clustering prefix from the model card's config_sentence_transformers.json (V-03). Text only. */
export const CLUSTERING_PREFIX = 'task: clustering | query: ';
/** Max characters of item text sent to the model (≈ 400–500 tokens; PDD 9.1 says ≤ 512 tokens). */
export const MAX_TEXT_CHARS = 1500;

export type Dtype = 'q4f16' | 'q4' | 'q8' | 'fp16';
export type Device = 'webgpu' | 'wasm';

export interface DownloadProgress {
  /** 0–100, aggregated over all files seen so far. */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface EmbedderOptions {
  device?: Device;
  dtype?: Dtype;
  /** Load the vision encoder (≈ 98 MB at q4f16). Default true. */
  vision?: boolean;
  onProgress?: (p: DownloadProgress) => void;
}

export interface EmbedInput {
  text?: string | null;
  /** JPEG/PNG data URL, in memory only. */
  image?: string | null;
}

export interface Embedder {
  readonly device: Device;
  readonly dtype: Dtype;
  readonly vision: boolean;
  /** 768d, L2-normalised, or null if the output contained NaN/Infinity. */
  embed(input: EmbedInput): Promise<Float32Array | null>;
  dispose(): Promise<void>;
}

/** The exact string fed to the model for one input. Pure, so it can be tested. */
export function buildPrompt(input: EmbedInput): string {
  const text = (input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
  const parts = [text, input.image ? '<|image|>' : ''].filter(Boolean).join(' ');
  return `${CLUSTERING_PREFIX}${parts}`.trimEnd();
}

export async function loadEmbedder(opts: EmbedderOptions = {}): Promise<Embedder> {
  const device = opts.device ?? 'webgpu';
  const dtype = opts.dtype ?? 'q4f16';
  const vision = opts.vision ?? true;
  const tf = await import('@huggingface/transformers');
  const { env, AutoConfig, AutoModel, AutoProcessor, RawImage } = tf;

  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Load the ONNX runtime files from the extension, never from a CDN (privacy: only Hugging Face).
  const ort = (f: string) => browser.runtime.getURL(`/ort/${f}` as never);
  env.backends.onnx.wasm!.wasmPaths = {
    mjs: ort('ort-wasm-simd-threaded.asyncify.mjs'),
    wasm: ort('ort-wasm-simd-threaded.asyncify.wasm'),
  };

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (e: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!opts.onProgress || !e.file || (e.status !== 'progress' && e.status !== 'done')) return;
    const prev = files.get(e.file);
    const total = e.total ?? prev?.total ?? 0;
    files.set(e.file, { loaded: e.status === 'done' ? total : (e.loaded ?? 0), total });
    let loaded = 0;
    let all = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      all += f.total;
    }
    opts.onProgress({ percent: all ? Math.min(100, (loaded / all) * 100) : 0, loadedBytes: loaded, totalBytes: all });
  };

  const config = await AutoConfig.from_pretrained(MODEL_ID, { revision: MODEL_REVISION });
  const cfg = config as unknown as Record<string, unknown>;
  cfg.audio_config = null;
  if (!vision) cfg.vision_config = null;
  const processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: MODEL_REVISION });
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    revision: MODEL_REVISION,
    config,
    device,
    dtype: vision ? { model: dtype, vision_encoder: dtype } : { model: dtype },
    progress_callback,
  } as never);

  return {
    device,
    dtype,
    vision,
    async embed(input) {
      const prompt = buildPrompt(input);
      let inputs;
      if (input.image && vision) {
        const image = await RawImage.fromURL(input.image);
        inputs = await processor([prompt], [[image]] as never);
      } else {
        inputs = await processor([input.image && !vision ? prompt.replace('<|image|>', '').trimEnd() : prompt]);
      }
      const out = (await model(inputs)) as { sentence_embedding: { data: Float32Array; dispose?: () => void } };
      const data = Float32Array.from(out.sentence_embedding.data);
      out.sentence_embedding.dispose?.();
      for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i]!)) return null;
      return data;
    },
    async dispose() {
      await (model as unknown as { dispose?: () => Promise<unknown> }).dispose?.();
    },
  };
}
