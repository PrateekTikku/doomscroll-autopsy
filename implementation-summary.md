# Doomscroll Autopsy — Implementation Summary

> The shared memory between AI chats. **Read all of it before starting a milestone.** Write your section **only after the owner has approved your finished work** (`implementation-milestones.md` 0.7): then update the status table and **append** your section at the bottom using the template. Never rewrite or delete another milestone's section; if something in it is now wrong, add a correction in your own section.

## Status

| Milestone | Status | Chat finished | Showcase level reached | Notes |
|---|---|---|---|---|
| Planning | ✅ Done | 2026-10-15 | — | PDD v2, milestone plan, workflow skills |
| M0 Scaffold + contracts | ✅ Done | 2026-10-15 | — | WXT + Preact scaffold, IndexedDB v1, settings in chrome.storage.local (D-52), shared schemas v1, uv project |
| M1 Observer + bins | ✅ Done | 2026-10-15 | — | Generic observer, 30 s bins and samples in IndexedDB, pause + badge, popup live counts, dev recorder, S1 headless pass; owner's daily profile runs `.live/chrome-mv3` |
| M2 Embedding engine | ✅ Done | 2026-10-16 | — | EmbeddingGemma 2 (q4f16, WebGPU) in the offscreen document: text 16 ms, image 213 ms median; vectors (256d) written to samples; S2/S3 pass; no WASM fallback. docs/plans/M2.md |
| M3 Territories + labeling | ⬜ Not started | | L1 | |
| M4 Prediction + nudges + replay | ⬜ Not started | | L2 | |
| M5 Metrics + dashboard + privacy | ⬜ Not started | | L3 | |
| T1 Teacher data | 🔍 Awaiting owner review | | | 1,073 valid examples (660 naming, 413 autopsy) split 973 train / 100 eval in `training/data/`; S4 resolved (MTP ≈17–19 tok/s, concurrency 1). docs/plans/T1.md |
| T2 Fine-tune + ONNX | 🟡 In progress | | | docs/plans/T2.md |
| M6 Integrate 270M | ⬜ Not started | | L4 | |
| M7 Release + first user | ⬜ Not started | | L5 | |
| M8 Should-tier extras | ⬜ Not started | | L6 | |
| M9 Showcase | ⬜ Not started | | | |

Status values: ⬜ Not started · 📝 Plan awaiting approval · 🟡 In progress (plan approved) · 🔍 Awaiting review · ✅ Done · ⚠️ Done with gaps · ❌ Blocked

## Current showcase level
**None yet.** (Update this line whenever a milestone raises the level; see `implementation-milestones.md` 0.4.)

## Known issues and open follow-ups
(Each entry: ID, found in, description, suggested owner milestone.)

- **K-01** (M0): Ajv can't compile schemas at runtime under the MV3 CSP (`new Function`). Runtime validation of model output or facts must use Ajv standalone code or hand-written validators. Owner: M5, M6.
- **K-02** (M0): `ensureOffscreenDocument()` uses `reasons: ['WORKERS']` as a placeholder; confirm the right reason in S2 (V-07). Owner: M2.
- **K-03** (M0): no extension icons yet (Chrome shows a letter). Owner: M7.
- **K-04** (M1): S1 per-site item counts for logged-in Instagram (feed, Reels), X and Reddit are not recorded; headless probes can't reach them. Record them in `experiments/spikes.md` when the owner checks (steps there). Owner: owner, any Lane A chat.
- **K-05** (M1): the open 30 s bin is lost when Chrome quits (state lives in `chrome.storage.session`). Up to 30 s per browser session. Owner: M5 if it matters for metrics.
- **K-06** (M1): `chrome.idle` uses a 120 s threshold, so up to 120 s at the start of each idle stretch counts as active. Owner: M5 (account for it in metrics, or lower the threshold).
- **K-11** (M2): without WebGPU there are no embeddings at all (quantized models have no CPU kernels; S2). The popup says "unavailable" and samples stay vectorless. Owner: M7 (mention in onboarding / requirements).
- **K-12** (M2): not every sample gets a vector, by design: items above 20 embeds/min are sub-sampled, and a visual item with no text and no free screenshot slot (1 per 3 s) is skipped. In a scripted run 93% had vectors (100% of those with input). M3 must assign territories to vectorless samples by carrying the previous item's territory (PDD 9.9). Owner: M3.
- **K-13** (M2): memory in the owner's real profile is unmeasured (about +1.3 GB in headless Chrome vs the 1.5 GB budget). The vision encoder stays loaded even for text-only use; loading it on the first screenshot would save part of that. The 10-minute idle unload is unit-tested only. The popup's `embed-status` reads today's samples (with vectors) every 4 s; fine now, heavy later. Owner: M7 / any Lane A chat.

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

