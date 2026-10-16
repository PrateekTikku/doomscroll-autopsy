# S5: can this Mac fine-tune Gemma 3 270M and ship it to the browser?

**Yes, in one afternoon. The first ONNX export worked but was big (622 MB) and slow (21 tok/s); switching export path made it 324 MB and 6x faster at the same quality.**

- **Training:** scripted `unsloth train` (Unsloth Studio 2026.10.5, MLX backend). 50-step toy run: 25 s, peak 2.1 GB. Full run: 973 examples, 3 epochs, 732 steps, batch 4, LoRA r16/alpha 32, lr 2e-4, about 15 minutes, peak 2.1 GB.
- **Merge:** `unsloth export ... -f merged-16bit` gives plain HF safetensors (the adapter is in MLX format).
- **Browser:** Transformers.js 4.3.1 on WebGPU, headless Chrome.

## Route 1: optimum + our own fp16 fixes (works, but 622 MB and ~21 tok/s)
`optimum-cli export onnx` then fp16 then weight-only quantisation. A naive fp16 conversion of Gemma 3 produces NaNs (all-pad output). Found by running every intermediate tensor through ONNX Runtime on CPU:
1. Explicit fp32 casts around each RMSNorm get rewritten to fp16, so `x^2` overflows.
2. The residual stream has values above 65,504 from layer 7 on.
3. Quantising after the fp16 conversion (not before) keeps MatMulNBits inputs consistent.
Fix: keep norms and residual adds in fp32, collapse the converter's cast pairs, quantise last. Still available as `export_onnx.py --builder optimum`.

## Route 2: onnxruntime-genai builder (shipped: 324 MB, ~118 tok/s)
The 273 MB `onnx-community/gemma-3-270m-it-ONNX` q4f16 file turned out to be built with onnxruntime-genai's model builder, not optimum. Its graph has a fused `GroupQueryAttention`, far fewer casts, `Clip` nodes against fp16 overflow and a 4-bit vocabulary table stored twice (84 MB each). Running the same builder on our merged model (`-p int8 -e webgpu`) gave the same quality as route 1 and 6x the speed. Three things were needed:
1. genai 0.18.0 imports model classes that only exist in transformers 5 and iterates `config.rope_scaling` (null for this model). `export_onnx.py` copies the builder to a temp dir and patches those two spots; the installed package is untouched.
2. The builder leaves the KV head size as a named dimension (`kv_cache_dim`) and Transformers.js then feeds 0 for it. Pinned to 256 in the graph.
3. For 8-bit the builder keeps the vocabulary table as a 336 MB fp16 `Gather` next to an 8-bit copy for the output layer (its table sharing only works for 4-bit). A graph edit swaps the lookup for `GatherBlockQuantized` over the 8-bit copy (explicit zero point 128): 654 MB to **324 MB**, identical eval results.

## Build sweep (all 100 held-out prompts, shipped runtime: Transformers.js on WebGPU)
| Build | Size | Naming valid | Autopsy grounded / clean | tok/s |
|---|---|---|---|---|
| optimum 8-bit (route 1) | 622 MB | 95% | 95% / 88% | 21 |
| optimum 4-bit symmetric, block 32 | 488 MB | 85% | 52% / 28% | 21 |
| genai 4-bit symmetric, shared table | 185 MB | 43% | 45% / 28% | 114 |
| genai 4-bit asymmetric (the published file's layout) | 524 MB | 20% | 40% / 25% | 113 |
| genai 8-bit as built | 654 MB | 97% | 95% / 88% | 126 |
| **genai 8-bit, shared 8-bit table (shipped)** | **324 MB** | **97%** | **92% / 88%** | **118** |

Earlier 30-prompt sweep on route 1 (4-bit variants): asymmetric block 16 gave 6/10 clean autopsies at 514 MB, asymmetric block 32 gave 2/10, leaving `lm_head` fp16 gave 1/10 at 731 MB, a 4-bit `GatherBlockQuantized` embedding table gave garbage on the toy model, and HQQ 4-bit did not load.

Takeaways for the post:
- **A 270M model does not survive plain 4-bit rounding; 8-bit is lossless on our eval.** Every 4-bit variant we built (two builders, symmetric and asymmetric) lost quality on the fine-tune. We did not run the control (the published base q4f16 on a task the base can do), so we cannot say whether 4-bit is inherently bad here or our recipes are.
- **The export path mattered more than the bit width for speed:** fused attention and fewer casts took generation from 21 to 118 tok/s with the same weights.
- **The embedding table is the size problem:** 168M of 268M parameters. Storing it once at 8 bits is what takes 654 MB to 324 MB.
- The published 273 MB is the base model at 4 bits; the 324 MB figure is 1.19x that, with fine-tune quality intact.
