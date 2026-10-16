# Spike results

Day-one spikes from PDD section 14. Each milestone fills in **only its own section** (so parallel chats don't collide): result (pass / fail), numbers, what was tried, and the fallback taken.

## S0 — Toolchain (M0)
**Result:** pass (2026-10-15). WXT 0.21.4 + Vite 8.3.4 + Preact 11.0.1 + `@preact/preset-vite` 2.10.6 + TypeScript 7.0.2 build and type-check; Vitest 5.0.4 with `wxt/testing` and `fake-indexeddb` runs. The build loads in headless Chrome (`npm run smoke`) with no exceptions; the service worker creates the offscreen document and it answers a ping.

## S1 — Item detection on feed sites (M1)
**Result:** headless part passes (2026-10-15). The owner approved the M1 review the same day; per-site counts for logged-in Instagram, X and Reddit were not recorded (see below).

`npm run probe:s1` loads the extension into headless Chrome 155 (1440×900, dev mode on). Each site gets 20 scrolls, one every 2.5 s (mouse wheel 650 px; ArrowDown on Shorts). It counts the `item` events the observer emitted. Raw data: `docs/showcase/M1/s1-probe.json`.

| Site | Items / scroll | Key types | Visual | Scroll handler p95 | Item detection p95 (max) |
|---|---|---|---|---|---|
| YouTube Shorts | 22 / 20 (1.10) | 21 URL (`/shorts/<id>`), 1 text (before the redirect) | 21 | 0.5 ms | 0.9 ms (1.6) |
| Mastodon public feed (X-like cards) | 20 / 20 (1.00) | 13 text, 5 media, 2 viewport | 2 | 0.3 ms | 0.9 ms (1.5) |
| Bluesky profile feed (X-like cards) | 22 / 20 (1.10) | 16 text, 6 media | 2 | 0.2 ms | 2.7 ms (3.5) |
| MDN docs (docs site) | 19 / 20 (0.95) | 15 viewport fallback, 4 text | 0 | 0.2 ms | 2.1 ms (3.0) |
| Wikipedia article | 17 / 20 (0.85), 14 distinct | 17 text (article sections) | 0 | 0.2 ms | 0.9 ms (2.2) |
| Reddit | not testable headless | "Prove your humanity" wall | — | — | — |

Findings:
- **Identity on Shorts works through the URL rule** (V-12 for Shorts). Every short got its own `u:` key, and video events fired (60 for 20 shorts).
- **Card feeds with no site-specific code:** generic detection found one item per scroll on Mastodon and Bluesky. Media keys (`m:`) appear for image or video posts.
- **Docs:** MDN has no card structure in view, so the viewport fallback (≥ 60% of the visible text blocks changed) produced 0.95 samples per scroll. On Wikipedia some sections are taller than one scroll, so the same section stays in view (14 distinct of 17). That's correct behaviour rather than a miss, but it sits under the 0.9 bar.
- **Cost:** the scroll handler itself has p95 ≤ 0.5 ms on every site, inside the PDD 9.9 budget of < 2 ms per scroll event. Item detection runs outside the scroll handler, at most every 250 ms, with p95 0.9–2.7 ms. Reading item text (`innerText`, which forces layout) is deferred to an idle callback (p95 ≤ 1.8 ms).
- **`isVisual`:** a portrait Short covers only about 25% of a landscape viewport, so the PDD 7.2 rule (≥ 50% of the viewport) would never fire on desktop. It was extended so that media filling ≥ 60% of the viewport height and ≥ 15% of its area also counts.
- **Privacy checks in the same run** (all pass):
  - A blocklisted site (`example.com`, added via settings) produced 0 events.
  - A paused page produced 0 events and 0 samples, and the badge showed `II`.
  - Of 553 stored records: 0 with `?` or `#` in a URL, 0 with a `text` field, 0 of 167 page-text lines found outside titles.
  - A tab opened *before* install was injected and observed.
- **Fallbacks used:** none needed. Pages with no card structure use the PDD's viewport fallback by design.

**Not yet recorded (owner, ~10 min):** item counts on Instagram (feed and Reels, V-12), X (home timeline) and Reddit (feed). They need a login, and Reddit walls headless Chrome. How to check: dashboard → Developer → dev mode on, then count `[doomscroll] item …` lines in the page's DevTools console over ~10 scrolls (about one per scroll is a pass; Reels keys should be `u:`). Tracked as K-04.

## S2 — EmbeddingGemma 2 text + vision in the extension (M2)
**Result: pass** (2026-10-15, M4 Max, Chrome 155 headless, Transformers.js 4.3.1, ORT Web 1.31 dev). Also resolves V-01, V-02, V-03, V-07. Raw JSON: `docs/showcase/M2/s2-*.json`; harness `entrypoints/spike` (`npm run build:spike`), driver `npm run probe:s2`.

| Config | Load (first, incl. ~255 MB download) | Text median / p95 | Image median / p95 | Text + image median | NaN | Peak RSS (all Chrome procs; baseline ~940) |
|---|---|---|---|---|---|---|
| **q4f16, WebGPU** (chosen) | 35 s | **16 ms** / 56 ms | **213 ms** / 225 ms | 216 ms | 0 / 60 | 2,280 MB (≈ +1.3 GB) |
| q4, WebGPU | 40 s | 17 ms / 53 ms | 358 ms / 366 ms | 353 ms | 0 / 60 | 2,259 MB |
| q4f16 or q8, WASM (CPU) | fails: no `GatherBlockQuantized` kernel on the CPU provider | | | | | |

- **V-01 (host):** WebGPU works in an extension page; the offscreen document is the host (no service-worker attempt needed, S2 passed there). `shader-f16` is available, so q4f16 works.
- **V-02 (vision API):** `AutoProcessor` + `AutoModel`, config with `audio_config = null`. The model takes text and image **interleaved in one pass**: text with `<|image|>` and `images = [[RawImage]]` → one `sentence_embedding`. No averaging fallback needed. Text-only skips the vision encoder's compute but it stays loaded.
- **V-03 (prefix):** `task: clustering | query: {text}` for samples, from `config_sentence_transformers.json` at the pinned revision; prefixes apply to text only.
- **V-07:** `chrome.offscreen` accepts `reasons: ['WORKERS']` for the ML host.
- **Sanity:** same-topic cosine 0.993 vs different-topic 0.746 at 256d.
- **Pinned revision (D-26):** `onnx-community/embeddinggemma-2-ONNX@daa72c51243991dfcaf9f9137d2c573d8f7790c0`; files used: `model_q4f16` and `vision_encoder_q4f16` (+ `.onnx_data`), ≈ 255 MB.
- **Findings:** (1) Transformers.js loads the ORT wasm from jsDelivr by default; the extension serves it from `/ort/` instead (`scripts/copy-ort.mjs`), so Hugging Face is the only network host. (2) Without WebGPU there is no usable path (quantized models need GPU kernels); the product reports "unavailable" and samples stay vectorless. (3) Images cost ~13x text (213 ms vs 16 ms); at ≤ 1 capture per 3 s that is ≤ 7% duty.
- **Budget (PDD 9.9):** median embed < 300 ms ✅ (16 ms text, 213 ms image); memory < 1.5 GB ✅ for the model page (≈ +1.3 GB over an idle headless Chrome; whole-browser RSS in the owner's profile still to be read in Activity Monitor); observer cost unchanged (M1).

## S3 — Transformers.js + TF.js WebGPU in one context (M2)
**Result: pass** (2026-10-15). In the same page, with EmbeddingGemma 2 already on WebGPU: `@tensorflow/tfjs` 4.x with `tfjs-backend-webgpu` initialised (`backend: webgpu`), trained a 2-layer dense net for 10 epochs on synthetic data in 765 ms (loss 0.71 → 0.57), and Transformers.js still produced a finite embedding afterwards. The GRU (M8) can use the TF.js WebGPU backend. TF.js is a dev dependency used only by the spike harness; it is not in the production bundle.

## S4 — Teacher throughput (T1)
**Result:** pass with MTP (2026-10-15): **17.1 tok/s** single stream with the separate MTP drafter, against 10.1 without it and a bar of 15. Also resolves V-04. Details: `docs/showcase/T1/s4-throughput*.md`.

| Server | Config | Aggregate tok/s |
|---|---|---|
| Unsloth Studio (`unsloth run`) | no MTP, concurrency 1 / 2 / 4 | 6.4 / 5.1 / 6.8 |
| raw `llama-server` | no MTP, `-np 4`, concurrency 1 / 2 / 4 | 10.1 / 7.9 / 10.9 |
| raw `llama-server` | **MTP, `--spec-draft-n-max 3`, `-np 1`** | **17.1** (draft acceptance 0.62-0.82) |
| raw `llama-server` | MTP, `--spec-draft-n-max 4`, `-np 1` | 13.9 |

- Measured on 4 naming + 4 autopsy prompts; tok/s is streamed chunks per second (the server reports zero usage), a lower bound. Validators passed on all teacher outputs in the MTP run. Another chat was running browser probes on the same machine (noise).
- **Why MTP did not work at first (two causes):**
  1. **The UD-Q4_K_XL GGUF has no MTP layers** (`model doesn't contain MTP layers`). The drafter is a separate file in the same repo: `MTP/mtp-gemma-4-31B-it-Q8_0.gguf` (515 MB, mirrored at the repo root as `mtp-gemma-4-31B-it.gguf`). Unsloth's docs say "embedded" because `llama-server -hf <repo>` auto-downloads that sibling; downloading only the quant file from the cache (as Studio's UI did here) leaves it behind. Fix: download the drafter and pass `--model-draft` (`-md`) with `--spec-type draft-mtp`.
  2. **The installed Studio never enables MTP.** Its backend (`studio/backend/core/inference/llama_cpp.py`) only knows `ngram-simple`, `ngram-mod` and `--spec-default`, defaults `speculative_type` to None, and skips speculation entirely when a vision projector (`--mmproj`) is loaded, which it does for this repo. `unsloth run` therefore launched llama-server with neither a drafter nor `--spec-type`. (A newer Studio may differ; `unsloth studio update` was not tried.)
- **Studio fixed (2026-10-15):** `unsloth studio update` reported "2026.5.2 -> 2026.10.5 available, updating" but silently stayed on 2026.5.2: the `constraints.txt` shipped inside the old install pins `transformers==4.57.6`, while `unsloth-zoo` 2026.10.5 needs `transformers>=5` via `mlx-lm`, so the resolver kept the old release. Fix used: `uv pip install --python ~/.unsloth/studio/unsloth_studio/bin/python --no-deps unsloth==2026.10.5 unsloth-zoo==2026.10.5` (rollback: same command with `unsloth==2026.5.2 unsloth-zoo==2026.5.1`; pre-change freeze saved at `training/data/studio-freeze-before.txt`). The new Studio auto-downloads the drafter (`mtp-gemma-4-31B-it.gguf`, 515 MB, into the HF cache) and launches llama-server with `--model-draft` and `draft-mtp` (chained with ngram-mod) with no flags needed. **Result: 17.2 tok/s at concurrency 1, 17.3 at 4**, same as raw `llama-server`; `chat_template_kwargs: {"enable_thinking": false}` still works per request. `uv pip check` shows leftover incompatibilities (the MLX/openenv/mlx-audio extras want transformers 5 / newer `mlx`); they affect MLX training in Studio, not inference, and were not touched. Re-verify Studio training in T2/S5 before relying on it.
- **Parallel slots give no aggregate gain** (decode is compute-bound); use `-np 1` with MTP.
- **Working command:** `llama-server -m <UD-Q4_K_XL.gguf> --model-draft <mtp-...-Q8_0.gguf> --spec-type draft-mtp --spec-draft-n-max 3 -np 1 -c 8192 --flash-attn on --jinja --chat-template-kwargs '{"enable_thinking": false}'` (llama.cpp build d812350, after the 2026-06-07 MTP merge).
- **Projection:** ~70 s per 4+4 examples, so ~1,000 examples take ~2.5-3 h including retries.

## S5 — Unsloth fine-tune + ONNX conversion on this Mac (T2)
**Result: pass** (2026-10-15/16). Resolves V-05 and V-06. Scripted Unsloth trains Gemma 3 270M on this Mac, and the merged model converts to an ONNX of **324 MB** that generates valid JSON and autopsies in a plain Transformers.js page on WebGPU at **~118 tok/s**. Full write-up and build sweep: `docs/showcase/T2/s5-notes.md`.

- **Training (V-05):** `unsloth train --model unsloth/gemma-3-270m-it --local-dataset <jsonl of {messages}> --format-type auto --training-type lora --max-seq-length 2048 --no-load-in-4bit --num-epochs 3 --batch-size 4 --lora-r 16 --lora-alpha 32 --train-on-completions` ran with the Unsloth Studio 2026.10.5 install (MLX backend; Studio's own venv). 50-step toy run: **25 s**, peak 2.1 GB. Full run: 732 steps, about 15 min. The adapter is in MLX format, so `unsloth export <ckpt> <dir> -f merged-16bit` is needed for HF safetensors (it writes under `~/.unsloth/studio/exports/<dir>`, not the given path).
- **Export (V-06), two routes:**
  1. optimum + our own fp16 fixes (622 MB, ~21 tok/s). **Gemma 3 breaks a naive fp16 conversion** (all-pad output): the fp16 converter rewrites the explicit fp32 casts around each RMSNorm so `x^2` overflows, and the residual stream exceeds 65,504 from layer 7 on. Fix: keep norms and residual adds in fp32, collapse cast pairs, quantise after fp16.
  2. **onnxruntime-genai builder (shipped).** The published 273 MB `onnx-community/gemma-3-270m-it-ONNX` file is built this way (fused `GroupQueryAttention`, 4-bit table stored twice). On our merged model: `-p int8 -e webgpu`, plus a patched copy of the builder (transformers 5 imports, null `rope_scaling`), the KV head dim pinned to 256, and a graph edit that replaces the fp16 vocabulary lookup with a `GatherBlockQuantized` over the 8-bit output-layer copy (654 MB to 324 MB). Everything is in `training/export_onnx.py` (default `--builder genai`).
- **Browser check:** `node training/onnx_test/run.mjs <model_dir>` (headless Chrome, `--enable-unsafe-webgpu`, Transformers.js 4.3.1 from `extension/node_modules`, served over 127.0.0.1; `DTYPE=fp16`). Load 1.2 s; median **118 tok/s** (83 to 156) over all 100 eval prompts; greedy output is deterministic (identical text on a rebuild).
- **Size:** 324 MB vs the PDD's 273 MB (the base model at 4 bits). Every 4-bit build of the fine-tune lost too much quality (naming valid 20 to 85%, autopsy grounded 40 to 52%), so the shipped model keeps 8-bit weights. Total with EmbeddingGemma is about 580 MB, not 530 MB.
- **Chat template:** Transformers.js reads `tokenizer_config.json`, not `chat_template.jinja`; the export script embeds the template. `config.json` also needs `transformers.js_config.kv_cache_dtype = float16` (the export script adds it).

## C1 — Cost of k selection + clustering (M3)
**Result: pass** (2026-10-16). `extension/scripts/c1-bench.ts` (run with `npx tsx scripts/c1-bench.ts <N>`) fits `fitClusters` (choose k over 4..30 on a ≤ 1,200-point subsample, then a 3-restart k-means on all points, plus an exact silhouette) on N synthetic 256d unit vectors in 14 planted, noisy clusters, on the M4 Max in Node:

| N | chosen k (planted 14) | silhouette | time |
|---|---|---|---|
| 1,498 | 14 | 0.52 | 1.4 s |
| 2,996 | 14 | 0.45 | 1.6 s |
| 6,006 | 13 | 0.48 | 1.7 s |

Pass bar was < 10 s at 6,000 vectors. Cost is dominated by the k selection on the fixed-size subsample, so it barely grows with N. Two choices made it cheap: (1) k is chosen on a subsample, and only the final fit sees all points; (2) the silhouette is exact but O(n·k·d) instead of O(n²·d): for unit vectors with cosine distance, the sum of distances from x to a cluster C is |C| − x·S_C (S_C = sum of C's vectors), so no pairwise matrix is needed. The service worker runs it (the plan's offscreen fallback was not needed); a real-browser timing comes from the probe below.
