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
_Not run yet._ Also resolves V-01, V-02, V-03, V-07.

## S3 — Transformers.js + TF.js WebGPU in one context (M2)
_Not run yet._

## S4 — Teacher throughput (T1)
_Not run yet._ Also resolves V-04.

## S5 — Unsloth fine-tune + ONNX conversion on this Mac (T2)
_Not run yet._ Also resolves V-05, V-06.
