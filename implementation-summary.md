# Doomscroll Autopsy — Implementation Summary

> The shared memory between AI chats. **Read all of it before starting a milestone.** Write your section **only after the owner has approved your finished work** (`implementation-milestones.md` 0.7): then update the status table and **append** your section at the bottom using the template. Never rewrite or delete another milestone's section; if something in it is now wrong, add a correction in your own section.

## Status

| Milestone | Status | Chat finished | Showcase level reached | Notes |
|---|---|---|---|---|
| Planning | ✅ Done | 2026-10-15 | — | PDD v2, milestone plan, workflow skills |
| M0 Scaffold + contracts | ✅ Done | 2026-10-15 | — | WXT + Preact scaffold, IndexedDB v1, settings in chrome.storage.local (D-52), shared schemas v1, uv project |
| M1 Observer + bins | ⬜ Not started | | | |
| M2 Embedding engine | ⬜ Not started | | | |
| M3 Territories + labeling | ⬜ Not started | | L1 | |
| M4 Prediction + nudges + replay | ⬜ Not started | | L2 | |
| M5 Metrics + dashboard + privacy | ⬜ Not started | | L3 | |
| T1 Teacher data | 🟡 In progress | | | Plan approved; Phase A pilot (10 examples) first. docs/plans/T1.md |
| T2 Fine-tune + ONNX | ⬜ Not started | | | |
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
