# M2 results: EmbeddingGemma 2 in the browser

Measured 2026-10-15 on an Apple M4 Max (64 GB), headless Chrome 155, Transformers.js 4.3.1, WebGPU. Raw data: `s2-*.json`, `m2-probe.json`.

## S2: latency by dtype (WebGPU, offscreen-style extension page)
| dtype | Download | Text median / p95 | Image median / p95 | Text + image median | NaN |
|---|---|---|---|---|---|
| **q4f16** (shipped) | ~255 MB | **16 ms** / 56 ms | **213 ms** / 225 ms | 216 ms | 0 of 60 |
| q4 | ~280 MB | 17 ms / 53 ms | 358 ms / 366 ms | 353 ms | 0 of 60 |
| q4f16 / q8 on WASM | n/a | the CPU provider has no kernel for the 4-bit embedding gather; the model can't start | | | |

Same-topic cosine 0.993 vs different-topic 0.746 (256d). Budget (PDD 9.9): median < 300 ms met for both modalities.

## S3: TF.js WebGPU next to Transformers.js
Both load in one page; a tiny dense net trains 10 epochs in 765 ms (loss 0.71 → 0.57); embeddings still work afterwards.

## End to end: observer → embed queue → vector on the sample
Scripted browsing (YouTube Shorts, MDN, Wikipedia; 20 scrolls each), dev mode on (768d stored):

| | |
|---|---|
| Samples | 59 |
| With a vector | 55 (93%); all finite and unit length |
| Without | 4, skipped on purpose by the 20 embeds/min cap (the scripted scroll is ~40 items/min) |
| Embed latency in the live pipeline | median 49 ms, p95 236 ms (mix of text and screenshots) |
| Stored records with item text / query strings | 0 / 0 (85 page-text lines checked) |

Before the title fallback was added, 22% of samples had nothing to embed (fast Shorts items with no text and no screenshot slot, plus empty-text pages); using the item's title as text when the body text is empty removed that.
