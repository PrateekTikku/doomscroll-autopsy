import { browser } from 'wxt/browser';
import { GEN_DTYPE, GEN_SOURCE, RETRY_SAMPLING } from './config';

/**
 * The writer model through Transformers.js (PDD 9.4/9.8), in the offscreen document next to the
 * embedder. The settings are exactly those T2 evaluated: the chat template on a single user turn,
 * `dtype: fp16` (8-bit weights, fp16 activations), WebGPU.
 */
export interface GenOptions {
  prompt: string;
  maxNewTokens: number;
  /** Sampled decoding for the retry; greedy otherwise. */
  sample: boolean;
}

export interface GenResult {
  text: string;
  newTokens: number;
  ms: number;
}

export interface Generator {
  readonly device: string;
  generate(opts: GenOptions): Promise<GenResult>;
  dispose(): Promise<void>;
}

export async function loadGenerator(onProgress?: (percent: number) => void, device: 'webgpu' | 'wasm' = 'webgpu'): Promise<Generator> {
  const tf = await import('@huggingface/transformers');
  const { env, AutoTokenizer, AutoModelForCausalLM } = tf;

  // The ONNX runtime files come from the extension (never a CDN).
  const ort = (f: string) => browser.runtime.getURL(`/ort/${f}` as never);
  env.backends.onnx.wasm!.wasmPaths = { mjs: ort('ort-wasm-simd-threaded.asyncify.mjs'), wasm: ort('ort-wasm-simd-threaded.asyncify.wasm') };

  let id: string;
  const extra: Record<string, unknown> = {};
  if (GEN_SOURCE.kind === 'bundled') {
    id = GEN_SOURCE.path;
    env.allowLocalModels = true;
    env.localModelPath = browser.runtime.getURL('/models/' as never);
    extra.local_files_only = true;
  } else {
    id = GEN_SOURCE.repo;
    extra.revision = GEN_SOURCE.revision;
    env.useBrowserCache = true;
  }

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (e: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!onProgress || !e.file || (e.status !== 'progress' && e.status !== 'done')) return;
    const prev = files.get(e.file);
    const total = e.total ?? prev?.total ?? 0;
    files.set(e.file, { loaded: e.status === 'done' ? total : (e.loaded ?? 0), total });
    let loaded = 0;
    let all = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      all += f.total;
    }
    onProgress(all ? Math.min(100, (loaded / all) * 100) : 0);
  };

  const tokenizer = await AutoTokenizer.from_pretrained(id, extra as never);
  const model = await AutoModelForCausalLM.from_pretrained(id, { ...extra, dtype: GEN_DTYPE, device, progress_callback } as never);

  return {
    device,
    async generate({ prompt, maxNewTokens, sample }) {
      const chat = tokenizer.apply_chat_template([{ role: 'user', content: prompt }], { add_generation_prompt: true, tokenize: false }) as string;
      const inputs = tokenizer(chat, { return_tensor: true, add_special_tokens: false } as never) as { input_ids: { dims: number[] } };
      const t0 = performance.now();
      const ids = (await (model as unknown as { generate(o: unknown): Promise<{ slice(...a: unknown[]): { dims: number[] } }> }).generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        ...(sample ? { do_sample: true, ...RETRY_SAMPLING } : { do_sample: false }),
      }));
      const ms = performance.now() - t0;
      const inLen = inputs.input_ids.dims[1]!;
      const newIds = ids.slice(null, [inLen, null]);
      const text = (tokenizer as unknown as { batch_decode(t: unknown, o: unknown): string[] }).batch_decode(newIds, { skip_special_tokens: true })[0] ?? '';
      return { text, newTokens: newIds.dims[1] ?? 0, ms };
    },
    async dispose() {
      await (model as unknown as { dispose?: () => Promise<unknown> }).dispose?.();
    },
  };
}
