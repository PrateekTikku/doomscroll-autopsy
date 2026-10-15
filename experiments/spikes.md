# Spike results

Day-one spikes from PDD section 14. Each milestone fills in **only its own section** (so parallel chats don't collide): result (pass / fail), numbers, what was tried, and the fallback taken.

## S0 — Toolchain (M0)
**Result:** pass (2026-10-15). WXT 0.21.4 + Vite 8.3.4 + Preact 11.0.1 + `@preact/preset-vite` 2.10.6 + TypeScript 7.0.2 build and type-check; Vitest 5.0.4 with `wxt/testing` and `fake-indexeddb` runs. The build loads in headless Chrome (`npm run smoke`) with no exceptions; the service worker creates the offscreen document and it answers a ping.

## S1 — Item detection on feed sites (M1)
_Not run yet._

## S2 — EmbeddingGemma 2 text + vision in the extension (M2)
_Not run yet._ Also resolves V-01, V-02, V-03, V-07.

## S3 — Transformers.js + TF.js WebGPU in one context (M2)
_Not run yet._

## S4 — Teacher throughput (T1)
_Not run yet._ Also resolves V-04.

## S5 — Unsloth fine-tune + ONNX conversion on this Mac (T2)
_Not run yet._ Also resolves V-05, V-06.
