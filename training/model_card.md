---
license: gemma
base_model: google/gemma-3-270m-it
library_name: transformers.js
pipeline_tag: text-generation
tags: [gemma, gemma3, onnx, transformers.js, webgpu, fine-tune, unsloth, hf26challenge]
language: [en]
---

# doomscroll-autopsy-gemma-3-270m (ONNX)

> **DRAFT. Not published.** Publishing needs the owner's explicit yes. Fill the `TODO` markers first.

A fine-tune of **Gemma 3 270M (instruction-tuned)** for two narrow tasks inside the *Doomscroll Autopsy*
browser extension, running fully in the browser through Transformers.js on WebGPU:

1. **Territory naming:** a description of a group of browsing items (origins, titles, velocity) in,
   `{"name", "suggested_label": "deep|shallow|drain", "why"}` out.
2. **Autopsy:** a day's deterministic `facts` JSON in, a 120-180-word write-up in a calm, factual coach voice out.
   The model only phrases numbers it is given; the extension validates every number and falls back to a
   template if the check fails.

**This is a Gemma derivative.** Gemma is provided under and subject to the Gemma Terms of Use at
<https://ai.google.dev/gemma/terms>, which also incorporate the Gemma Prohibited Use Policy
(<https://ai.google.dev/gemma/prohibited_use_policy>). Use of this model, and of any model derived from it,
is subject to those terms and restrictions, and anyone you redistribute it to must be given a copy of them.
TODO(owner, before publishing): add the full text of the Gemma Terms of Use as `GEMMA_TERMS.md` in this repo
and keep the notice "Gemma is provided under and subject to the Gemma Terms of Use found at
ai.google.dev/gemma/terms".

## Training data

About 1,000 **synthetic** examples (973 train / 100 held out): 660 naming and 440 autopsy inputs generated
programmatically for six Deep Worker personas (developer, writer, researcher, designer, student, freelancer),
and outputs written by **Gemma 4 31B** (UD-Q4_K_XL, non-thinking) in the coach voice, then filtered by
validators (valid JSON, length, number grounding, no mention of time outside the browser, tone, structure).
No real browsing data was used.

## Training

LoRA (r 16, alpha 32, lr 2e-4, 3 epochs, batch 4, max length 2048, loss on completions only) with Unsloth on
an Apple M4 Max (MLX backend), then merged into the base weights. Final loss about 0.25.

## Evaluation

100 held-out synthetic examples (60 naming, 40 autopsy), greedy decoding, run as the shipped ONNX in
Transformers.js on WebGPU. Judge: Gemma 4 31B, blind, 1-5 on faithfulness, structure and voice
(the judge is the family that wrote the training data, so scores are biased upward).

| | Naming valid JSON / grounded | Autopsy grounded / clean | Judge mean (naming / autopsy) |
|---|---|---|---|
| Template / name-only baseline | name only | 100% / 0% (too short) | 2.92 / 4.30 |
| Gemma 3 270M, no fine-tune | 0% / 0% | 38% / 0% | 2.53 / 1.07 |
| **This model (8-bit ONNX)** | **97% / 97%** | **92% / 88%** | **4.99 / 4.51** |
| Teacher (Gemma 4 31B) | 100% / 100% | 100% / 100% | 5.00 / 4.93 |

**Retrain (T3, the version bundled with the extension: `run3`).** The table above is the first fine-tune
(`run1`). `run3` uses the same recipe on corrected data: the 32 autopsies the strict checks flag were dropped,
the nudge paragraph was rewritten from the facts and varied (160 variants with real-use nudge states), and texts
over 172 words were dropped. On the same 100 held-out prompts plus 40 ignored-heavy nudge prompts (automatic
metrics only; the judge was not re-run): naming valid / grounded / label correct 100% / 100% / 100% (run1:
97% / 97% / 95%); autopsy grounded 100% (92%); strict-clean on the nudge-heavy prompts 95% (60%); outside-browser
mentions 0. Details: `docs/showcase/T3/results.md`.

No output mentioned time outside the browser. On autopsy the model writes better prose than a fill-in
template but is less faithful (4.45 vs 5.0): it sometimes attaches a real number to the wrong thing (swapped
nudge counts, a wrong-direction change against the 7-day average, an invented trigger). Validate its output
and fall back to a template. 4-bit builds were clearly worse (autopsy grounding 40-52%).

## Files and use

- `onnx/model_fp16.onnx` + `onnx/model_fp16.onnx_data`: 8-bit weights (MatMulNBits, block 32), fp16 activations,
  one shared 8-bit vocabulary table, 324 MB, about 118 tok/s on an M4 Max. Load with `dtype: "fp16"`
  (`config.json` carries `transformers.js_config.kv_cache_dtype`). Use greedy decoding, chat template on a single user turn, `max_new_tokens` 120 (naming) /
  400 (autopsy).
- Built with onnxruntime-genai's model builder (fused GroupQueryAttention). 4-bit quantisation measurably
  lowered quality on our evaluation and is not shipped.

```js
import { AutoTokenizer, AutoModelForCausalLM } from '@huggingface/transformers';
const tok = await AutoTokenizer.from_pretrained(REPO);
const model = await AutoModelForCausalLM.from_pretrained(REPO, { dtype: 'fp16', device: 'webgpu' });
```

## Limitations

Trained on synthetic data in one voice; real titles are messier. About 8% of the training autopsies (and 14% of their 7-day comparisons) state the direction of the change the wrong way round, and the model reproduces this. Evaluated on 100 examples, judged by the
model family that wrote the training data (self-preference bias). English only. Not for any use outside
the extension's two tasks.
