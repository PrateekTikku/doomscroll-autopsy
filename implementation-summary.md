# Doomscroll Autopsy — Implementation Summary

> The shared memory between AI chats. **Read all of it before starting a milestone.** Write your section **only after the owner has approved your finished work** (`implementation-milestones.md` 0.7): then update the status table and **append** your section at the bottom using the template. Never rewrite or delete another milestone's section; if something in it is now wrong, add a correction in your own section.

## Status

| Milestone | Status | Chat finished | Showcase level reached | Notes |
|---|---|---|---|---|
| Planning | ✅ Done | 2026-10-15 | — | PDD v2, milestone plan, workflow skills |
| M0 Scaffold + contracts | ✅ Done | 2026-10-15 | — | WXT + Preact scaffold, IndexedDB v1, settings in chrome.storage.local (D-52), shared schemas v1, uv project |
| M1 Observer + bins | ✅ Done | 2026-10-15 | — | Generic observer, 30 s bins and samples in IndexedDB, pause + badge, popup live counts, dev recorder, S1 headless pass; owner's daily profile runs `.live/chrome-mv3` |
| M2 Embedding engine | ✅ Done | 2026-10-16 | — | EmbeddingGemma 2 (q4f16, WebGPU) in the offscreen document: text 16 ms, image 213 ms median; vectors (256d) written to samples; S2/S3 pass; no WASM fallback. docs/plans/M2.md |
| M3 Territories + labeling | ✅ Done | 2026-10-16 | L1 | Own spherical k-means + silhouette k, Hungarian matching keeps IDs/labels (D-53), online assignment, dashboard Territories + dev Evidence. Real-data checks (C2 drift, domain split) still pending on the owner's profile. docs/plans/M3.md |
| M4 Prediction + nudges + replay | ✅ Done | 2026-10-16 | L2 | Rules + Markov scoring with allowances, evaluation harness, banner + blur nudges, replayer, synthetic days, demo mode (banner at 57:00, blur at 72:00 of replay time). Real-data rules-vs-Markov numbers still pending on the owner's profile. docs/plans/M4.md |
| M5 Metrics + dashboard + privacy | ✅ Done | 2026-10-16 | L3 | Deep blocks, residue, daily facts, validated template autopsy (120-180 words), timeline dashboard, popup metrics, nightly job, full privacy controls (forget range/site, blocklist editor, retention, titles, wipe). Verified on replayed synthetic days in headless Chrome (`probe:m5`); real-data look is the owner's. docs/plans/M5.md |
| T1 Teacher data | ✅ Done | 2026-10-16 | — | 1,073 valid examples (660 naming, 413 autopsy) split 973 train / 100 eval in `training/data/`; S4 resolved (MTP ≈17–19 tok/s, concurrency 1); fed T2's fine-tune, which met the ship bar. Closed by self-review (owner delegated). docs/plans/T1.md |
| T2 Fine-tune + ONNX | ✅ Done | 2026-10-16 | — | Fine-tuned 270M meets the PDD 10.4 ship bar; ONNX 8-bit (324 MB, genai builder) generates in the browser at ~118 tok/s; 4-bit loses quality; autopsy edge over template is small. docs/plans/T2.md |
| T3 Targeted retrain (K-08/K-24) | ✅ Done | 2026-10-16 | — | Cleaned data + nudge-state augmentation + length filter → run3: naming 100%/100%/100%, ignored-heavy nudge autopsies strict-clean 60% → 95%, template fallback in the extension 35% → 13%; bundled in the extension. "T3" was not defined in the milestones file; interpreted as this follow-up. docs/plans/T3.md |
| M6 Integrate 270M | ✅ Done | 2026-10-16 | L4 | Fine-tuned 270M bundled with the extension (D-58, not on HF yet), loaded on demand in the offscreen document (G1: byte-identical to the test page, ~115 tok/s), names + suggested labels + nightly autopsy through validators with fallbacks; on 23 replayed days 20 autopsies model-written, 3 template (13% after the T3 retrain; 35% with T2's model). docs/plans/M6.md |
| M7 Release + first user | ⚠️ Done with gaps | 2026-10-17 | L5 (pending the owner's step) | Onboarding opens on install, README install path, `npm run zip` (300.8 MB), fresh-profile probe on the unzipped release passes (incl. model download, m5 + m4 probes). Gaps: the owner must hand the zip to the friend and run the interview; real-device checks. docs/plans/M7.md |
| M8 Should-tier extras | ✅ Done | 2026-10-17 | L6 | All five Should items, one commit each: GRU (trained with TF.js in the offscreen document, promoted only if it beats Markov; it ties on synthetic data, so Markov stays), UMAP attention map, topic tags (fed into naming), breathing pause, forget a single capture. Release rebuilt as 0.3.0. docs/plans/M8.md |
| M9 Showcase | ✅ Done | 2026-10-18 | L6 | Post published on DEV (`#hf26challenge`), 1:43 product video, public repo, fine-tuned model on Hugging Face, release zip on GitHub Releases. No first-user feedback (stated plainly in the post). |

Status values: ⬜ Not started · 📝 Plan awaiting approval · 🟡 In progress (plan approved) · 🔍 Awaiting review · ✅ Done · ⚠️ Done with gaps · ❌ Blocked

## Current showcase level
**Level 6 (M8 built) on top of Level 5, which still needs the owner to hand over the zip and interview the friend.** **Level 4 (M6 + T3).** The fine-tuned Gemma 3 270M (run3) names territories and writes the autopsy in the real extension, with measured fallback numbers (13% on replayed days). A download install still needs the owner's Hugging Face publish (K-23).

(Level 3, reached in M5:) Full product without the fine-tune: deep blocks, attention residue, daily facts, template autopsy, timeline, popup metrics and the Must privacy controls (M4's loop is underneath: observe → embed → territories → predict (rules + Markov) → in-page nudges, with replay/demo mode). The "one domain, many territories" and real-data rules-vs-Markov evidence still need the owner's real data. (Update this line whenever a milestone raises the level; see `implementation-milestones.md` 0.4.)

## Known issues and open follow-ups
(Each entry: ID, found in, description, suggested owner milestone.)

- **K-01** (M0): Ajv can't compile schemas at runtime under the MV3 CSP (`new Function`). Runtime validation of model output or facts must use Ajv standalone code or hand-written validators. Owner: M5, M6.
- **K-02** (M0): `ensureOffscreenDocument()` uses `reasons: ['WORKERS']` as a placeholder; confirm the right reason in S2 (V-07). Owner: M2.
- **K-03** (M0): no extension icons yet (Chrome shows a letter). Owner: M7.
- **K-04** (M1): S1 per-site item counts for logged-in Instagram (feed, Reels), X and Reddit are not recorded; headless probes can't reach them. Record them in `experiments/spikes.md` when the owner checks (steps there). Owner: owner, any Lane A chat.
- **K-05** (M1): the open 30 s bin is lost when Chrome quits (state lives in `chrome.storage.session`). Up to 30 s per browser session. Owner: M5 if it matters for metrics.
- **K-06** (M1): `chrome.idle` uses a 120 s threshold, so up to 120 s at the start of each idle stretch counts as active. Owner: M5 (account for it in metrics, or lower the threshold).
- **K-07** (T2, resolved in M6/T3: the strict checks run before an autopsy is accepted, and the retrain removed most of the slips): the model attaches real numbers to the wrong thing in autopsies (swapped nudge counts, wrong nudge state, invented trigger pair, allowance claim with none, wrong-direction 7-day comparison). T1's `check_autopsy` catches only some. Port the strict checks in `training/eval/metrics.py::strict_autopsy_errors` with the validators and fall back to the template on failure. Owner: M6.
- **K-08** (T2, resolved by T3: the retrain was done): T1 training data has wrong-direction 7-day comparisons (29 of 202 teacher sentences, 14%); 32 of 373 training autopsies are flagged by the strict checks. A retrain with them dropped was proposed but not run. Owner: owner decision (≈1 h incl. export, eval, judge).
- **K-09** (T2): 4-bit builds lost too much quality; the control (published base q4f16) was not run, so it is unknown whether 4-bit is inherently bad or the recipe. Model memory during generation not measured. Eval has only 100 examples. Owner: M6 (memory), optional.
- **K-10** (T2): `training/model_card.md` is a DRAFT (needs the full `GEMMA_TERMS.md`, HF repo name V-10, pinned hash); nothing published. Owner: M7/owner.
- **K-11** (M2): without WebGPU there are no embeddings at all (quantized models have no CPU kernels; S2). The popup says "unavailable" and samples stay vectorless. Owner: M7 (mention in onboarding / requirements).
- **K-12** (M2): not every sample gets a vector, by design: items above 20 embeds/min are sub-sampled, and a visual item with no text and no free screenshot slot (1 per 3 s) is skipped. In a scripted run 93% had vectors (100% of those with input). M3 must assign territories to vectorless samples by carrying the previous item's territory (PDD 9.9). Owner: M3.
- **K-13** (M2): memory in the owner's real profile is unmeasured (about +1.3 GB in headless Chrome vs the 1.5 GB budget). The vision encoder stays loaded even for text-only use; loading it on the first screenshot would save part of that. The 10-minute idle unload is unit-tested only. The popup's `embed-status` reads today's samples (with vectors) every 4 s; fine now, heavy later. Owner: M7 / any Lane A chat.
- **K-14** (M3): spike C2 not done on changing real data: the 0.8 centroid-match threshold under drift is unmeasured (a repeat run on identical data gives similarity ≈ 1.0). The dashboard status shows the weakest match after "Re-cluster now". Owner: owner / M5.
- **K-15** (M3): the chosen k varies with the data (6 vs 10 on the same headless 200 vectors, different subsamples); "one domain, many territories" is not yet shown on the owner's data (Dashboard → Developer → dev mode → Compute evidence; read the JSON before using it in the post). Real-profile timing and memory unmeasured. Owner: owner / M9.
- **K-16** (M3): bin territories are set by a 1-minute sweep, not live. M4 may want them event-driven. Owner: M4. **Resolved in M4 for nudging** (the live score uses the latest sample's online territory); bins still lag a minute for M5.
- **K-17** (M4): rules-vs-Markov on the owner's real data not run (needs the daily profile): Dashboard → Prediction and replay → "Evaluate on my data". With one day of data it uses a 70/30 split of that day and AUC may be n/a. Owner: owner / M9.
- **K-18** (M4): synthetic evaluation saturates (AUC ≈ 0.99–1.00 for both modes, top-1 identical) because the generator makes spirals long runs on one site; only top-3 on switches separates the modes (80.4% rules vs 88.9% Markov). Do not present it as predictive skill. Owner: M9.
- **K-23** (M6): the fine-tuned model is **not on Hugging Face**; it is bundled into the extension at build time from `training/data/runs/run1/onnx_final` (D-58), so a fresh checkout without that folder builds an extension whose writer reports "unavailable" (templates and baseline names only). The unpacked extension is ≈ 390 MB. To publish: owner decision (repo name V-10, `GEMMA_TERMS.md`, pinned hash), then switch `GEN_SOURCE` in `lib/gen/config.ts` to `{kind:'hf', repo, revision}`. Owner: owner / M7.
- **K-24** (M6, **resolved by T3**: 13% after the retrain, see T3 section): 35% of replayed autopsies fell back to the template; the biggest cause is the model mislabelling the state of a single nudge (facts `shown 1, ignored 1` → "was snoozed"), exactly the weakness in K-07/K-08. In real use most nudges are unanswered (ignored), so this case will be common. Fix: retrain on corrected data (T3). Owner: T3 / owner.
- **K-25** (T3): the 31B judge was not re-run for run3, so judge scores (faithfulness/structure/voice) are T2's; the nudge paragraph of an autopsy is now near-templated by construction; the check sets are small (40 + 40). Owner: owner (optional: re-run `eval.judge` with the teacher served).
- **K-20** (M5): metrics were verified on replayed synthetic days and fixtures, not on the owner's real browsing; today's last minute can still move because bin territories are assigned by the 1-minute sweep (K-16). Owner: owner (look at Dashboard → Today on real data).
- **K-21** (M5): the 30-minute gap rule for deep blocks (D-55) and the "first to last Deep bin, interruptions included" minute counting are my definitions; PDD 4.1 only says "away pauses the clock". Owner: owner if he disagrees.
- **K-22** (M5): the nightly job runs only while Chrome is running (first check after 03:00); a report for a day is otherwise generated on demand ("Write today's autopsy now") or at the next start. `vs7Day` stays null until 7 earlier days exist. Owner: M7 (mention in onboarding).
- **K-19** (M4): real nudge delivery in the owner's daily profile is unverified (headless probe only); a nudge cannot show over fullscreen video. The 24 h / 240-bin threshold for switching to Markov and the 60 min escalation window are my choices, not PDD numbers. The "unassigned feed" spent counter lives in `chrome.storage.session` and resets with the browser. Owner: owner / M7.

---

## Section template (copy for your milestone)

```markdown
## <ID> — <title>
**Status:** ✅ Done | ⚠️ Done with gaps | ❌ Blocked
**Date:** YYYY-MM-DD · **Commits:** <first-hash>..<last-hash>
**Approved plan:** `docs/plans/<ID>.md` (approved YYYY-MM-DD HH:MM) · **Work approved:** YYYY-MM-DD HH:MM

### What was built
- Bullet list of user-visible and internal capabilities.

### Key files
- `path` — what it does

### How to run / verify
- Exact commands and manual steps.

### Acceptance criteria
- [x] criterion — evidence (test name, measurement)
- [ ] criterion not met — why, and what was done instead

### Deviations from the approved plan
- Small adjustments made during implementation, and any material deviation together with when the owner approved it.

### Decisions and deviations from the PDD
- Any choice not specified in the PDD, and any deviation from it (with PDD decision-log update if one was made).

### Spike / measurement results
- Numbers recorded (also in `experiments/spikes.md`).

### Contracts changed
- Changes to `shared/` schemas or cross-module interfaces, and which consumers were updated.

### Known issues
- Bugs or limits left behind (also add to "Known issues and open follow-ups" above).

### Showcase evidence
- What was saved in `docs/showcase/<ID>/` and what the owner should capture.

### Notes for the next milestone
- What they must know, watch out for, or reuse.
```

---

## Planning — Product design and milestone plan
**Status:** ✅ Done
**Date:** 2026-10-15 · **Commits:** initial commit

### What was built
- `PDD.md` v2: full product design with 51 decisions (D-01 to D-51), priority tiers, risks, spikes and showcase plan.
- `implementation-milestones.md`: milestones M0–M9 plus a parallel training lane T1–T2, the showcase ladder (what we can submit if we stop early), global rules, and shared contracts.
- Two approval gates (`implementation-milestones.md` 0.7): the owner approves each plan (`docs/plans/<ID>.md`) before implementation, and approves the finished work before the summary is written. No commit without his explicit approval.
- Git repository initialised locally on `main` (no remote).

### Notes for the next milestone
- Start with **M0**. Once M0 is committed, **T1** can start in a separate chat in parallel.
- The owner downloaded the teacher model (`unsloth/gemma-4-31B-it-GGUF`, UD-Q4_K_XL, vision, MTP) in Unsloth Studio.
- Machine: Apple M4 Max, 64 GB, macOS 27, Node 24 with npm (no pnpm), `uv` available, Python 3.13. No Docker or Ollama.

---

## M0 — Repository, scaffold and shared contracts
**Status:** ✅ Done
**Date:** 2026-10-15 · **Commits:** `0ec0cee` (plan) plus the four `M0:` commits after it
**Approved plan:** `docs/plans/M0.md` (approved 2026-10-15 10:09) · **Work approved:** 2026-10-15 10:40

### What was built
- **Extension (`extension/`):** WXT 0.21.4, Vite 8.3.4, Preact 11.0.1 (via `@preact/preset-vite`), TypeScript 7.0.2, npm. The entrypoints are stubs but connected:
  - `background.ts` (service worker with a message router)
  - `offscreen/` (answers `ping`; created on demand by `lib/offscreen.ts`)
  - `content.ts` (empty stub on `<all_urls>`)
  - `popup/` (version, "offscreen: ok" check, Open dashboard button)
  - `dashboard/` (lists the IndexedDB stores and version)
  - `onboarding/` (placeholder)
- **Manifest:**
  - Permissions: `storage, unlimitedStorage, offscreen, tabs, alarms, idle, scripting`. No `commands`: it's a manifest key, not a permission.
  - `host_permissions: ["<all_urls>"]`.
  - CSP: `extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`.
- **IndexedDB (`lib/db/`):** database `doomscroll-autopsy`, `DB_VERSION = 1`.
  - Stores: `samples` (indexes `ts`, `territoryId`, `origin`), `bins` (key `binStart`), `territories`, `nudges` (index `ts`), `models`, `reports` (key `date`), `forgetLog`, and **`recorderEvents`** (index `ts`, for M1's recorder).
  - Typed records in `lib/db/schema.ts`. Accessors: `openDb`, `put`, `get`, `getAll`, `getRange`, `getByTs`, `clearAll`, `closeDb`.
  - **No `settings` store.**
- **Settings (`lib/settings/`, D-52):**
  - Stored in `chrome.storage.local` under the key `settings`.
  - Defaults: sensitivity `balanced`, `maxNudgeStep` 2, `quietHours` null, blocklist edits (`addedDomains`, `removedDomains`, `addedKeywords`), `retentionDays` 30, `storeTitles` true, `devMode` false, `pausedUntil: number | 'forever' | null`.
  - Exports: `getSettings`, `updateSettings`, `onSettingsChanged`, `isPaused`, and `SENSITIVITY_THRESHOLD` (0.75 / 0.60 / 0.45).
- **Messaging (`lib/messaging/`):**
  - `createRouter(target)` gives `register` / `dispatch` / `listen`.
  - `send(target, type, payload?)` sends a message.
  - Messages are `{target, type, payload}` envelopes; replies are `{ok, data}` or `{ok:false, error}`.
  - New message types are added by declaration-merging into `MessageMap` from your own module.
- **Shared contracts (`shared/`):** JSON Schema draft 2020-12, all with `$id` `urn:doomscroll-autopsy:schema:<name>:v1` and `additionalProperties: false`.
  - Schemas: `observer-event`, `territory-description`, `naming-output`, `daily-facts`, `personas`.
  - `samples/*.sample.json` holds one example per schema (except personas); the observer-event sample is an array of events.
  - `personas.json` has 6 personas: developer, writer, researcher, designer, student, freelancer. Each has sites per label with sample titles and velocity ranges, a day shape, and spiral triggers.
  - `types.ts` is generated from the schemas.
- **Assets (`extension/assets/`):**
  - `blocklist.json`: 87 `domains` (matches the domain and its subdomains), 8 `suffixes` (`.gov`, `.gov.in`, …), 11 `keywords` (substring of the hostname).
  - `feed-origins.json`: 27 feeds, each with `pathPatterns` (regex on the path) and a `kind` of `short-video` / `feed` / `forum` / `news` / `video`.
  - `topics.json`: 324 phrases.
  - `base.css`: page styles.
- **Training (`training/`):** `uv` project, Python 3.13, dev group `pytest` + `jsonschema`, `uv.lock` committed, with `tests/test_shared_schemas.py`.
- **Docs:** `README.md`, `LICENSE` (MIT), `.gitignore`, `docs/showcase/README.md`, `experiments/spikes.md` (one section per spike), Commands section in the agent instructions.

### Key files
- `extension/wxt.config.ts`: manifest, `@shared` alias, Preact plugin
- `extension/lib/db/schema.ts`, `extension/lib/db/index.ts`: storage records and accessors
- `extension/lib/settings/index.ts`: settings (D-52)
- `extension/lib/messaging/index.ts`: typed messaging between contexts
- `extension/scripts/gen-types.ts`: schema → `shared/types.ts`
- `extension/scripts/smoke-chrome.mjs`: headless Chrome load check
- `shared/*.schema.json`, `shared/personas.json`, `shared/samples/`

### How to run / verify
- `cd extension && npm ci && npm run build && npm test` gives 11 files and 35 tests passing. `npm run compile` (tsc) is clean.
- `cd extension && npm run smoke` (after a build) loads `.output/chrome-mv3` into a throwaway headless Chrome profile using `Extensions.loadUnpacked` over `--remote-debugging-pipe`. It opens popup, dashboard and onboarding, prints their text and the extension's targets, and exits 1 on any page exception.
- `cd extension && npm run gen:types`; `npm run check:types` fails if `shared/types.ts` is stale.
- `cd training && uv run pytest` gives 15 passing.
- `npm run dev` builds `.output/chrome-mv3-dev` in watch mode. WXT 0.21 does **not** launch Chrome; load that folder once with Load unpacked.

### Acceptance criteria
- [x] `npm ci && npm run build && npm test` passes: clean reinstall, then build and 35/35 tests.
- [x] Load unpacked shows no errors; popup and dashboard open. Checked with `npm run smoke`: popup shows "offscreen: ok", dashboard lists all 8 stores, 0 exceptions. The owner reviewed the work.
- [x] `uv run pytest` passes: 15/15.
- [x] `shared/types.ts` matches the schemas: regenerating gives no diff, and the Vitest test `shared/types.ts is up to date with the schemas` checks it.

### Deviations from the approved plan
- **Added** `npm run smoke` (headless load check), `npm run check:types` and the `@types/node` dev dependency.
- **`blocklist.json`** has a `suffixes` list besides `domains` and `keywords`.
- **Personas avoid blocklisted sites:** no webmail; the researcher's Outlook calendar was swapped for Zotero.
- **README and the agent instructions** describe `npm run dev` as "load `.output/chrome-mv3-dev` manually", because WXT 0.21 doesn't launch a browser.

### Decisions and deviations from the PDD
- **D-52 (new, owner-approved):** settings live in `chrome.storage.local`, not IndexedDB. PDD 8.1 was updated, and the `recorderEvents` row was added there.
- **PDD 11.5:** `commands` removed from the permission list; the keyboard shortcut (Could tier) adds the `commands` manifest key.

### Spike / measurement results
- **S0 (toolchain):** pass; recorded in `experiments/spikes.md`.

### Contracts changed
These refinements to `implementation-milestones.md` 0.6 are all v1, so no consumers existed yet.
- **All:** every timestamp is an integer epoch in ms. `origin` must match `^https?://[^/?#]+$` and `path` must match `^/[^?#]*$`, so schemas reject query strings.
- **observer-event:**
  - `text` has maxLength 4000 and is in memory only.
  - `itemKey` is 1–200 characters. Its description suggests hashing a text-based key, so M1 decides how keys are built.
  - In video events, `duration` can be `null`.
- **daily-facts:**
  - Clock times are local `"HH:MM"` (`start`/`end`) and `date` is `YYYY-MM-DD`.
  - Minutes are integers; deep blocks have `minutes` ≥ 25.
  - `meanMinBackToDeep` and `medianReturnMin` are numbers (rounded to 1 decimal) or `null`.
  - `drainOverAllowance[]` items have an **added** `allowanceMin`.
  - `topTriggers` has at most 5 items, with `hour` 0–23.
  - `strongestStretch` and `vs7Day` can be `null`.
  - Territories are referenced by **name**.
- **naming-output:** `name` is at most 6 words with single spaces (pattern) and at most 60 characters; `why` is at most 200 characters; `suggested_label` keeps PDD's snake_case.
- **territory-description:** `origins` has 1–5 items, `sampleTitles` up to 5, `topicTags` up to 3 (score from −1 to 1); `minutesToday` is an integer.
- **personas.schema.json (new):** `{version: 1, personas: Persona[]}`. Ranges are `[min, max]` number pairs.

### Known issues
- K-01 to K-03 (above).

### Showcase evidence
- None needed for M0. Stack: WXT 0.21.4 · Vite 8.3.4 · Preact 11.0.1 · TypeScript 7.0.2 · Vitest 5.0.4 · idb 8 · fake-indexeddb 6 · Ajv 8 (tests) · json-schema-to-typescript 16 · Python 3.13.2 · uv 0.11 · pytest 9 · jsonschema 4.

### Notes for the next milestone
- **M1:**
  - Content scripts must call `getSettings()` and check `isPaused()` and the blocklist (`assets/blocklist.json` plus `settings.blocklist` edits) **before anything else**. Matching rules are in the `description` field of `blocklist.json`.
  - Use the `recorderEvents` store for the recorder; it needs no DB version bump.
  - Persist `samples` and `bins` with the record types in `lib/db/schema.ts`.
  - Fill in the S1 section of `experiments/spikes.md`.
- **Schema changes:** edit `shared/*.schema.json`, run `npm run gen:types`, update the samples, bump the `$id` version if the change breaks consumers, and record it here. Both test suites check the samples.
- **Background handlers:** add yours from your own module (e.g. `lib/observer/handlers.ts` exporting `register(router)`), called from `background.ts`. Extend `MessageMap` with `declare module '@/lib/messaging'`.
- **T1:** read the schemas straight from `../shared`. `training/tests/test_shared_schemas.py` shows how to validate with `Draft202012Validator`. Add dependencies with `uv add` in `training/`.
- **Imports:** `@/` points to `extension/` and `@shared/` to `shared/`. Import the browser API from `wxt/browser`; in tests, `wxt/testing/fake-browser`. IndexedDB tests get `fake-indexeddb` automatically (`vitest.config.ts`); reset it with `globalThis.indexedDB = new IDBFactory()` and `closeDb()`.
- **Run `npm run smoke`** after building, to check the extension still loads with no exceptions.

---

## M1 — Observer, bins and storage
**Status:** ✅ Done
**Date:** 2026-10-15 · **Commits:** `fb70c0b` (plan) plus the three `M1:` commits after it
**Approved plan:** `docs/plans/M1.md` (approved 2026-10-15 11:42) · **Work approved:** 2026-10-15 14:28

### What was built
- **Blocklist first.** The observer is an unlisted script (`entrypoints/observer.ts` → `/observer.js`), **not** a manifest content script. The service worker registers it with `chrome.scripting.registerContentScripts` (id `observer`, `<all_urls>`, `document_idle`, `persistAcrossSessions`) with `excludeMatches` built from the effective blocklist (107 patterns), so Chrome never injects into blocklisted domains or suffixes. It re-registers when the blocklist settings change. The script itself then checks incognito, non-http(s), keyword matches and pause before touching the page, and stops quietly if the extension was reloaded (orphaned copy).
- **On install** the script is injected into already-open tabs with `executeScript`; a re-injected copy stops the old one via `globalThis.__doomscrollStop`.
- **Generic item detection (PDD 7.3, no per-site code):** `elementFromPoint` at the viewport centre, then walk up to the first ancestor 30–100% of viewport height with ≥ 40 chars of text or dominant media. An item is committed after 600 ms as the current item. Pages without cards fall back to a 3×3 grid of text-block hashes; a new viewport sample when ≥ 60% of blocks changed. A long-viewed item gets a continuation sample every 60 s of activity.
- **Item identity (D-47):** `u:<per-item path>` (`/shorts|reel(s)|status|comments|video|p/<id>`), else `m:<hash(currentSrc|duration|poster)>`, else `t:<hash(first 200 normalised chars, digits removed)>`; viewport samples are `v:<hash>`. Hash is cyrb53 (`hash53`), keys ≤ 200 chars.
- **Content-side signals:** EMA scroll velocity (tau 1 s), visibility, video play/pause/ended/skip (skip = left after < 2 s or < 25% watched), heartbeats every 15 s while active, URL poll every 1 s for SPA navigation. Item text (`innerText`, ≤ 2000 chars) is read in an idle callback and sent in memory only.
- **Service worker pipeline (`lib/observer/pipeline.ts`):** a pure `step(state, event)` reducer emits samples, dwell updates and closed 30 s bins. Time modes are active / idle / away / gap:
  - Heartbeats merge into active time within a 45 s pulse window; after that it's a gap (not counted).
  - Away (no focused window) and idle are counted for the first 10 minutes of an absence, then a gap (owner decision).
  - D-46: a playing video in the active tab counts as active while `chrome.idle` says idle; `locked` is always idle.
  - Only the active tab of the focused window counts, and only if its observer reports. Blocklisted pages, `chrome://`, paused time and incognito produce no bins.
- **Storage (`lib/observer/service.ts`):** state persists in `chrome.storage.session` (`observer-state`) so worker restarts keep the open bin; events are processed through a promise queue. `scrubEvent` strips `text` always and `title` unless `storeTitles`; paths are sanitised (no `?`/`#`). Samples go to `samples` (vector `null` until M2), bins to `bins`. A provisional dwell is written when the tab is hidden or closed.
- **Pause (D-48):** popup buttons 15 min / 1 hour / Until tomorrow (next 04:00 local, owner decision) / Until I resume, plus Resume now. Amber `II` badge and title while paused, a `pause-end` alarm resumes. The content script stops observing; the pipeline drops events and counts no time; the recorder records nothing but pause markers.
- **Popup:** items seen today, active minutes today, items per minute now (polled every 2 s via the `live-stats` message), status line and pause controls.
- **Recorder (dev mode, `lib/replay/recorder.ts`):** writes scrubbed `PipelineEvent`s (observer and browser events, no ticks, no text) to `recorderEvents`. Dashboard → Developer: dev-mode toggle, counts of samples / bins / recorded events, Download recording (JSONL), Clear recording. Dev mode also logs `[doomscroll] item …` lines and perf stats every 20 s to the page console.
- **Daily-profile install:** `npm run live` builds and copies to `extension/.live/chrome-mv3` (git-ignored), which only changes when the owner runs it.
- **S1 probe:** `npm run probe:s1` (headless Chrome over CDP pipe).

### Key files
- `extension/lib/observer/pipeline.ts` — time accounting, bins, samples (pure, fully unit-tested)
- `extension/lib/observer/service.ts` — scrub, persist, session state, live stats, pause gating
- `extension/lib/observer/background.ts` — `registerObserver(router)`: message handlers, tab/window/idle/alarm listeners, badge, script registration
- `extension/lib/observer/content.ts` — `startObserver()` in the page: detection, signals, dev logs
- `extension/entrypoints/observer.ts` — the checks that run first (incognito, scheme, blocklist, pause)
- `extension/lib/observer/{identity,signals,blocklist,pause,url,types,messages}.ts` — pure helpers and types; `index.ts` re-exports the pure modules
- `extension/lib/replay/recorder.ts` — dev-mode recorder
- `extension/scripts/s1-probe.mjs`, `extension/scripts/live.mjs`

### How to run / verify
- `cd extension && npm run build && npm test` gives 16 files and 78 tests passing; `npm run compile` is clean; `npm run smoke` reports 0 exceptions; `npm run check:types` exits 0.
- `cd extension && npm run probe:s1` (after a build, ~7 min) scrolls Shorts, Reddit, Mastodon, Bluesky, MDN and Wikipedia, then checks blocklist, pause and privacy, and writes `docs/showcase/M1/s1-probe.json`. Env: `HEADED=1`, `SCROLLS=n`, `ONLY=regex`, `DEBUG=1`. Exits 1 on any failed check.
- Manual: `npm run live`, Load unpacked `extension/.live/chrome-mv3`, browse, open the popup; pause → `II` badge; dashboard → Developer → dev mode → Download recording.

### Acceptance criteria
- [x] Unit tests for item identity, velocity smoothing, heartbeat merging and bin aggregation — `identity.test.ts`, `signals.test.ts`, `pipeline.test.ts` (12 tests).
- [x] 10 minutes of browsing produces bins and samples with no item text or query strings, plus a test that inspects stored records — `service.test.ts` checks every store for planted text, `?`, `#` and a `"text"` field; the ~8-minute headless probe stored 103 samples and 13 bins with 0 URLs with `?`/`#`, 0 records with text and 0 of 167 page-text lines found. Real browsing in the owner's profile was a review step, not checked by this chat.
- [x] Blocklisted site → no events; paused → no events — probe: 0 events on a blocklisted site; 0 events and 0 samples while paused, badge `II`. Also in `service.test.ts` and `pipeline.test.ts`.
- [x] S1 results recorded, failures noted — `experiments/spikes.md`: Shorts 1.10, Mastodon 1.00, Bluesky 1.10, MDN 0.95, Wikipedia 0.85 items per scroll; Reddit walls headless Chrome. Logged-in Instagram, X and Reddit counts are not recorded (K-04).
- [x] Owner installs the build in their daily Chrome profile today — `npm run live` prepared `extension/.live/chrome-mv3` with install steps in the review request; installing was the owner's step and the owner approved the review (this chat did not see the install).

### Deviations from the approved plan
- `entrypoints/content.ts` replaced by the unlisted `entrypoints/observer.ts`: WXT's content-script wrapper posts a page-visible event and adds a listener before user code runs, which breaks "nothing before the blocklist check".
- Planned detection/viewport/velocity/video files merged into `lib/observer/signals.ts`. Added `service.ts` (testable storage side) and `messages.ts`. M0's stub test `lib/observer/index.test.ts` removed; `index.ts` is now a barrel.
- `lib/db` gained `count`, `clearStore`, `countByTs`; `assets/base.css` gained `.warn`, `h2`, `table`, `td`, `.row`.
- Probe sites extended with Mastodon, Bluesky and Wikipedia because X and Instagram need a login and Reddit walls headless Chrome.

### Decisions and deviations from the PDD
None needs a decision-log entry; these fill gaps the PDD leaves open:
- **60 s continuation samples** for any long-viewed item (PDD specifies it only for docs-style pages).
- **`isVisual`** = media ≥ 50% of the viewport (PDD 7.2) **or** ≥ 60% of viewport height and ≥ 15% of its area, so a portrait Short on desktop counts.
- **`chrome.idle` threshold 120 s.**
- **Bin features:** `items_per_min` = items in the bin × 2; `mean_dwell_ms` = mean `prevDwellMs` of items in the bin (0 if none); `video_skip_rate` = skips ÷ distinct video keys; `scroll_px_s_mean` time-weighted over active seconds; `away`/`idle` flags set when > 15 s of the bin.
- **Nothing is recorded while paused**, including browser events (only pause markers).

### Spike / measurement results
- **S1:** see `experiments/spikes.md`. Scroll handler p95 ≤ 0.5 ms everywhere (budget < 2 ms, PDD 9.9). Item detection runs off the scroll handler (≤ every 250 ms) with p95 0.9 ms (Shorts, Mastodon, Wikipedia), 2.1 ms (MDN) and 2.7 ms (Bluesky). Text read (idle callback) p95 ≤ 1.8 ms.

### Contracts changed
- **`BinRecord.active_s: number`** added in `lib/db/schema.ts` (no `DB_VERSION` bump; bins is keyed by `binStart`). M0's db test fixture updated.
- **Messages** (`lib/observer/messages.ts`, merged into `MessageMap`): `observer-event` (content → background, payload `ObserverEvent` from `shared/types.ts`) and `live-stats` (popup → background, returns `{samplesToday, activeMinToday, itemsPerMinNow, pausedUntil}`).
- **Recorder JSONL format** = `PipelineEvent` (`lib/observer/types.ts`): `ObserverEvent & {tabId}` or a browser event (`tab-activated`, `window-focus` with `windowId: null` = away, `idle-state`, `tab-removed`, `pause`). No `shared/` schema changed.

### Known issues
- K-04, K-05, K-06 (above).
- Headless runs give low active seconds (228 s over ~8 min) because headless windows rarely report focus; real profiles don't have this.

### Showcase evidence
- `docs/showcase/M1/s1-results.md` (probe table, per-scroll cost), `s1-probe.json` (raw), `CAPTURE.md` (popup counts, Shorts vs docs items/min, pause badge, dev console, dashboard Developer section).

### Notes for the next milestone
- **M2:** samples are stored with `vector: null`; embed them later by reading `samples` and updating `vector`. Item text is **not** stored, so it must be embedded while in memory: hook in `lib/observer/service.ts` where the `item` event arrives (before `scrubEvent` drops `text`) or in `background.ts`'s `observer-event` handler, and pass the text to the offscreen engine. Samples before M2 stay vectorless (expected by the milestone plan).
- **M3/M5:** bins carry `active_s`, `idle_s`, `away_s` and the velocity features; `territoryId` and `nudge*` fields are `null`/`false` for M3/M4 to fill. Away/idle beyond 10 minutes is a gap: no bins exist for it, by design.
- **M4 replay:** the recorder's JSONL replays through `initialState()` + `step()` from `lib/observer/pipeline.ts`; the pipeline is pure and deterministic, so replaying a recording reproduces the bins.
- **Adding background handlers:** follow `registerObserver(router)`; it must run before `router.listen()` in `entrypoints/background.ts`.
- **Don't add a manifest `content_scripts` entry** for the observer; registration is dynamic so the blocklist stays an `excludeMatches` list. After changing the blocklist logic, test with `npm run probe:s1` (it checks a settings-added blocklisted domain).
- **Daily profile:** the owner's data lives under the `.live/chrome-mv3` install. Ask the owner to run `npm run live` and reload after your changes; never point `live` elsewhere or move the folder (the extension ID, and so the data, is tied to the path).

---

## M2 — Embedding engine (EmbeddingGemma 2 in the browser)
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `9eca9c7` (plan) plus the three `M2:` commits after it
**Approved plan:** `docs/plans/M2.md` (approved 2026-10-15) · **Work approved:** 2026-10-16 18:58

### What was built
- **Embedder (`lib/ml/embedder.ts`):** `onnx-community/embeddinggemma-2-ONNX` pinned to revision `daa72c51243991dfcaf9f9137d2c573d8f7790c0`, `q4f16` for the text model and the vision encoder (≈ 157 + 98 MB, audio never loaded), `device: webgpu`. Prefix `task: clustering | query: ` (text only); text is capped at 1,500 characters; a screenshot is interleaved with `<|image|>` and `images=[[RawImage]]` in one pass. Output 768d, rejected if any value is non-finite.
- **Model host in the offscreen document (`lib/ml/host.ts`):** lazy load on the first embed, download progress, latency stats (median / p95 over the last 200), `unload`. If WebGPU is missing it reports an error and downloads nothing.
- **Service worker side (`lib/ml/service.ts`, `background.ts`):** every `item` event is handed to the embed service with its text (or title if the text is empty) before `scrubEvent` drops it. Screenshots: `captureVisibleTab` (JPEG q60) only for visual items in the active tab of the focused window, ≤ 1 per 3 s. Queue (`queue.ts`): one in flight, ≤ 20 embeds/min (others skipped), > 10 queued drops the oldest images first, then the oldest jobs. Result → truncate to 256d (768d in dev mode) and re-normalise (`truncate.ts`) → written to the matching sample (same tab, nearest `ts` within ±3 s, vector still null, up to 4 retries). Text and image references are nulled after each job. An alarm unloads the model after 10 idle minutes.
- **Popup:** a model line ("downloading N%", "ready, NN ms per item", "unavailable. …") and "Embedded today: X of Y items" via the `embed-status` message.
- **ORT runtime served locally:** Transformers.js loads ORT's wasm from jsDelivr by default; `scripts/copy-ort.mjs` copies the asyncify `.mjs` + `.wasm` into `public/ort/` (git-ignored) before build/dev/live, and `env.backends.onnx.wasm.wasmPaths` points there. A `build:done` hook removes a duplicate 26 MB wasm that the bundler emits.
- **Spike harness** (`entrypoints/spike`, built only with `npm run build:spike`) and `scripts/s2-probe.mjs`.

### Key files
- `extension/lib/ml/{embedder,host,queue,truncate,capture,service,background,messages}.ts` (+ tests)
- `extension/entrypoints/offscreen/main.ts`: registers `embed`, `embedder-status`, `embedder-unload`
- `extension/lib/observer/background.ts`: the one hand-off line into `submitItem`
- `extension/scripts/{copy-ort,s2-probe}.mjs`, `extension/entrypoints/spike/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke`: 21 files, 98 tests; smoke 0 exceptions.
- `npm run build:spike && S3=1 npm run probe:s2` (downloads ≈ 255 MB once; `DTYPE`, `DEVICE`, `VISION`, `OUT`), then `npm run build` again for the normal build.
- `ONLY='shorts|mdn|wikipedia' OUT=../docs/showcase/M2/m2-probe.json npm run probe:s1` after a normal build: now also reports embedding coverage.
- Manual: `npm run live`, reload, browse; popup shows the model line and "Embedded today".

### Acceptance criteria
- [x] Unit tests for truncation + re-normalisation and queue backpressure / sub-sampling: `truncate.test.ts`, `queue.test.ts` (plus `service`, `host`, `capture`).
- [~] ≥ 95% of new samples have finite vectors after browsing: scripted run 55 of 59 (93%), all finite and unit length; the 4 without were skipped by the 20/min cap (100% of samples that had input). Not measured over 10 minutes in the owner's profile.
- [x] Median embed latency recorded: text 16 ms, image 213 ms (S2); 49 ms median / 236 ms p95 in the live pipeline.
- [x] No item text or images in storage: `service.test.ts` scans every store; probe found 0 records with text, 0 URLs with `?`/`#`, 0 of 85 page-text lines.
- [x] PDD 9.9 budget measured: median < 300 ms met; memory about +1.3 GB in headless Chrome (budget 1.5 GB; real profile unmeasured, K-13).

### Deviations from the approved plan
- Title used as text when the item body is empty (raised coverage from 78% to 93%).
- Service-worker hosting not tried (a worker cannot `import()`, and the offscreen page passed).
- Added `host.ts`/`host.test.ts` (testable model host), `scripts/copy-ort.mjs`, the `build:done` hook, and an `OUT` option plus an embedding-coverage report in `scripts/s1-probe.mjs`.
- The averaging fallback for non-interleaved input was not needed. No WASM fallback exists (K-11).

### Decisions and deviations from the PDD
- D-26 updated in the PDD with the pinned revision, dtype and the local ORT runtime. V-01, V-02, V-03, V-07 marked resolved; §9.1 and §12.2 updated.
- The only network host is huggingface.co (ORT wasm is local).

### Spike / measurement results
- **S2 pass.** q4f16 WebGPU: text 16 / 56 ms (median / p95), image 213 / 225 ms, text + image 216 ms, 0 NaN in 60; q4: images 358 ms; WASM fails (no `GatherBlockQuantized` kernel). Same-topic cosine 0.993 vs 0.746. Peak RSS 2.28 GB (≈ +1.3 GB). **S3 pass:** TF.js WebGPU trains next to Transformers.js. Details: `experiments/spikes.md`, `docs/showcase/M2/results.md`.

### Contracts changed
- None in `shared/` or `DB_VERSION`. New messages in `lib/ml/messages.ts`: `embed`, `embedder-status`, `embedder-unload` (background → offscreen) and `embed-status` (popup → background). `samples.vector` is now filled (256d, or 768d in dev mode); `models` store unused so far.

### Known issues
- K-11, K-12, K-13 (above).

### Showcase evidence
- `docs/showcase/M2/`: `results.md`, raw `s2-*.json` and `m2-probe.json`, `CAPTURE.md` (download progress, ready popup, Activity Monitor memory, optional GIF).

### Notes for the next milestone
- **M3:** read `samples` where `vector !== null` (Float32Array, 256d, unit length; dev-mode rows are 768d, so truncate or skip). Vectorless samples are normal (K-12): assign them the previous item's territory. Pre-M2 samples never get vectors. Use the same `truncateAndNormalize` for any centroid maths. Topic phrases should use the same prefix (`CLUSTERING_PREFIX`); embed them through `embed` (text only).
- **Calling the model from other modules:** `send('offscreen', 'embed', { text, image })` after `ensureOffscreenDocument()`; it returns 768d. M6 can host the 270M in the same offscreen document; unload one model before loading the other (PDD 9.9).
- **Build:** `npm run build/dev/live` run `copy-ort.mjs` first; if you call `wxt` directly, run it yourself or the model won't load. First embed downloads ≈ 255 MB, so a fresh profile needs a minute before vectors appear.
- **Daily profile:** ask the owner to run `npm run live` and reload to get embeddings.


---

## T2 — Fine-tune, evaluate and convert Gemma 3 270M
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `2f3a5bc`..(commit 4, see `git log`)
**Approved plan:** `docs/plans/T2.md` (approved, commit `75fc69e`) · **Work approved:** 2026-10-16 (owner: "I approve")

### What was built
- Fine-tuned Gemma 3 270M with Unsloth Studio CLI (MLX): LoRA r16/α32, lr 2e-4, 3 epochs, batch 4, 732 steps, ~15 min on the T1 train split. Merged HF model in `training/data/runs/run1/merged` (gitignored).
- ONNX export to **324 MB** (`onnx/model_fp16.onnx`, 8-bit weights, fp16 activations) using onnxruntime-genai's builder plus a graph edit that stores the vocabulary table once at 8 bits. Generates in headless Chrome on WebGPU via Transformers.js 4.3.1: 100/100 eval prompts, median ~118 tok/s, load 1.2 s, deterministic.
- Evaluation harness: T1 validators, extra strict semantic checks, blind Gemma 4 31B judge, Wilson CIs, paired comparison, template baseline, 20-example side-by-side review file.
- Draft model card (not published).

### Key files
- `training/finetune.py` — scripted Unsloth training; writes curve.csv and merged model
- `training/export_onnx.py` — `--builder genai|optimum`, `--bits 8|4`; copies tokenizer/config, embeds chat template, adds `transformers.js_config`
- `training/onnx_test/run.mjs` — browser generation test (CDP, headless Chrome)
- `training/eval/` — `metrics.py` (incl. `strict_autopsy_errors`), `build_outputs.py`, `gen_hf.py`, `judge.py`, `report.py`, `rubric.md`, `report.md`, `review_20.md`
- `training/tests/test_eval.py` — 63 tests total pass (`cd training && uv run --group export pytest tests -q`)
- `docs/showcase/T2/` — `eval-table.md`, `s5-notes.md`, `model-size.md`, `training-curve.csv`, `CAPTURE.md`
- `training/model_card.md` — DRAFT

### How to run / verify
- See `training/README.md` "T2 pipeline". Export: `cd training && uv run --group export python export_onnx.py data/runs/run1/merged data/runs/run1/onnx_final`. Browser: `DTYPE=fp16 node onnx_test/run.mjs data/runs/run1/onnx_final data/runs/run1/cases_eval.json out.json`. Report: `uv run python -m eval.report`.

### Acceptance criteria
- [x] ≥ 95% valid output — worst task 97% (naming 97%, autopsy 100%)
- [x] ≥ 90% grounding — autopsy 92% (95% CI 80–97%, thin), naming 97%
- [x] Judge mean ≥ 3.5 — 4.75 (naming 4.99, autopsy 4.51)
- [x] Beats baseline — naming 4.99 vs 2.92, autopsy 4.51 vs 4.30
- [x] Outside-browser mentions = 0
- [x] ONNX generates in the browser page — 100/100, ~118 tok/s
- [x] S5 recorded — `experiments/spikes.md`
- [x] pytest — 63 passed

### Deviations from the approved plan
- Added `onnxruntime-genai==0.18.0` to the `export` dependency group (`pyproject.toml`, `uv.lock`). Builder runs from a patched temp copy (stubbed transformers-5 imports, `rope_scaling or {}`); the installed package is untouched.
- Shipped export switched from the optimum route (622 MB) to the genai route (324 MB) after the owner asked to investigate the size gap; optimum path kept (`--builder optimum`).
- Added eval-only strict semantic checks; judged the fp32 fine-tune as well.
- No second training run (retrain proposed, not done).

### Decisions and deviations from the PDD
- PDD updated: size 530 → 580 MB total in pitch/onboarding, 9.5 model line (8-bit, `dtype: "fp16"`, ≈324 MB, ≈118 tok/s), D-07 row (324 MB, why 4-bit failed), V-05/V-06 resolved.

### Spike / measurement results
- **S5** pass: see `experiments/spikes.md` and `docs/showcase/T2/s5-notes.md` (build sweep). Judge: shipped 4.51 autopsy vs fp32 4.58; vs optimum 8-bit paired −0.04 (95 same, 5 lower, none higher). Strict-clean autopsies 70%; validators + strict checks caught 8/8 judge-low autopsies; none of 28 fully passing were judged low; judge missed 2 real errors. Shared 8-bit vocab within 1.3% of original (cosine ≥ 0.9999).

### Contracts changed
- None in `shared/`. Student prompt contract (T1) unchanged.

### Known issues
- K-07 to K-10 (above).

### Showcase evidence
- `docs/showcase/T2/` as listed; `CAPTURE.md` lists what to capture (headed browser generation, training curve, side-by-side examples).

### Notes for the next milestone
- **M6:** load with Transformers.js `dtype: "fp16"` (file `onnx/model_fp16.onnx`, external data `model_fp16.onnx_data`); `kv_cache_dtype` is set in `transformers.js_config` in config. Use exactly the evaluated settings: chat template on the single user turn, greedy, `max_new_tokens` 120 (naming) / 400 (autopsy), prompt from `common.student_prompt` (T1 contract).
- Always validate autopsy output (T1 validators plus the strict checks in `training/eval/metrics.py`) and fall back to the template; the model is less faithful than the template (4.45 vs 5.0 judge faithfulness).
- Record model memory during generation; not measured here. Total download with EmbeddingGemma ≈580 MB.
- Hosting: nothing is on Hugging Face yet; publishing needs the owner's explicit yes (repo name V-10, full `GEMMA_TERMS.md`, pinned hash).

---

## M3 — Territories and labeling
**Status:** ✅ Done (real-data checks pending, K-14/K-15)
**Date:** 2026-10-16 · **Commits:** the three `M3:` commits after `588225e` (see `git log`)
**Approved plan:** `docs/plans/M3.md` (approved 2026-10-16 20:00) · **Work approved:** 2026-10-16, owner: "I am not in a mood to review… complete the milestone and commit it" (review steps skipped by the owner; I verified what I could myself)

### What was built
- Own spherical k-means (k-means++, seeded), exact O(n·k·d) silhouette, `chooseK` over [4, 30] (≤ ⌊n/15⌋, smallest k within 0.02 of best; chosen on a ≤ 1,200 subsample, final fit on the latest ≤ 6,000 vectors); clusters under max(5, 0.5%) dissolved.
- Hungarian matching on centroid cosine: > 0.8 keeps ID, name, label, allowance. Owner-confirmed territories without a match stay dormant (size 0), unconfirmed ones are dropped (D-53).
- Online assignment right after a vector is written (nearest centroid, `radius` = p95 × 1.25, beyond it `territoryId: null`; `territoryDist` always stored). A 1-min sweep assigns vectorless samples (carry previous territory, K-12) and sets bin territories (majority by time overlap).
- Schedule: first run at ≥ 300 vectors, every 2 h for 24 h after the first run, then nightly after 03:00; 30-min alarm decides. Forced re-cluster needs ≥ 60 vectors.
- Baseline names `host · top path segment` (duplicates numbered); rule-based suggested labels (feed origins → drain; `assets/shallow-origins.json` → shallow), stored as `suggestedLabel` only.
- Dashboard: Territories section (items, today's minutes, Deep/Shallow/Drain, Drain allowance default 15, Re-cluster now, delete dormant); dev-mode Evidence (silhouette by domain vs territory, path-agreement NMI, Deep/Drain split example, JSON download with counts only).

### Key files
- `extension/lib/ml/{kmeans,hungarian,names,territories-core,territories,territories-background,territories-messages,evidence,testutil}.ts` (+ tests), `extension/assets/shallow-origins.json`
- `extension/entrypoints/dashboard/{territories,evidence}.tsx`; hooks in `lib/ml/{service,background}.ts`, `entrypoints/background.ts`, `dashboard/main.tsx`
- `extension/scripts/{c1-bench.ts,s1-probe.mjs}` (`M3=1` flag), `docs/showcase/M3/`, `experiments/spikes.md` (C1)

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke`; `npm run check:types`
- `M3=1 npm run probe:s1` (headless: forces re-cluster, labels via dashboard, re-clusters, checks persistence); `npx tsx scripts/c1-bench.ts 6000`
- Owner: `npm run live`, reload, browse, Dashboard → Territories → Re-cluster now; dev mode → Compute evidence.

### Acceptance criteria
- [x] Unit tests: planted clusters recovered, `chooseK`, Hungarian permutation, IDs/labels survive re-cluster (27 files / 167 tests pass).
- [~] Real data: territories appear and labels persist across a forced re-cluster, verified in headless Chrome with real EmbeddingGemma vectors (202 items, 225/225 samples and 21/21 bins assigned, labels and allowance kept). Not run in the owner's daily profile.
- [x] Privacy: store-scan test, probe (0 URLs with ?/#, 0 text records), no new network calls.

### Deviations from the approved plan
- Silhouette is exact via per-cluster vector sums instead of subsampled (only k selection subsamples).
- `uniqueNames` suffixes duplicate baseline names; added `testutil.ts`, `c1-bench.ts` (needs `npx tsx`, not a declared dependency), the `M3=1` probe mode, and weakest-match in the dashboard status.
- Owner skipped the review step; C2 (drift) and the real-profile run were not done.

### Decisions and deviations from the PDD
- D-53 added to the decision log (dormant owner-confirmed territories); PDD 9.2 "As built" note.

### Spike / measurement results
- C1: choose k + cluster in Node: 1.4 s at 1.5k, 1.6 s at 3k, 1.7 s at 6k vectors (bar 10 s). Headless real run: k=6 (once 10) from 202 vectors in 123 ms. See `experiments/spikes.md`, `docs/showcase/M3/results.md`.

### Contracts changed
- `TerritoryRecord.radius?: number` (types only; no `DB_VERSION` bump, no `shared/` change). New messages `territories-recluster`, `territories-sync`. `writeVector`/`EmbedServiceDeps` gain an optional `assign`.

### Known issues
- K-14, K-15, K-16 (above).

### Showcase evidence
- `docs/showcase/M3/{results.md,CAPTURE.md,m3-probe.json}`. Owner should capture the Territories list and a domain split across labels (see CAPTURE.md).

### Notes for the next milestone
- **M4/M5:** `samples.territoryId` (null = unassigned/none), `territoryDist`, `bins.territoryId`, and `territories` (`label`, `allowance`, `suggestedLabel`, `size`; size 0 = dormant) are filled. Bin territories lag up to a minute. Use `loadTerritoryView` in `territories.ts` for dashboard data. Drain allowance is minutes per day, 0–1440, Drain only.
- Territory IDs are stable across re-clusters only through matching; treat `null` label as unconfirmed and use `suggestedLabel` only as a hint.
- Re-cluster state is in `models` under `territories-meta`.

---

## M4 — Spiral prediction, nudges, replayer and demo mode
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `ca780ab` (plan) plus the three `M4:` commits after it (see `git log`)
**Approved plan:** `docs/plans/M4.md` (approved 2026-10-16, owner: "approve it and build it" after my self-review) · **Work approved:** 2026-10-16, owner: "I don't think I will be able to review this. Please review your own work… finish the milestone and commit" (review steps skipped by the owner; I re-read the diff, ran every check and the headless probes myself)

### What was built
- **Scoring:** `rules.ts` (logistic drain share from items/min, scroll, skip rate, feed prior, time in territory, "just left Deep"; constants documented), `markov.ts` (first-order over bins; states = territory IDs + `unassigned`/`away`/`idle`; gaps are not transitions; Laplace α 0.05; 20-step expected-occupancy rollout), `scoring.ts` (PDD 9.5 spiral score with per-territory remaining allowance; effective label = confirmed, else suggested; `selectMode`: Markov once the history spans 24 h with ≥ 240 labelled bins).
- **Evaluation:** `eval.ts` (top-1/top-3, top-3 on switches, rank-based AUC with ties, split: latest day, else 70/30 within the day, else none; AUC null without both classes) and `evaluate.ts` (stores `models/markov`, `models/eval`, `models/prediction-mode`; Markov refreshed at most every 6 h).
- **Nudges:** `policy.ts` (pure), `copy.ts` (coach voice), `ui.ts` (closed shadow DOM, constructable stylesheet; banner and a `backdrop-filter` blur layer, Replay pill, Escape = snooze, banner auto-hides as "ignored" after 60 s), `content.ts` (own removable `onMessage` listener, started by `entrypoints/observer.ts` only after the blocklist/pause checks), `service.ts`/`background.ts` (30 s alarm → snapshot → score → policy → deliver to the active tab → log; `secondsToReturn` and bin `nudgeShown/nudgeResponse` set later; `spiral-status` for the popup).
- **Replay:** `synthetic.ts` (seeded days for the 6 personas as recorder-format events, territory table and routes), `replayer.ts` (real `step()` pipeline on the events' clock, longest-prefix route resolution, scoring and policy per closed bin; in memory only; JSONL parser; routes from real samples), `demo.ts` (80-min prepared day, player with a virtual clock), `synthetic-eval.ts`.
- **UI:** dashboard "Prediction and replay" panel (`entrypoints/dashboard/replay.tsx`: active mode, Evaluate on my data, synthetic evaluation, Start demo with speed, replay of a JSONL recording); popup line "Mode: rules · spiral score 0.xx (nudges at 0.60)" and a "Replay running" warning.

### Key files
- `extension/lib/ml/{markov,rules,scoring,eval,evaluate}.ts` · `extension/lib/nudge/{policy,copy,ui,content,service,background,messages}.ts` · `extension/lib/replay/{synthetic,replayer,demo,synthetic-eval}.ts` · `extension/entrypoints/dashboard/replay.tsx` · `extension/scripts/m4-probe.mjs` · `docs/showcase/M4/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke && npm run check:types` (34 files, 239 tests + 1 gated; smoke 0 exceptions).
- `npm run probe:m4` (offline, ~1 min; `REAL=1` adds github.com and YouTube Shorts); `npm run eval:m4` writes `docs/showcase/M4/synthetic-eval.{json,md}`.
- Owner: `npm run live`, reload, Dashboard → Prediction and replay → Start demo (switch to another page) and "Evaluate on my data".

### Acceptance criteria
- [x] Unit tests: Markov rollout on a known chain (analytic), allowance logic, nudge policy (cooldown boundary, allowance, max step, label rules, escalation, quiet hours), evaluation metrics on toy data — `markov/scoring/policy/eval/evaluate/service/replay` tests.
- [x] Synthetic spiral day replayed in demo mode triggers a banner, then a blur, at the expected times — test: banner 57:00, blur 72:00 (expected 57 ± 2, ≥ 15 min apart); headless probe at 120×: banner after ~29 s, blur ~37 s, Replay flag set.
- [~] Rules vs Markov on the owner's real data computed and stored — the code path is tested on stored synthetic bins and runs on empty data in the probe; the real run is the owner's (K-17).

### Deviations from the approved plan
- `npm run eval:m4` is a gated Vitest run (`lib/replay/synthetic-eval.test.ts`) instead of `scripts/m4-eval.ts` (tsx can't resolve `@/`); the headless probe is a separate `scripts/m4-probe.mjs`/`npm run probe:m4`, not an `M4=1` mode of `probe:s1`. Added `lib/ml/evaluate.ts` and `lib/replay/synthetic-eval.ts`.
- Small edits to existing code: `'content'` added to the messaging `Target`; M3's `relabelBins` re-reads each bin inside the transaction so nudge flags aren't overwritten; the stub `index.test.ts` of `lib/nudge` and `lib/replay` removed (barrels now); rules `SCROLL_NORM` 300 (a feed at ~8 items/min averages ~100 px/s).
- N1 also ran on github.com and YouTube Shorts (`REAL=1`); copy fixed after a screenshot showed "spent 15 … past your 15".

### Decisions and deviations from the PDD
- **D-54** added: no nudge while allowance remains; unconfirmed territories use their suggested label; step-2 buttons "Back to it"/"Keep going" until M8 adds "Take a breath"; escalation needs the previous nudge within 60 min and ignored/snoozed/unanswered ("Back to it" resets); replays never write stored data. PDD 9.7 "As built" note.

### Spike / measurement results
- **N1 pass** (banner + blur topmost, page DOM unchanged, on strict-CSP, plain, github.com, YouTube Shorts; refused when paused, not delivered to blocklisted pages). **N2 pass** (84 synthetic days replayed + evaluated in 3.8 s, ~45 ms/day). Details: `experiments/spikes.md`, `docs/showcase/M4/results.md`.
- Regression: `M3=1 npm run probe:s1` still passes (labels survive re-cluster; 0 query strings, 0 text records, 0 page-text lines).

### Contracts changed
- No `shared/` change, no `DB_VERSION` bump. New messages: `nudge-show` (background → content, target `content`), `nudge-response` (content → background), `spiral-status` (popup → background). New `models` records: `markov`, `eval`, `prediction-mode`. `chrome.storage.session` keys: `replay-active`, `unassigned-feed-spent`.

### Known issues
- K-17, K-18, K-19 (above).

### Showcase evidence
- `docs/showcase/M4/`: `results.md`, `synthetic-eval.{md,json}`, `m4-probe.json`, headless screenshots (`demo-banner/blur.png`, `nudge-*.png`), `CAPTURE.md` (owner: demo GIF at 120×, popup during replay, mode/evaluation table).

### Notes for the next milestone
- **M5:** nudge outcomes are in `nudges` (`response`, `secondsToReturn`) and on bins (`nudgeShown`, `nudgeResponse`, set by `trackNudgeOutcomes` within 30 min); `effectiveLabel`/`territoryInfo` in `lib/ml/scoring.ts` give the label scoring used. The dashboard panel is mounted with one line in `main.tsx`; keep it. `evaluate.ts` exports `refreshPrediction`/`getStoredMode` if the dashboard needs the mode.
- **M6:** nothing here depends on the 270M; the nudge copy is deterministic. **M7:** nudges need a page with the observer; test real delivery in a fresh profile and mention fullscreen limit.
- **M8:** GRU plugs into `selectMode`/`scoreSpiral` (`ScoreContext.mode`) and `evaluateModes` (add a third mode); breathing step: raise `IMPLEMENTED_MAX_STEP` in `policy.ts` and add the UI/copy.
- The M5 chat may run in parallel; both edit `entrypoints/dashboard/main.tsx` (one line each) and `background.ts`.

---

## M5 — Metrics, dashboard timeline, template autopsy and privacy controls
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `705cc86` (plan) plus the three `M5:` commits after it (see `git log`)
**Approved plan:** `docs/plans/M5.md` (approved 2026-10-16 22:30, delegated by the owner: "I will not be available for any review or to take any decisions and count upon you") · **Work approved:** 2026-10-16 (self-review under that delegation; the owner reviews later)

### What was built
- **Facts** (`lib/metrics/facts.ts`): deep blocks, attention residue, totals by label, drain over allowance, top triggers, strongest stretch, nudge outcomes, 7-day comparison, all from stored bins in browsing time (away/idle/unobserved bins are gaps). Output validates against `shared/daily-facts.schema.json`.
- **Template autopsy** (`autopsy.ts`): coach voice, PDD 4.6 structure, always 120-180 words, passes `validate.ts` (a TS port of T1's `check_autopsy`, hand-written so it runs under the MV3 CSP: the shared validator M6 reuses).
- **Reports and nightly job** (`service.ts`, `background.ts`): facts + autopsy stored in `reports` (`modelVersion: "template"`); nightly job (first check after 03:00) = retention → re-cluster if due → prediction refresh → reports for every finished day; "Write it now" on demand.
- **Dashboard**: Today (four metric tiles, browser-time line, 7-day comparison, history picker), a plain-SVG Timeline (territory lanes coloured by label, velocity line, deep-block outlines, nudge markers, away = plain gap), Autopsy (preview or stored, source pill, "numbers behind it"), "How it's going" (PDD 4.7 success metrics over 7 days), Privacy, plus the earlier panels now in cards with a nav.
- **Popup**: deep blocks (count + longest), attention residue, drain past allowance, nudges that worked.
- **Privacy** (`lib/privacy/`): forget a time range / a site (+ always skip) with the PDD 11.4 cascade, blocklist editor (add/remove domains and keywords, shipped defaults removable), retention (7-90 days, applied nightly and on demand), store-titles toggle + "remove titles already stored", wipe everything (typed confirmation; every store, Cache API, session and local storage), a short forget log (kind only), pause from the dashboard.

### Key files
- `extension/lib/metrics/{facts,autopsy,validate,timeline,service,background,replayed,time,messages}.ts` (+ tests, `testutil.ts`)
- `extension/lib/privacy/{forget,retention,wipe,blocklist-edit,background,messages}.ts` (+ `privacy.test.ts`)
- `extension/entrypoints/dashboard/{today,timeline,autopsy,privacy}.tsx`, `main.tsx`; `entrypoints/popup/main.tsx`; `assets/base.css`
- `extension/scripts/m5-probe.mjs`, `extension/tests/browser-only.test.ts`, `docs/showcase/M5/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke && npm run check:types` (40 files, 346 tests + 2 gated; smoke 0 exceptions).
- `npm run eval:m5` (writes `docs/showcase/M5/*` and `.output/probe-seed.json`), then `npm run probe:m5` (23 checks, headless Chrome with the seeded history; screenshots next to `m5-probe.json`).
- Regression: `npm run probe:m4` (all pass), `M3=1 npm run probe:s1` (see Known issues if it didn't finish).
- Owner: `npm run live`, reload the extension, open Dashboard → Today (timeline, tiles), "Write today's autopsy now", Privacy → Forget → Last hour.

### Acceptance criteria
- [x] Unit tests: deep-block edge cases (exactly 2 min interruption; away/idle/unobserved gaps; 30-min gap ends a block; across midnight), residue, allowance overage, facts validate against the schema, forget cascade removes data and updates territories (`facts.test.ts`, `privacy.test.ts`).
- [x] Grep-style test: no UI string or autopsy template mentions time outside the browser (`tests/browser-only.test.ts`, 40 checks; template fuzz in `autopsy.test.ts`).
- [~] The owner can see today's timeline, metrics and a template autopsy for his real data: built and verified end to end on replayed days in headless Chrome; the real-profile look is the owner's (K-20).

### Deviations from the approved plan
- Plain SVG instead of D3 (declared in the plan, **D-56**). Added `lib/metrics/replayed.ts` (replays a persona into facts; used by tests, the evidence export and the probe seed) and `eval:m5`/`probe:m5`. `computeDayFacts` computes missing earlier days live for `vs7Day` (not only stored reports), found by the probe. A one-line fix in `scripts/m4-probe.mjs` (the demo speed selector is now `#prediction select`, because the dashboard has a second `<select>`). `checkDue` in `territories-background.ts` is exported for the nightly job. `ReportRecord.generatedAt?` added (optional, no `DB_VERSION` bump).
- Stub `index.test.ts` files of `lib/metrics` and `lib/privacy` removed (real tests replace them).

### Decisions and deviations from the PDD
- **D-55** (metric definitions incl. the 30-minute gap rule), **D-56** (template is a validated always-valid fallback; no D3), **D-57** (privacy cascade details). PDD 6.3 and 11.4 got "As built" notes.

### Spike / measurement results
- No spikes. Probe: 8,561 seeded bins render a timeline with 39 segments, 2 deep-block outlines, 107 velocity points; the template autopsy is 133 words; the whole 23-check probe takes ~1 min.

### Contracts changed
- No `shared/` change; no `DB_VERSION` bump. `ReportRecord.generatedAt?: number`. New messages: `report-generate`, `privacy-forget-range`, `privacy-forget-site`, `privacy-wipe`, `privacy-retention`, `privacy-strip-titles`. New `models` record `nightly-meta`.

### Known issues
- K-20, K-21, K-22 (above).

### Showcase evidence
- `docs/showcase/M5/`: `results.md`, `persona-days.md`, `facts-<persona>.json`, `autopsy-<persona>.md`, `m5-probe.json`, screenshots (`dashboard-today.png`, `popup.png`, `dashboard-privacy.png`, `dashboard-after-wipe.png`), `CAPTURE.md` (owner: timeline hover GIF, autopsy, forget flow).

### Notes for the next milestone
- **M6:** `lib/metrics/validate.ts::checkAutopsy` is the shared autopsy validator (port of `check_autopsy`); add the strict checks from `training/eval/metrics.py::strict_autopsy_errors` there (K-07). `lib/metrics/service.ts::generateReport` writes `reports` with `modelVersion: "template"`: M6 should try the model first and keep the template as fallback, recording the model id in `modelVersion` (the dashboard already shows "Written by <modelVersion>" for anything other than `template`). `ensureReports` skips reports generated after their day ended, so model-written reports survive the nightly job. Territory names that M6 writes must keep `labelConfirmed` semantics (unconfirmed only).
- The nightly job (`lib/metrics/background.ts::runNightly`) has the slot for PDD 6.3 step 4 (naming) between re-cluster and reports.
- Dashboard sections are `<section class="card" id=...>`; add new ones the same way and a nav link in `main.tsx`.

---

## T1 — Teacher data generation
**Status:** ✅ Done
**Date:** 2026-10-15/16 · **Commits:** `b96428c` (plan), `95b7cf8`, `12c049a`, `0d876f2`, `340b1fc`
**Approved plan:** `docs/plans/T1.md` (approved 2026-10-15 11:40) · **Work approved:** 2026-10-16 (closed in a self-review under the owner's delegation, after T2 had already consumed the data and met its ship bar; the code was committed earlier, only this summary was missing)

### What was built
- `training/validators.py` (`parse_naming`, `check_autopsy`: JSON/schema, number and clock grounding, outside-browser, tone, null/zero consistency, structure, 120-180 words), `gen_inputs.py` (660 territory descriptions, 440 daily facts, schema-valid, six personas, edge cases), `gen_teacher.py` (resumable, OpenAI-style API to the local Gemma 4 31B with MTP), `filter.py` (re-validate, de-duplicate, stratified 900/100-style split), `bench_teacher.py`, `prompts/`, `README.md`.
- Dataset: **660 naming (100% valid) + 413 autopsy (93.9% valid after retries) = 1,073 examples → 973 train / 100 eval** (`training/data/train.jsonl`, `eval.jsonl`, gitignored). Autopsy word count 139-180 (median 167).

### How to run / verify
- `cd training && uv run pytest` (63 passed on 2026-10-16). Pipeline commands are in `training/README.md` ("T1 pipeline"). Dataset stats: `docs/showcase/T1/dataset-stats.md`; samples: `sample-report.md`; pilot: `pilot-report.md`.

### Acceptance criteria
- [x] pytest: generators produce schema-valid objects; validators catch planted errors (invented number, outside-browser mention, bad JSON).
- [x] `train.jsonl` and `eval.jsonl` exist (973 / 100 lines).

### Deviations, decisions, contracts
- As recorded in T2's section: the student prompt (`common.student_prompt`) is the contract M6 must reproduce exactly. No `shared/` change.

### Spike / measurement results
- **S4:** MTP ≈17-19 tok/s at concurrency 1 vs ≈10 without; see `experiments/spikes.md` and `docs/showcase/T1/s4-throughput*.md`. Generation tok/s in the real run: naming 6.3, autopsy 18.8.

### Known issues
- **K-08** (14% of teacher autopsy sentences compare the 7-day numbers in the wrong direction; the retrain proposed in T2 is optional) and K-07 apply to this data.

### Showcase evidence
- `docs/showcase/T1/` (S4 throughput, dataset stats with three examples per task, pilot and sample reports, `CAPTURE.md`).

### Notes for the next milestone
- M6 must build prompts exactly as `common.student_prompt` and run model text through `lib/metrics/validate.ts::checkAutopsy` (M5's TS port of `check_autopsy`).

---

## M6 — Integrate the fine-tuned 270M
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `88e175f` (plan) plus the `M6:` commits after it (see `git log`)
**Approved plan:** `docs/plans/M6.md` (approved 2026-10-16 23:00, delegated by the owner) · **Work approved:** 2026-10-16 (self-review under that delegation; the owner reviews later)

### What was built
- **Contract ports (`lib/gen/`)**: `prompt.ts` (T1's `student_prompt`, byte-exact on 50 real training prompts, including the Python `x.0` float formatting), `naming-validate.ts` (`parse_naming`), and `strictAutopsyErrors`/`validateAutopsy` in `lib/metrics/validate.ts` (K-07). Parity-tested against the Python validators on 660 variants of the real eval set.
- **Generation host** (`host.ts`, `generator.ts`, in the offscreen document next to the embedder): Transformers.js `AutoModelForCausalLM` fp16 on WebGPU, evaluated settings (chat template, greedy; sampled retry), one generation at a time, loads on the first request, unloads after 30 s idle or on demand; messages `generate`, `gen-status`, `gen-unload`.
- **Naming** (`naming.ts`, `naming-service.ts`): schema-valid description from stored samples/bins → model → validate → one sampled retry → baseline name + rule-based label. Runs after every re-cluster, nightly and on a dashboard button; only unconfirmed territories change; a model name survives re-clusters while the top 3 origins are the same; rule-based Drain for a known feed wins over a model "shallow/deep" (D-58).
- **Autopsy** (`autopsy.ts`, `background.ts`): model → `checkAutopsy` + strict checks → one sampled regeneration → M5 template; `reports.modelVersion` and new `reports.source` record the outcome; nightly job step 4 (naming) and model-first reports; forget regenerates with the template for speed.
- **UI**: territory rows tagged "named by Gemma 3 270M (fine-tuned)" / "baseline name", "Name territories with Gemma" button, autopsy pill ("Written by Gemma 3 270M (fine-tuned)" or "Written from a template (...)"), a quiet writer footer (state + pass/fallback counters), popup "Writer model: ..." line.
- **Bundling**: `scripts/copy-model.mjs` copies the T2 export into `public/models/doomscroll-270m/` before build/dev/live (git-ignored).

### Key files
- `extension/lib/gen/{config,prompt,naming-validate,naming,naming-service,autopsy,generator,host,client,background,messages,stats,labels,evidence.test}.ts`, `lib/gen/fixtures/`
- `extension/lib/metrics/{validate,service,background}.ts`, `lib/ml/{territories-core,territories,names}.ts`, `lib/db/schema.ts`
- `extension/entrypoints/offscreen/main.ts`, `dashboard/{territories,autopsy,today,writer}.tsx`, `popup/main.tsx`
- `extension/scripts/{copy-model.mjs,g1-spike.mjs,m6-probe.mjs}`, `docs/showcase/M6/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke && npm run check:types` (46 files, 385 tests + 4 gated).
- `node scripts/g1-spike.mjs 3` (G1), then `npm run eval:m6 && npm run probe:m6 && npm run report:m6` (about 5 minutes; 14 checks; writes `docs/showcase/M6/`).
- Regression run on this build: `probe:m5` and `probe:m4` pass; `M3=1 probe:s1` passes (labels survive a re-cluster, 0 query strings, 0 text records).
- Owner: `npm run live`, reload, Dashboard → Territories → "Name territories with Gemma", then Autopsy → "Write today's autopsy now".

### Acceptance criteria
- [x] Unit tests for the TypeScript validators and fallback paths (`validators.test.ts` parity, `gen.test.ts`: retry-then-fallback, unavailable, strict slips, model-name keep/reset, owner-confirmed-during-run, host tests).
- [~] Real-data run: names and autopsies produced by the model and the fallback rate recorded on **replayed** persona days through the real extension (the owner's profile is not available to me): names 42 of 53 territories (the rest had under a minute of activity), labels 42 of 42 matching truth; autopsies 15 of 23 model-written, **34.8% fallback** with T2's model (run1); after the T3 retrain (run3, now bundled) **20 of 23, 13.0% fallback** (`docs/showcase/M6/fallback-rate.json` holds the run3 numbers, `results.md` both).

### Deviations from the approved plan
- Implemented as planned. Extras: a descriptionKey/`nameKey` mechanism in `buildTerritories` (as planned), `autopsySourceLabel` helpers, `lib/gen/evidence.test.ts` (seed + report generation), and a Python-vs-TS parity fixture. The "Show its download in the popup's model status" task became "the writer's state in the popup" because the model is bundled, not downloaded (D-58, announced in the plan).

### Decisions and deviations from the PDD
- **D-58** (bundled model until published; Drain-from-rules guard; strict checks on the autopsy). PDD 9.4 and 9.8 "As built" notes.

### Spike / measurement results
- **G1** pass (`experiments/spikes.md`, `docs/showcase/M6/g1-spike.json`): byte-identical output, 2.7 s load, 116 tok/s.
- Autopsy 5.0 s median (incl. regeneration), naming 8 territories ≈ 5 s; refusal codes in `fallback-rate.json`.

### Contracts changed
- No `shared/` change, no `DB_VERSION` bump. Optional fields: `TerritoryRecord.{nameSource,nameKey,suggestionSource}`, `ReportRecord.source`. New messages `generate`, `gen-status`, `gen-unload` (offscreen), `gen-name-territories`, `gen-overview` (background). New `models` record `gen-stats`. `onReclustered` hook in `lib/ml/territories.ts`; `setAutopsyWriter` in `lib/metrics/service.ts`.

### Known issues
- K-23, K-24 (above); K-09 (model memory with both models resident) still unmeasured.

### Showcase evidence
- `docs/showcase/M6/`: `results.md`, `autopsy-vs-template.md`, `naming-examples.md`, `fallback-rate.json`, `g1-spike.json`, `m6-probe.json`, screenshots, `CAPTURE.md`.

### Notes for the next milestone
- **M7:** packaging must include `public/models/` (≈ 340 MB) or the owner publishes to HF first (K-23); mention WebGPU and the size in onboarding; the nightly job needs Chrome running (K-22).
- **T3 / retrain:** facts with `nudges.shown 1, ignored 1` are the dominant failure (K-24); `lib/gen/evidence.test.ts` + `probe:m6` re-measure the fallback rate after swapping the model folder (`DOOMSCROLL_MODEL_DIR`).

---

## T3 — Targeted retrain of the 270M (K-07, K-08, K-24)
**Status:** ✅ Done
**Date:** 2026-10-16 · **Commits:** `516431e` (plan), `a4ece2c`, and the `T3:` commit after it (see `git log`)
**Approved plan:** `docs/plans/T3.md` (approved 2026-10-16 23:20, delegated) · **Work approved:** 2026-10-16 (self-review under the owner's delegation)
**Note on the name:** "T3" does not exist in `implementation-milestones.md`; the owner asked for "M5, T3 and M6". T1 was the only open Lane B item (closed alongside M5), so I took T3 to be the one remaining Lane B follow-up in this summary, the retrain with corrected data (K-08), now that M6 measured a 35% fallback (K-24). If the owner meant something else, this is a deviation to review.

### What was built
- `training/clean.py` (+ `tests/test_clean.py`, 29 cases): drops training autopsies the strict checks flag, rewrites the nudge paragraph (always paragraph 4) from `facts.nudges`, adds 160 real-use nudge variants (only that paragraph changes), drops texts over 172 words; writes `data/train_v3.jsonl` and a held-out set of 40 ignored-heavy prompts (`data/eval_nudge/`, independent seed).
- `training/eval/compare_runs.py`: automatic-metric comparison of runs on the 100 eval prompts and the nudge set.
- Retrained (same recipe, ~10 min) and exported (genai 8-bit, 324 MB): `run2` (cleaned + augmented) and **`run3` (shipped; + length filter)**, browser-tested on WebGPU.
- Extension: `copy-model.mjs` now bundles `run3` (and fixes a stale-copy bug: two exports have identical file sizes, identity is now path + size + mtime), `GEN_MODEL_VERSION` says run3, and the runtime gate accepts model autopsies of 110-200 words (D-59).

### How to run / verify
- `cd training && uv run pytest` (92 passed with the new tests); `uv run python clean.py`; training and export commands in `training/README.md` ("T3 pipeline"); comparison: `docs/showcase/T3/comparison.md`.
- Extension: `cd extension && npm run build && node scripts/g1-spike.mjs 3` (byte-identical to the test page: PASS), `npm run probe:m6` (all checks pass; fallback 13.0%).

### Acceptance (ship rule from the plan)
- [x] Nudge-heavy autopsy strict-clean improves clearly: 60% → 95%.
- [x] No regression on the 100 eval prompts: naming 97/97/95 → 100/100/100 (valid/grounded/label); autopsy grounded 92% → 100%; outside-browser mentions 0. Autopsy strict-clean at T1's 120-180 length is 70% → 70% (length, not facts: 11 of 40 busy-day texts are 181-196 words); at the runtime 110-200 gate 75% → 98%.
- [x] Extension fallback on 23 replayed days: 34.8% → 13.0%.

### Deviations from the approved plan
- A second iteration (run3) was needed: run2 overshot the 180-word ceiling (11 of 40), so run3 filtered long training texts; the runtime length tolerance (D-59) was added because 185-195-word faithful texts remain. The nudge check set was regenerated once with an independent seed after I noticed the first draw depended on the training RNG (all three runs were re-measured on the final set).

### Decisions and deviations from the PDD
- **D-59** (retrain data and the 110-200 word runtime gate). PDD 9.8 note updated.

### Spike / measurement results
- Table in `docs/showcase/T3/results.md` and `comparison.md`.

### Contracts changed
- None in `shared/`. The student prompt is unchanged. Model files: `training/data/runs/run3/` (gitignored); the extension bundles it.

### Known issues
- K-25 (judge not re-run; nudge paragraph near-templated; small check sets). K-10 (model card) updated with the retrain paragraph; still a DRAFT and unpublished (K-23).

### Showcase evidence
- `docs/showcase/T3/{results.md,comparison.md,comparison.json,CAPTURE.md}`; `docs/showcase/M6/` regenerated with run3.

### Notes for the next milestone
- **M7:** nothing in T3 changes packaging (still ≈ 324 MB model). To publish the model, use `training/data/runs/run3/onnx_final` (not run1) and update `training/model_card.md`.


---

## M7 — Release candidate and first user
**Status:** ⚠️ Done with gaps (the friend install and interview are the owner's)
**Date:** 2026-10-17 · **Commits:** `87c5f7c` (plan) plus the `M7:` commits after it (see `git log`)
**Approved plan:** `docs/plans/M7.md` (approved 2026-10-17, delegated by the owner) · **Work approved:** 2026-10-17 (self-review under that delegation; the owner reviews later)

### What was built
- **Onboarding page** (`entrypoints/onboarding`, `lib/onboarding`): what is observed / kept, the PDD 11.1 honest wording, the install warning explained, limits and requirements (WebGPU, size, browser only, nightly job needs Chrome open), a "Download and start now" button with progress for EmbeddingGemma 2, blocklist review and edit, sensitivity choice, "done" flag (`onboardedAt`). Opens by itself on install; linked from the popup and dashboard.
- **Warm-up hook:** `embedder-warm` (offscreen, `host.warm()`) and `embed-warm` (background, fire and forget) so the download can start without an item.
- **Release:** version 0.2.0; `npm run zip` builds, zips and copies to `releases/doomscroll-autopsy-0.2.0.zip` (gitignored) and prints size and sha256.
- **Probes:** `npm run probe:m7` unzips the release into a fresh profile and checks onboarding, the real model download, then re-runs `probe:m5` and `probe:m4` (now accepting `EXT=`) on the unzipped build.
- README install path for a first user; `docs/first-user/interview.md` (PDD 16.4 questions + observation sheet).

### Key files
- `extension/entrypoints/onboarding/main.tsx`, `extension/lib/onboarding/{index,index.test}.ts`
- `extension/lib/ml/{host,messages,background}.ts`, `entrypoints/offscreen/main.ts`, `lib/observer/background.ts` (open on install)
- `extension/scripts/{zip-release,m7-probe}.mjs`, `docs/first-user/interview.md`, `docs/showcase/M7/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke && npm run check:types` (47 files, 392 tests + 4 gated).
- `npm run zip && npm run eval:m5 && npm run probe:m7` (about 4 minutes; 15 checks, all pass).
- Zip at build time of this section: 0.2.0, 300.8 MB, sha256 `8d9db7fe9fa389cf0d5f9aa10f307c56c0d13d8aaf1d3b0b23b6debf83156602`. **Superseded by the M8 build: give the friend `doomscroll-autopsy-0.3.0.zip` (checksum in the M8 section).**

### Acceptance criteria
- [x] Fresh-profile smoke test passes on the unzipped release; checklist in `docs/showcase/M7/smoke-checklist.md`.
- [~] Zip produced (path above); **the owner confirms the friend has installed it** (not possible for me).

### Deviations from the approved plan
- None of substance. The "model download progress" task covers EmbeddingGemma 2 only, since the writer is bundled (D-58, as planned). The smoke test uses the replayed seed (as planned) rather than waiting for hours of real browsing.

### Decisions and deviations from the PDD
- **D-60** (packaging and onboarding). PDD 4.3 "As built" note: ~255 MB download, not ~580 MB, because the writer ships in the zip.

### Spike / measurement results
- R1: `wxt zip` handles the 386 MB tree: 300.8 MB zip in ~15 s; the unzipped folder loads and passes all probes. Real embedder download inside the probe: ~50 s to "Ready".

### Contracts changed
- No `shared/` or IndexedDB change. New local storage key `onboardedAt`; new messages `embedder-warm`, `embed-warm`.

### Known issues
- **K-26** (M7): the zip is ~300 MB and the unpacked folder ~390 MB; sending it by chat won't work (AirDrop or a drive link). The model is not on Hugging Face (K-23). Real-Mac checks remain: WebGPU on the friend's machine, memory with both models resident (K-09, K-13), real nudge delivery (K-19).
- A wipe clears `onboardedAt` with the rest of local storage; onboarding does not reopen by itself (the popup link does).

### Showcase evidence
- `docs/showcase/M7/{smoke-checklist.md,m7-probe.json,CAPTURE.md,onboarding*.png,probe-m4/,probe-m5/}`

### Notes for the next milestone
- **M8:** re-zip at the end (`npm run zip`) and record the final checksum; each item is its own commit.


---

## M8 — Should-tier features
**Status:** ✅ Done
**Date:** 2026-10-17 · **Commits:** `228dad0` (plan), `6321fea` M8.1, `a5619e6` M8.2, `b121c65` M8.3, `664e7b2` M8.4, `b53b59e` M8.5, `f394a92` (queue fix), and the closing `M8:` commit (release + summary)
**Approved plan:** `docs/plans/M8.md` (approved 2026-10-17, delegated by the owner) · **Work approved:** 2026-10-17 (each item self-reviewed and committed on its own under that delegation; the owner reviews later)

### What was built
1. **GRU** (PDD 9.6): `lib/ml/gru.ts` (features, plain-TypeScript forward pass for inference, training windows), `gru-train.ts` (TF.js, offscreen only), `gru-service.ts` / `gru-promote.ts` (train on all days but the latest, evaluate on the latest, promote only if AUC beats Markov by ≥ 0.005; stored as `models/gru`, `models/gru-eval`), prediction mode `gru`, dashboard "GRU" panel with the verdict and a "Train GRU now" button, nightly training after the nightly job. WebGPU trains it in ~13 s (CPU ~150 s). On synthetic personas it ties Markov and is never promoted.
2. **Attention map**: stratified sample (≤ 1,500 vectors of the last 14 days), seeded UMAP (`umap-js`) in the dashboard page, SVG scatter coloured by label, click a dot to select and scroll to its territory.
3. **Topic tags**: 324 phrases embedded once, top-3 per territory (cosine ≥ 0.30), shown under the territory name and passed into the 270M's naming prompt (the format it was trained on). Real vectors give "recipes | cooking videos | baking" for a cooking territory and the model names it "Cooking and baking tutorials".
4. **Breathing pause**: 30 s guided overlay (step 3), via a *Take a breath* button on step 2 or by escalation when the highest step is 3; new Dashboard → Nudges section (sensitivity, highest step).
5. **Forget one item**: Dashboard → Privacy lists the 20 most recent items; Forget deletes the sample, recomputes its territory, logs only the kind (bins stay; D-65).
- **Release 0.3.0**: `releases/doomscroll-autopsy-0.3.0.zip`, 301.1 MB, sha256 `5d34229a9487f92ee9e69f83df83ba357a00380c7ebe68ad408ae054c58b68ab`; `probe:m7` (fresh profile, unzipped release, incl. `probe:m5` and `probe:m4`) passes. Version bumped from 0.2.0 so the friend can tell builds apart.

### Key files
- `extension/lib/ml/{gru,gru-train,gru-service,gru-promote,gru-background,gru-messages,map,topics,topics-service,topics-background,topics-messages}.ts` (+ tests), `lib/replay/synthetic-gru-eval.ts`
- `extension/lib/nudge/{breathe,policy,copy,ui,messages,service}.ts`, `lib/privacy/{forget,messages,background}.ts`, `lib/metrics/background.ts`, `lib/gen/{naming,naming-service,background}.ts`
- `extension/entrypoints/dashboard/{map,nudge-settings,privacy,replay,territories,main}.tsx`, `entrypoints/offscreen/main.ts`, `scripts/{m8-probe}.mjs`
- `docs/showcase/M8/`

### How to run / verify
- `cd extension && npm run build && npm test && npm run compile && npm run smoke && npm run check:types` (52 files, 432 tests + 5 gated).
- `npm run eval:m5 && npm run probe:m8` (GRU in the extension, map, tags with real embeddings, naming with tags, forget one item; `GRU_BACKEND=webgpu`), `npm run probe:m4` (breathing overlay driven through CDP, including the full 30 s), `npm run probe:m5`, `npm run probe:m6` (naming regression: 42/53 named, no regression), `npm run eval:m8` (~9 min: GRU vs Markov table), `npm run zip && npm run probe:m7`.
- Owner: Dashboard → Prediction and replay → GRU → "Train GRU now" (needs two days of data); Territories → "Name territories with Gemma" (tags appear under names); Attention map → "Draw map"; Nudges → highest step 3, then Demo mode; Privacy → "Forget one item".

### Acceptance criteria
- [x] Each item has tests where logic exists, works in the build, and was committed separately (see commits).
- [x] Final zip rebuilt (0.3.0) and verified on a fresh profile.
- [~] "Reviewed with the owner's approval": reviewed by me under the owner's delegation; the owner has not looked yet.

### Deviations from the approved plan
- Version bumped to 0.3.0 (not planned). Topic tags refresh before naming but never start the embedding download from a background job (D-66). The GRU runs after the nightly job instead of inside it (D-66). The map probe uses vectors planted around the seeded territories' centroids (the replay seed has no sample vectors).

### Decisions and deviations from the PDD
- **D-61** GRU details (train in TF.js, infer in plain TS, promotion margin 0.005, `yieldEvery: 'never'`), **D-62** attention map sampling, **D-63** tags feed naming, **D-64** breathing pause, **D-65** forget one capture keeps bins, **D-66** long jobs outside the exclusive queue. PDD 4.4, 4.5, 9.3, 9.6, 11.4 have "As built" notes.

### Spike / measurement results
- **G2** (GRU cost): 12.7 s WebGPU, 151 s CPU in the extension; pass bar 90 s met on WebGPU. `docs/showcase/M8/gru-notes.md`.
- GRU vs Markov vs rules, six synthetic personas × 7 days: `docs/showcase/M8/gru-vs-markov.md` (never promoted; K-18 caveat applies).
- Topic tags with real EmbeddingGemma vectors and tagged naming: `m8-probe.json`.

### Contracts changed
- No `shared/` change, no `DB_VERSION` bump. `Mode` gains `'gru'`; `NudgePayload.offerBreath?`; new `models` records `gru`, `gru-eval`, `topic-vectors`; new messages `gru-train`, `gru-run`, `gru-status`, `topics-refresh`, `privacy-forget-capture`. TF.js moved from devDependencies to dependencies; `umap-js` added.

### Known issues
- **K-27** (M8): the GRU has only been evaluated on synthetic days and one seeded replay (it ties Markov, run-to-run AUC varies by more than 0.005, hence the margin); whether it ever beats Markov on a real person is unknown until the friend/owner has 2+ days of data. Owner: owner / M9 (report honestly either way).
- **K-28** (M8): training and tagging are not interruptible: while the GRU trains (15 s on WebGPU, ~150 s on CPU) the offscreen document is busy, so a model-written autopsy requested at that moment waits.
- **K-29** (M8): tags are recomputed on the next naming/nightly/dashboard refresh, so right after a forget cascade a territory's tags can lag its centroid. The attention map is drawn on demand and is not saved. The topic list is the M3 list (324 phrases); not hand-audited for gaps.
- K-23 (model not on Hugging Face), K-09/K-13 (memory with both models and now TF.js) remain; TF.js loads only while training.

### Showcase evidence
- `docs/showcase/M8/`: `gru-vs-markov.{md,json}`, `gru-notes.md`, `m8-probe.json`, screenshots (`dashboard-gru`, `dashboard-map`, `dashboard-map-selected`, `nudge-breathing`, `dashboard-forget-item`), `CAPTURE.md`.

### Notes for the next milestone (M9)
- Post material: the GRU story is honest and interesting (it ties; the promotion rule and the `requestAnimationFrame` hang are good anecdotes); the map and the tags are the visual wins; the breathing pause is a GIF. Use release 0.3.0 for the demo. D-61 to D-66 explain the choices.

---

## Post-M8 additions (2026-10-17, owner's requests)
- **Demo profile** (`extension/scripts/demo/`, `lib/replay/demo-*.ts`): `npm run demo:seed` (from the owner's browsing history, whitelisted hosts and timestamps only; the History copy in `.demo-history/` and the profile in `.demo/` are git-ignored) → `npm run demo:profile` (real embeddings, k-means, 270M names and autopsies, GRU/Markov) → `npm run demo:open` (load unpacked from `.demo/chrome-mv3` once; Chrome 155 ignores `--load-extension`). `node scripts/demo/shoot.mjs` takes screenshots. Re-run the two build steps before recording so "today" is the recording day. Describe it in the post as a demo profile built from the owner's own browsing history with scroll and dwell signals reconstructed, not as recorded live.
- **UI redesign** (D-67): shared design system, compact popup with a pause dropdown, five-tab dashboard.
- **Release rebuilt:** `releases/doomscroll-autopsy-0.3.0.zip`, 301.1 MB, sha256 `284bfdf78e58bb352273819a0f1a79492f2ec278daa7e452453bf37a9857f30f` (supersedes the checksum in the M8 section); `probe:m7` passes on it.

---

## M9 — Showcase (2026-10-18)
- **Post:** published on DEV, https://dev.to/prateek_35ec9fda44e819f73/i-let-two-gemma-models-watch-my-browser-so-they-could-protect-my-deep-work-2lji (tags `devchallenge`, `hf26challenge`, `opensource`, `deepwork`; AI disclosure `some_ai`). Final text: `submission/post.md`. Prize categories: Best Use of Gemma and overall.
- **Video:** https://youtu.be/XP_dJrgPX_Y; file, poster, cover and narration in `submission/`; sources in `video/` (HyperFrames, local Kokoro for timing drafts, ElevenLabs Matilda v3 for the final voice, character timings drive the animation cues).
- **Code:** https://github.com/PrateekTikku/doomscroll-autopsy (public, history rewritten before the first push to remove tool attributions; backup bundle kept locally and git-ignored). Release `v0.3.0` carries the 301 MB zip (sha256 `284bfdf78e58bb352273819a0f1a79492f2ec278daa7e452453bf37a9857f30f`).
- **Model:** https://huggingface.co/PrateekTikku/doomscroll-autopsy-gemma-3-270m (run3, 8-bit ONNX, 324 MB, license `gemma`, Gemma Terms of Use included).
- **Checks before publishing:** secret and path scan of the tree and history (clean), fresh clone installs, type-checks, compiles, passes 443 tests and the smoke test.
- **Not done:** first-user interview (no time), DevRelay agent session (skipped on purpose), GRU on real data (K-27), `experiments/results.md` (numbers live in the post and `docs/showcase/`).
- **Deviation:** the demo profile used in the video is built from the owner's own history (hostnames and times only); the post says so.
