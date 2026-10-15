# Doomscroll Autopsy — Implementation Milestones

> **Who this is for.** Each milestone below is implemented by a **separate AI chat**. You (the AI) start with no memory of earlier chats. This file, `PDD.md` and `implementation-summary.md` are your memory. The owner (Prateek) orchestrates and does high-level review; he is not pair-programming with you.
>
> **Start every milestone with the `/start-milestone <ID>` skill and finish it with `/finish-milestone <ID>`.** The owner can run `/milestone-status` at any time.

---

## 0. Read this first

### 0.1 The product in one paragraph
**Doomscroll Autopsy** is a Chromium (MV3) browser extension for **Deep Workers**. It observes what you look at in the browser, embeds each item with **EmbeddingGemma 2**, clusters items into personal **territories** labelled **Deep / Shallow / Drain**, predicts when you're about to spiral into Drain beyond your daily allowance, nudges you inside the page, and writes a nightly **autopsy** with a **fine-tuned Gemma 3 270M**. Headline metrics: **deep blocks** and **attention residue**. Everything runs in the browser; nothing observed leaves the device. Full design: `PDD.md`. If anything here conflicts with the PDD, the PDD wins; raise the conflict with the owner.

### 0.2 Deadlines
- **Code freeze:** Sat **Oct 17, 2026 EOD**. Friend (first user) installs early afternoon Oct 17.
- **Submission:** DEV post published by **Sun Oct 18, 11:59 PM PDT**. Oct 18 is showcase work only (M9).

