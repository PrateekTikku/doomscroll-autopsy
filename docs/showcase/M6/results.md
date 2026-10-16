# M6 results

## What was measured (`probe:m6`, replayed personas, real extension + bundled model)
- **G1 (spike):** the bundled 270M loads in the offscreen document from `chrome-extension://` files and reproduces T2's browser output byte for byte on 6 prompts; model load 2.7 s; median 116 tokens/s.
- **Naming:** 42 of 53 persona territories named by the model; the 11 others had under one minute of activity and kept their baseline name (no model failure: 0 fallbacks after validation). All 42 suggested labels matched the persona's ground truth. See `naming-examples.md`.
- **Autopsies:** 23 replayed persona days (developer 8, five other personas 3 each): **15 written by the model, 8 by the template (34.8% fallback)**. Refusal codes over both attempts: `nudge_state_wrong` 18, `word_count` 6, `invented_trigger` 4, `ungrounded_number` 1. Median 5.0 s per autopsy including a possible regeneration; the model unloads after use. See `autopsy-vs-template.md`, `fallback-rate.json`.
- **Contract tests:** the student prompt matches 50 real training prompts byte for byte; the TypeScript validators give identical results to the Python ones on 660 variants of the real eval set (including mutated ones).

## Honest caveats
- Facts and territories are replayed synthetic days, not the owner's real browsing; the fallback rate on real data may differ (T2's strict-clean rate on its eval set was 70%, i.e. a ≈ 30% expected fallback, consistent with 35% here).
- The most common refusal is the model mis-stating nudge outcomes (K-07/K-24); that is a training-data issue (K-08), not a validator problem, and is why the template fallback exists.
- The model is bundled (not downloaded) until the owner publishes it (D-58); the unpacked extension is ≈ 390 MB.
- Memory with the embedder and the writer resident together is unmeasured (K-09).
