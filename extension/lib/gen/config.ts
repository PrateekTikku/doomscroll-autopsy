/**
 * Where the fine-tuned Gemma 3 270M comes from (PDD 9.4, 10.5, D-58). The model is not on Hugging
 * Face yet (publishing needs the owner's explicit yes), so it is bundled with the extension at build
 * time (`scripts/copy-model.mjs`). When it is published, switch `GEN_SOURCE` to the `hf` form with the
 * repo and the pinned commit; nothing else changes.
 */
export type GenSource = { kind: 'bundled'; path: string } | { kind: 'hf'; repo: string; revision: string };

export const GEN_SOURCE: GenSource = { kind: 'bundled', path: 'doomscroll-270m' };

/** Recorded in `reports.modelVersion` and shown in the dashboard. */
export const GEN_MODEL_NAME = 'Gemma 3 270M (fine-tuned)';
export const GEN_MODEL_VERSION = 'doomscroll-gemma-3-270m run1 (fp16 activations, 8-bit weights)';

/** Exactly the evaluated settings (T2): chat template on one user turn, greedy decoding. */
export const GEN_DTYPE = 'fp16' as const;
export const MAX_NEW_TOKENS = { naming: 120, autopsy: 400 } as const;
/** Sampled retry (greedy decoding would repeat itself). */
export const RETRY_SAMPLING = { temperature: 0.7, top_k: 40 } as const;
/** The writer unloads this long after its last request (PDD 9.9). */
export const GEN_IDLE_UNLOAD_MS = 30_000;