### 0.3 Global rules for every milestone
1. **Read before you write:** the agent instructions, `PDD.md` (at least sections 1, 4, 5 and the sections your milestone cites), `implementation-summary.md` (all of it), and your milestone section here.
2. **Stay in scope.** Do only what your milestone lists. If you find a bug in earlier work that blocks you, fix the minimum needed and record it in your summary. If you find something out of scope worth doing, list it under "Suggested follow-ups" in your summary instead of doing it.
3. **Don't re-decide.** Design decisions are in `PDD.md` section 17. Only change one if you're blocked; then stop, explain to the owner, and update the decision log if he agrees.
4. **Privacy rules are non-negotiable** (PDD section 11). Never persist item text, screenshots, or query strings. No network calls except model downloads from Hugging Face. No analytics.
5. **Keep `main` working.** At the end of your milestone, `npm run build` (in `extension/`) and all tests must pass, and the extension must load in Chrome without errors.
6. **File ownership.** Some milestones run in parallel (see 0.5). Only edit files your milestone owns or explicitly lists. Shared contracts in `shared/` change only in M0, or with a note in the summary plus a matching update in every consumer.
7. **Commits:** commit locally on `main`. Never push. Stage explicit paths only (never `git add -A` or `git add .`), because another chat may be working in the same folder. Commit message format: `M<id>: <summary>` with a short body, ending with the co-author trailer your harness specifies. Commit in small, logical steps; the final commit includes your `implementation-summary.md` entry.
8. **Tests:** TypeScript unit tests with **Vitest** (`extension/`). Python tests with **pytest** (`training/`). Every pure function you write (clustering, Hungarian, scoring, facts, validators) gets tests.
9. **Showcase evidence:** every milestone saves material for the post in `docs/showcase/<milestone-id>/`: numbers, short notes, and a `CAPTURE.md` listing screenshots or GIFs the owner should take (you can't take them yourself unless you have a browser tool).
10. **Ask the owner only when:** you're blocked, the PDD is ambiguous on something that matters, or an action is outward-facing (publishing to Hugging Face or DEV, which always need his explicit yes).
11. **When you finish,** report to the owner: what works, what doesn't, what to review (a short checklist), and what the next milestone needs to know.

### 0.4 Showcase ladder: what we can submit if we stop early
Milestones are ordered so the product is always submittable. Each level is a complete, honest story.

| Level | Reached after | What we could submit |
|---|---|---|
| **L1** | M0–M3 | "Gemma sees my browsing": in-browser EmbeddingGemma 2 turns browsing into personal territories; shows one domain split into Deep and Drain. Weak on "would pay" but valid for Best Use of Gemma |
| **L2** | + M4 | A working product loop: observe → embed → territories → predict (rules + Markov) → in-page nudges. Credible entry |
| **L3** | + M5 | Full product without the fine-tune: deep blocks, attention residue, template autopsy, privacy controls, dashboard. Strong entry |
| **L4** | + T1, T2, M6 | Full Gemma story: fine-tuned Gemma 3 270M names territories and writes the autopsy, with a measured before/after |
| **L5** | + M7 | Packaged, used by a real first user, with interview results (challenge bonus) |
| **L6** | + M8 | Should-tier extras: GRU, attention map, topic tags, breathing step |

**M9 (showcase) always runs on Oct 18**, whatever level we reached.

### 0.5 Order, parallel lanes and suggested calendar
```
Lane A (extension):  M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → (M8) → M9
Lane B (training):        T1 (after M0) → T2 → feeds M6
```
- **T1 and T2 run in parallel with M1–M5** in a separate chat. They only touch `training/` and read `shared/`.
- **M4 and M5 may run in parallel** after M3 if the owner wants: M4 owns `lib/ml/scoring`, `lib/nudge`, `lib/replay`; M5 owns `lib/metrics`, `lib/privacy`, `entrypoints/dashboard`. Both may append to `entrypoints/background.ts` message handlers; coordinate by keeping additions in separate, clearly named handler modules.

| When | Lane A | Lane B |
|---|---|---|
| Thu Oct 15 | M0, M1 (data starts collecting tonight) | T1 starts (teacher running overnight) |
| Fri Oct 16 | M2, M3, M4 | T1 finish, T2 |
| Sat Oct 17 | M5, M6 by late morning; **M7 by early afternoon** (friend installs); M8 only if all Musts work by noon; **freeze EOD** | — |
| Sun Oct 18 | M9 showcase | — |

If we're behind: **never skip M7** (packaging + first user) to do M8. Drop M8 entirely before cutting M7.

### 0.6 Shared contracts (created in M0, used by everyone)
All live in `shared/` as JSON Schema files **plus** generated TypeScript types (`shared/types.ts`). Python reads the JSON Schemas directly. Starting shapes (M0 may refine, but must keep every consumer in sync):

- **`observer-event.schema.json`**: events from content script → service worker (never persisted as-is). Types:
  - `item`: `ts`, `origin`, `path`, `title?`, `itemKey`, `isVisual`, `prevDwellMs`, `text?` (in memory only)
  - `scroll`: `ts`, `pxPerS`
  - `video`: `ts`, `itemKey`, `event` (`play`/`pause`/`ended`/`skip`), `currentTime`, `duration`
  - `visibility`: `ts`, `visible`
  - `heartbeat`: `ts`, `origin`, `path`
- **`territory-description.schema.json`**: input to territory naming (PDD 9.4): `origins[{origin, pathPrefix, count}]`, `sampleTitles[]`, `topicTags[{tag, score}]`, `velocity{itemsPerMin, skipRate, meanDwellS}`, `minutesToday`.
- **`naming-output.schema.json`**: `{name (≤6 words), suggested_label: "deep"|"shallow"|"drain", why}`.
- **`daily-facts.schema.json`**: input to the autopsy (PDD 9.8): `date`; `deepBlocks{count, longestMin, totalMin, blocks[{start, end, minutes, territory}]}`; `residue{switchesOutOfDeep, meanMinBackToDeep}`; `totalsMin{deep, shallow, drain}`; `drainOverAllowance[{territory, minutesOver}]`; `topTriggers[{fromTerritory, toTerritory, hour, count}]`; `strongestStretch{territory, start, end, minutes}`; `nudges{shown, accepted, snoozed, ignored, medianReturnMin}`; `vs7Day{deepBlocksDelta, drainOverDelta}` (nullable when < 7 days).
- **`shared/personas.json`**: Deep Worker personas (developer, writer, researcher, designer, student, freelancer), each with typical sites per label, typical day shape and spiral triggers. Used by both the TS synthetic-day generator (M4) and the Python teacher-input generator (T1).

---

## M0 — Repository, scaffold and shared contracts
**Goal:** a clean repo any later chat can build on: a WXT extension skeleton that loads in Chrome, a `uv` training project, test tooling, and the shared contracts that let Lane B start in parallel.

**Read:** PDD 6, 8, 9.4, 9.8, 12. This file 0.6.

**Prerequisites:** none. (Git repo already initialised with `PDD.md`, the agent instructions, this file, `implementation-summary.md` and the workflow skills.)

**Tasks**
1. `extension/`: WXT + TypeScript + Preact project using **npm**. Entrypoints as empty but wired stubs: `background.ts`, `offscreen/` (created via `chrome.offscreen`, not yet used), `content.ts`, `popup/`, `dashboard/`, `onboarding/`.
2. Manifest per PDD 11.5 and 12.2: permissions, `host_permissions: ["<all_urls>"]`, CSP with `'wasm-unsafe-eval'` for extension pages.
3. IndexedDB layer `extension/lib/db/` using `idb`: all stores from PDD 8.1 with typed accessors and a versioned schema (`DB_VERSION`). No business logic.
4. `shared/`: the JSON Schemas and `personas.json` from 0.6, plus `shared/types.ts` generated from the schemas (add an `npm run gen:types` script, e.g. `json-schema-to-typescript`).
5. `extension/assets/`: initial `blocklist.json` (domains + keyword patterns per PDD 11.2), `feed-origins.json` (YouTube, Instagram, X, Reddit, TikTok, Facebook, LinkedIn feed paths, news sites), placeholder `topics.json` (~300 phrases; can be filled properly in M8).
6. Vitest set up with one passing test per `lib/` folder. `npm run build`, `npm run dev`, `npm test` all work.
7. `training/`: `uv` project (Python 3.13), pytest, a test that validates a sample object against each JSON Schema in `shared/`.
8. Root `README.md` (short: what this is, how to build, load unpacked, run tests), `LICENSE` (MIT, copyright Prateek), `.gitignore` (node_modules, .output, training data except samples, model files, `.venv`).
9. `docs/showcase/` folder with a README explaining the per-milestone convention.

**Out of scope:** any observer logic, models, UI beyond "hello" placeholders, training code.

**Acceptance criteria**
- `cd extension && npm ci && npm run build && npm test` passes.
- Loading `extension/.output/chrome-mv3` via "Load unpacked" shows no errors; popup and dashboard open.
- `cd training && uv run pytest` passes.
- `shared/types.ts` matches the schemas (regenerating produces no diff).

**Showcase evidence:** none needed beyond a note of the stack in the summary.

**Handoff notes the summary must include:** exact commands; folder map; schema versions; anything in 0.6 you changed and why.

---

## M1 — Observer, bins and storage (data starts collecting)
**Goal:** the extension observes browsing per PDD section 7 and stores bins and sample metadata, so the owner's real data starts accumulating **today**. No models yet.

**Read:** PDD 4.1, 7 (all), 8, 11.2, 11.3, 12.2. Spike S1 in PDD 14.

**Prerequisites:** M0.

**Tasks**
1. `lib/observer/`: item detection (PDD 7.3, including item identity rules D-47), scroll velocity, dwell, video events (skip detection), visibility; throttled per PDD; **blocklist and pause check as the first action** of the content script (PDD 11.2).
2. Service worker: tab/focus/idle tracking (PDD 7.4), including **video-playing counts as active** (D-46) and the internal `away` state (never shown). Heartbeat merging (ActivityWatch pattern) into **30-second bins** with the velocity features of PDD 7.6.
3. Persist `samples` (metadata only: origin, path, title if enabled, isVisual, dwell; `vector` null for now) and `bins`. Strip query strings and fragments. **Never persist item text.**
4. **Recorder (dev mode):** a settings toggle; when on, compact observer events are kept in IndexedDB and downloadable as JSONL from the dashboard (PDD 7.7). Never includes item text.
5. Pause (15 min / 1 h / until tomorrow / indefinitely) from the popup, with toolbar badge state (PDD 11.3).
6. Popup: live counts for today (samples, active minutes, items/min now) so the owner can see it working.
7. **Spike S1:** manually test item detection on YouTube Shorts, Instagram web, X, Reddit, and a docs site. Record results in `experiments/spikes.md`.

**Out of scope:** embeddings, screenshots (`captureVisibleTab` is M2), territories, nudges, dashboard UI beyond the JSONL download button.

**Acceptance criteria**
- Unit tests for item identity, velocity smoothing, heartbeat merging and bin aggregation.
- Browsing for 10 minutes produces bins and samples in IndexedDB; none contain item text or query strings (write a test that asserts this on stored records).
- Blocklisted site: no events at all. Paused: no events at all.
- S1 results recorded; failures noted with the fallback used.
- **The owner installs this build in his daily Chrome profile today.**

**Showcase evidence:** `docs/showcase/M1/`: S1 results table; CAPTURE.md (popup with live counts).

---

## M2 — Embedding engine (EmbeddingGemma 2 in the browser)
**Goal:** every sample gets an EmbeddingGemma 2 vector, computed on-device in the extension within the resource budget.

**Read:** PDD 6.1, 6.2, 7.5, 8.3, 9.1, 9.9, 12.2. Spikes S2 and S3.

**Prerequisites:** M1.

**Tasks**
1. **Spike S2 first:** load `onnx-community/embeddinggemma-2-ONNX` with Transformers.js on WebGPU in the offscreen document (try the service worker too). Text model + vision encoder, `q4f16` first. Measure latency, memory, NaN check. Copy the exact task-prefix strings from the model card (V-03). Record in `experiments/spikes.md`. **If vision fails, continue text-only and record it; do not block the milestone.**
2. **Spike S3:** confirm TF.js (WebGPU) can load in the same context alongside Transformers.js (a tiny dummy model is enough). Record result; the GRU is M8.
3. Model download on first run with progress reporting, cached in the extension origin, pinned to an exact Hugging Face commit (PDD D-26). Expose download state to the popup.
4. Screenshots: `captureVisibleTab` for visual items only, ≤ 1 per 3 s, in memory only (PDD 7.5).
5. Embedding queue with backpressure, sub-sampling above 20 items/min, idle unload after 10 min (PDD 9.9).
6. Write vectors to `samples` at 256d (re-normalised Matryoshka truncation); dev mode stores 768d (PDD 8.3).
7. Back-fill: none needed (text isn't stored); document that pre-M2 samples stay vectorless.

**Out of scope:** clustering, topic tags, 270M, UI beyond download progress.

**Acceptance criteria**
- Unit tests: truncation + re-normalisation; queue backpressure and sub-sampling logic.
- After 10 minutes of browsing, ≥ 95% of new samples have finite vectors; median embed latency recorded; no item text or images in storage.
- Budget targets from PDD 9.9 measured and recorded (pass or fail, honestly).

**Showcase evidence:** `docs/showcase/M2/`: latency/memory numbers; whether vision works; CAPTURE.md (download progress, popup).

---

## M3 — Territories and labeling (Showcase Level 1)
**Goal:** samples are grouped into stable territories that the owner can label Deep / Shallow / Drain with allowances.

**Read:** PDD 4.1, 4.4 (territory list), 8.1 (`territories`), 9.2, 9.4 (baseline name only), 9.10.

**Prerequisites:** M2.

**Tasks**
1. `lib/ml/kmeans.ts`: k-means++ with cosine distance on unit vectors; silhouette-based k selection over [4, 30] with a small bias toward fewer clusters. Our own code, no library.
2. `lib/ml/hungarian.ts`: Hungarian matching of new clusters to previous territories (similarity > 0.8 keeps ID, name, label, allowance).
3. Online nearest-centroid assignment with an "unassigned" threshold; first clustering at ≥ 300 samples, every 2 h on day 1, then nightly via `chrome.alarms` (PDD 9.2, 6.3).
4. **Baseline naming** `"<top origin> · <top path segment>"` (the 270M replaces this in M6, and it stays as the fallback).
5. Rule-based **suggested labels** for now (feed-origins → Drain; mail/chat/calendar → Shallow; else unlabelled), clearly marked as suggestions.
6. Dashboard: territory list with name, size, top origins, today's minutes, label buttons, allowance input for Drain (default 15 min), confirm state.
7. Evidence for the post: a small script or dashboard dev view showing **one domain split into several territories** (e.g. YouTube tutorials vs Shorts), compared with a domain-only grouping baseline (PDD 9.10).

**Out of scope:** scoring, nudges, timeline, UMAP map (M8), topic tags (M8), 270M naming (M6).

**Acceptance criteria**
- Unit tests: k-means on synthetic separable clusters recovers them; silhouette picks the right k on synthetic data; Hungarian matches a permuted assignment; IDs and labels survive a re-cluster.
- On the owner's real data, territories appear and labels persist across a forced re-cluster.

**Showcase evidence:** `docs/showcase/M3/`: territory count, the "one domain, many territories" example with numbers; CAPTURE.md (territory list, labeling).

---

## M4 — Spiral prediction, nudges, replayer and demo mode (Showcase Level 2)
**Goal:** the full loop works: predict a spiral (rules + Markov), nudge in-page (banner, then blur), and replay recorded or synthetic days for testing and the demo.

**Read:** PDD 4.1–4.5, 7.7, 9.5, 9.6 (rules + Markov only), 9.7, 9.10.

**Prerequisites:** M3. May run in parallel with M5 (see 0.5).

**Tasks**
1. `lib/ml/rules.ts`: cold-start scoring (PDD 9.6 rules mode).
2. `lib/ml/markov.ts`: first-order transition matrix over territories + internal `away`/`idle` on 30-second bins, Laplace smoothing, 20-step rollout → predicted minutes per territory.
3. `lib/ml/scoring.ts`: spiral score with **allowances** (PDD 9.5). Active mode selection: rules until Markov has ≥ 1 day of bins, then Markov (GRU promotion is M8).
4. Evaluation harness: next-territory top-1/top-3 and spiral AUC on the held-out latest day, rules vs Markov; stored in `models` (PDD 9.6).
5. `lib/nudge/`: policy (sensitivity thresholds, 15-min cooldown, never in Deep/Shallow or within allowance, max step) and ladder steps 1 (banner) and 2 (blur), rendered in a shadow DOM by the content script, coach voice copy (PDD 4.2). Log every nudge and response.
6. `lib/replay/`: **replayer** (feeds JSONL events through the pipeline at chosen speed), **synthetic-day generator** from `shared/personas.json`, and **demo mode** (replays a prepared day so a spiral and nudges fire on cue; the UI shows a visible "Replay" badge).
7. Popup: current mode (rules / Markov), current spiral score.

**Out of scope:** GRU (M8), breathing step (M8), deep blocks and facts (M5), dashboard timeline (M5), 270M (M6).

**Acceptance criteria**
- Unit tests: Markov rollout on a known chain; allowance logic in scoring; nudge policy (cooldown, allowance, max step, label rules); evaluation metrics on toy data.
- A synthetic "spiral" day replayed through demo mode triggers a banner, then a blur, at the expected times.
- On the owner's real data, rules vs Markov metrics are computed and stored.

**Showcase evidence:** `docs/showcase/M4/`: rules vs Markov metrics; CAPTURE.md (banner, blur, demo mode with Replay badge).

---

## M5 — Metrics, dashboard timeline, template autopsy and privacy controls (Showcase Level 3)
**Goal:** the product is complete without the fine-tuned model: deep blocks, attention residue, daily facts, a template autopsy, the timeline, and all Must privacy controls.

**Read:** PDD 4.1, 4.4, 4.6, 4.7, 8.2, 9.8, 11 (all).

**Prerequisites:** M3 (M4 for nudge stats; if running in parallel, read nudge records defensively).

**Tasks**
1. `lib/metrics/`: deep blocks (≥ 25 min, interruptions ≤ 2 min, away time pauses the clock), attention residue, totals by label, drain over allowance, top triggers, strongest stretch, nudge outcomes, 7-day comparison. Output must validate against `shared/daily-facts.schema.json`.
2. **Template autopsy** that renders `facts` in the coach voice (PDD 4.6). This is the permanent fallback for M6.
3. Nightly job wiring (PDD 6.3 steps 1, 7): retention, then facts, then autopsy into `reports`.
4. Dashboard: **timeline** (D3: territory bands, velocity line, deep blocks outlined, nudge markers; away time is a plain gap, never labelled), today's metrics, autopsy view, history picker.
5. Popup: deep blocks (count + longest), attention residue, drain over allowance, nudges that worked (PDD 4.4).
6. Privacy (`lib/privacy/`): forget time range, forget site (+ always skip → blocklist), wipe everything (database, model cache, settings), with the cascade in PDD 11.4; blocklist editor; retention setting; store-titles toggle.
7. Product success metrics (PDD 4.7) visible in the dashboard.

**Out of scope:** 270M (M6), UMAP map, topic tags, forget single capture (M8), onboarding (M7).

**Acceptance criteria**
- Unit tests: deep-block detection edge cases (interruptions at exactly 2 min, away gaps, blocks across midnight); residue; allowance overage; facts validate against the schema; forget cascade removes data and updates territories.
- Grep-style test: no UI string or autopsy template mentions time outside the browser.
- The owner can see today's timeline, metrics and a template autopsy for his real data.

**Showcase evidence:** `docs/showcase/M5/`: a real (or replayed) day's facts JSON and template autopsy; CAPTURE.md (timeline, popup, forget flow).

---

## T1 — Teacher data generation (Lane B)
**Goal:** ~1,000 high-quality training examples for the two 270M tasks, written by Gemma 4 31B running locally.

**Read:** PDD 4.1, 4.2, 4.6, 9.4, 9.8, 10.1, 10.2. `shared/` schemas and personas.

**Prerequisites:** M0 (shared contracts). Runs in parallel with Lane A. **Touch only `training/`** (and `experiments/spikes.md` for S4).

**Tasks**
1. **Teacher serving:** the owner has downloaded `unsloth/gemma-4-31B-it-GGUF` (UD-Q4_K_XL, vision, MTP) in Unsloth Studio. Find out whether Studio exposes an OpenAI-compatible API; otherwise run `llama-server` on the same GGUF with `--spec-type draft-mtp` and parallel slots. Ask the owner before installing anything system-wide. Thinking mode off.
2. **Spike S4:** measure tokens/s (single and parallel). Record in `experiments/spikes.md`. Pick the example count per PDD 14 (default ~1,000; ~700 if slow).
3. `training/gen_inputs.py`: synthetic **territory descriptions** (~600) and **daily facts** (~400) for the personas in `shared/personas.json`, validated against the JSON Schemas. Vary personas, days, edge cases (zero deep blocks, very good days, missing 7-day data).
4. `training/gen_teacher.py`: prompts with the coach voice, the Deep/Shallow/Drain vocabulary, the output structure (PDD 4.6, 9.4), and the rules (only numbers from `facts`; never mention activity outside the browser). Resumable, writes JSONL incrementally, logs throughput.
5. `training/filter.py`: JSON validity, length limits, number-grounding check, outside-browser check (shared validator code, reused in M6 and T2). 900/100 stratified split.
6. Start the long generation run (overnight is expected). Produce a short sample report (10 examples per task) for the owner to spot-check.

**Out of scope:** fine-tuning, ONNX, any extension code.

**Acceptance criteria**
- pytest: input generators produce schema-valid objects; validators catch planted errors (invented number, outside-browser mention, bad JSON).
- Generation is running or finished; `training/data/train.jsonl` and `eval.jsonl` exist (or are clearly in progress with a resume command in the summary).

**Showcase evidence:** `docs/showcase/T1/`: S4 throughput; dataset stats; 3 good examples per task.

---

## T2 — Fine-tune, evaluate and convert Gemma 3 270M (Lane B)
**Goal:** a fine-tuned Gemma 3 270M that beats its baselines, converted to ONNX q4f16 and verified in a browser page.

**Read:** PDD 9.10, 10.3, 10.4, 10.5. T1's summary.

**Prerequisites:** T1 data (at least a usable partial set).

**Tasks**
1. **Spike S5 first:** a 50-step toy LoRA run with Unsloth on this Mac (scripted Unsloth Core if it works on Apple Silicon; else Studio; else `mlx-tune`), then convert to ONNX and load it with Transformers.js in a plain HTML page. Record in `experiments/spikes.md`. **Do this before the full run.**
2. `training/finetune.py`: full LoRA run (starting hyperparameters in PDD 10.3), merge, export safetensors.
3. `training/eval/`: rubric (`rubric.md`), 31B judge script, automatic metrics, baselines (PDD 9.10: template autopsy and baseline names, base 270M, fine-tuned 270M, teacher as ceiling). Produce `training/eval/report.md` with the comparison table. Prepare 20 side-by-side examples for the owner's manual review.
4. `training/export_onnx.py`: ONNX q4f16 export compatible with Transformers.js; verify generation in the test page; record size and speed.
5. Prepare the Hugging Face model card (Gemma 3 derivative, **Gemma Terms of Use included**, training data description, eval results). **Ask the owner for an explicit yes before publishing** to his HF account; record the repo name and the pinned commit hash in the summary.

**Out of scope:** extension integration (M6).

**Acceptance criteria**
- Ship bar from PDD 10.4 met, or the summary states honestly which part failed and what M6 should do (e.g. use the 270M for naming only and keep the template autopsy).
- ONNX model generates in the browser test page.

**Showcase evidence:** `docs/showcase/T2/`: eval report table; S5 notes; training curve numbers; model size.

---

## M6 — Integrate the fine-tuned 270M (Showcase Level 4)
**Goal:** territory names, suggested labels and the nightly autopsy come from our fine-tuned Gemma 3 270M, with validation and fallbacks.

**Read:** PDD 9.4, 9.8, 9.9, 9.10. T2's summary (model repo, commit hash, eval results).

**Prerequisites:** M5 and T2. If T2 failed its ship bar, follow T2's recommendation.

**Tasks**
1. Load the 270M on demand in the offscreen document (pinned commit), unload after use (PDD 9.9). Show its download in the popup's model status.
2. Naming: build the territory description (validated against the schema), generate, validate, retry once, fall back to the baseline name (PDD 9.4). Suggested labels from the model replace the M3 rule-based ones (keep rules as fallback).
3. Autopsy: generate from `facts`, run the shared validators (numbers grounded, no outside-browser mentions, length), regenerate once, fall back to the M5 template (PDD 9.8).
4. Dashboard shows which source wrote each name and autopsy (model or fallback) in a subtle way.
5. Run both against the owner's real data and a replayed day.

**Out of scope:** retraining, topic tags (M8).

**Acceptance criteria**
- Unit tests for the TypeScript validators (port or share T1's rules) and fallback paths.
- Real-data run: names and an autopsy produced by the model; fallback rate recorded.

**Showcase evidence:** `docs/showcase/M6/`: a model-written autopsy vs template for the same day; naming examples; fallback rate.

---

## M7 — Release candidate and first user (Showcase Level 5)
**Goal:** a packaged build the friend can install on his Apple Silicon Mac, with onboarding, and a recorded first-user interview.

**Read:** PDD 4.3, 11.1 (honest wording), 11.5, 16.4. All summaries.

**Prerequisites:** M5 at minimum (M6 if done). **Never skip this milestone for M8.**

**Tasks**
1. Onboarding page (PDD 4.3): what is observed, what is stored, the honest privacy wording (11.1), the install warning explained, model download progress, blocklist review.
2. README: install via zip / Load unpacked, first run, privacy, limits (browser only by design).
3. `npm run zip` (WXT) → `releases/doomscroll-autopsy-<version>.zip` (gitignored; record its path and checksum in the summary).
4. End-to-end smoke test on a fresh Chrome profile: install, onboarding, download, browse, territories appear (or replay to speed up), nudge fires, metrics show, forget works, wipe works.
5. Fix release-blocking bugs only.
6. `docs/first-user/interview.md`: the 5 questions from PDD 16.4 and a template for answers. The owner conducts the interview and fills it in.

**Out of scope:** new features.

**Acceptance criteria**
- Fresh-profile smoke test passes; checklist recorded in the summary.
- Zip produced; the owner confirms the friend has installed it.

**Showcase evidence:** `docs/showcase/M7/`: smoke-test checklist; CAPTURE.md (onboarding screens).

---

## M8 — Should-tier features (optional, Showcase Level 6)
**Goal:** add Should items **in this order**, each independently committed and shippable. Stop at freeze time (Oct 17 EOD) wherever you are. Re-zip at the end.

**Read:** PDD 5.1, 9.3, 9.6 (GRU), 4.5 step 3, 11.4.

**Prerequisites:** M7 done. Start only if all Musts work by **Oct 17 noon** (PDD 5.1).

**Order**
1. **GRU** (`lib/ml/gru.ts`, TF.js; CPU if S3 failed): features and heads per PDD 9.6, nightly training, held-out evaluation, promotion only if it beats Markov (D-20). Unit tests on synthetic sequences.
2. **UMAP attention map** in the dashboard (`umap-js`), coloured by label, click to select territory.
3. **Topic tags** (PDD 9.3): fill `topics.json` properly (~300 phrases), text-embed once, top-3 per territory, feed into naming input.
4. **Breathing pause** (nudge step 3).
5. **Forget a single capture.**

**Out of scope:** Could-tier items unless the owner asks (768d MRL experiment, topic-tag accuracy eval, quiet hours, shortcut).

**Acceptance criteria:** each item has tests (where logic exists), works in the build, and is committed separately; the final zip is rebuilt.

**Showcase evidence:** `docs/showcase/M8/`: GRU vs Markov metrics; CAPTURE.md (map, breathing step).

---

## M9 — Showcase (Oct 18)
**Goal:** a publish-ready DEV post, demo video script, GIF list and experiment results, based on whatever level we reached.

**Read:** PDD 2.1, 3, 16 (all). All summaries and everything in `docs/showcase/`.

**Prerequisites:** whatever is done. **Do not write product code** except tiny fixes the owner explicitly asks for.

**Tasks**
1. Re-check the challenge page for the Side Hustle template and rules (V-08, V-09).
2. Run the experiments that are possible with the reached level: baselines table, rules vs Markov (vs GRU), fine-tune before/after, "one domain, many territories", MRL trade-off if 768d data exists. Write `experiments/results.md`.
3. Write the post draft in `docs/post.md` following PDD 16.2, with `#hf26challenge` and honest limits. Include a Mermaid architecture diagram. Credit Cal Newport's *Deep Work* and Sophie Leroy's research without implying endorsement. Use the honest privacy wording (PDD 11.1).
4. `docs/demo-script.md`: shot list for the 2–3 min video (PDD 16.3), using demo mode labelled as a replay; GIF list.
5. Help the owner save the agent session with DevRelay (optional) and stage the post as a **draft** on DEV via DevRelay **only with his explicit yes**. Publishing is his decision.

**Out of scope:** new features.

**Acceptance criteria:** post draft complete and reviewed by the owner; demo script and GIF list ready; submission checklist (template, tag, links, video, repo, model) in the summary.
