# M5 results

## What was measured
- **Unit tests:** 346 pass in 40 files (`cd extension && npm test`), 107 of them new in M5: deep-block edge cases (2:00 vs 2:30 interruptions, 24:30 vs 25:00, away/idle/unobserved gaps pausing the clock, a 45-minute gap ending a block, a block across midnight), residue, allowance overage, nudge outcomes, 7-day comparison direction, schema validation (Ajv), template autopsy fuzz (600 random facts: always 120-180 words, zero validator errors), validator planted errors, forget cascade, wipe, retention, blocklist editing, nightly job, wording scan (40 checks).
- **Headless end-to-end** (`npm run probe:m5`, `m5-probe.json`): an 8-day replayed developer history seeded into the real extension DB; the dashboard renders four tiles, 21 text labels, 39 timeline segments, 2 deep-block outlines, a velocity line, 8 days in the history picker; the autopsy is stored as a 133-word template report; today compares with 7 earlier days and the oldest day does not; popup shows the four focus metrics; forget (last hour; a whole day with its report; a site with always-skip) works; blocklist editor and retention persist; wipe empties all stores, the model cache and the settings; 0 page exceptions; no wording about time outside the browser.
- **Template autopsy on six personas:** `persona-days.md`, `facts-*.json`, `autopsy-*.md` (8 replayed days each, seed 1).

## Honest caveats
- Everything above uses replayed synthetic days or fixtures, not the owner's real browsing; the timeline and metrics on real data are for the owner to look at (CAPTURE.md).
- Bin territories lag up to a minute (K-16); the dashboard runs a sync before computing today's numbers, but today's last minute can still move.
- `chrome.idle` uses a 120 s threshold (K-06), so up to 2 minutes at the start of an idle stretch counts as browsing.
- The 30-minute gap rule (D-55) is our choice, not a PDD number.
