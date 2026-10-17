# Doomscroll Autopsy — Product Description Document (PDD)

| | |
|---|---|
| **Status** | Approved design (v2, after first review), ready to build |
| **Last updated** | 2026-10-15 |
| **Owner** | Prateek (prateektikku@gmail.com) |
| **Built for** | Hacktoberfest Open-Source AI Challenge: Week 2 ("Side Hustle") on DEV |
| **Hard deadline** | Submission post published by **Sun Oct 18, 11:59 PM PDT** (Oct 19 06:59 UTC) |
| **Internal deadline** | Product built, tested and packaged by **Sat Oct 17 EOD**. Oct 18 is for the showcase only. |
| **Tagline** | *Protect your deep work from the feed.* |

> **How to use this document.** This is the single source of truth for the project. If you are a new human or AI contributor, read sections 1–4 for the *why*, 5–12 for the *what and how*, 13–15 for *when and what could go wrong*, and section 17 for *every decision we made and the alternatives we rejected*. If something you're about to build contradicts this document, stop and raise it rather than silently diverging. Update the decision log (section 17) when a decision changes.

---

## Contents
1. [Summary](#1-summary)
2. [Context: the challenge and our goals](#2-context-the-challenge-and-our-goals)
3. [Problem, audience and business model](#3-problem-audience-and-business-model)
4. [The product, as the user experiences it](#4-the-product-as-the-user-experiences-it)
5. [Scope and priorities](#5-scope-and-priorities)
6. [System architecture](#6-system-architecture)
7. [The observer: what the extension sees](#7-the-observer-what-the-extension-sees)
8. [Data model and storage](#8-data-model-and-storage)
9. [ML pipeline (runtime, in the browser)](#9-ml-pipeline-runtime-in-the-browser)
10. [Fine-tuning pipeline (offline, on the Mac)](#10-fine-tuning-pipeline-offline-on-the-mac)
11. [Privacy and security](#11-privacy-and-security)
12. [Tech stack, platform details and repository layout](#12-tech-stack-platform-details-and-repository-layout)
13. [Schedule](#13-schedule)
14. [Day-one spikes](#14-day-one-spikes)
15. [Risks and fallbacks](#15-risks-and-fallbacks)
16. [Showcase: judging criteria, post and demo](#16-showcase-judging-criteria-post-and-demo)
17. [Decision log](#17-decision-log)
18. [Open questions and things to verify](#18-open-questions-and-things-to-verify)
19. [Glossary](#19-glossary)
20. [References](#20-references)

---

## 1. Summary

**Doomscroll Autopsy** is a Chromium browser extension for **Deep Workers**: people whose best output depends on long, unbroken focus. It understands *what* you are paying attention to in the browser, not just which site is open, protects your deep work, and catches a doomscroll a few minutes before it swallows your evening. Everything runs inside the browser on open-weight Gemma models. Nothing you browse ever leaves your machine.

- **It perceives** with **EmbeddingGemma 2** (text + vision encoders, via Transformers.js on WebGPU). Each post, Reel, video or page you look at becomes a vector.
- **It groups** those vectors into personal **territories** ("Writing the Q3 report", "Slack threads", "Instagram Reels: cooking and gym clips"), each labelled **Deep**, **Shallow** or **Drain**, with k-means we write ourselves.
- **It predicts** where your next 10 minutes are heading with a Markov model and (if it earns its place) a small **GRU trained from scratch in the browser**, counting only Drain time beyond your daily allowance.
- **It nudges** with an escalating in-page intervention: a banner, then a blurred feed, then (optionally) a 30-second breathing pause.
- **It explains** your day each night in a short **autopsy** written by **Gemma 3 270M, fine-tuned by us** with Unsloth on data written by Gemma 4 31B. The headline is your **deep blocks** and your **attention residue**.

Pitch line: *"Two Gemma models, about 580 MB, running entirely inside your browser, protecting your deep work."*

**Scope boundary:** the product reports only what happens in the browser. It never shows, counts or describes time spent outside the browser (D-45).

## 2. Context: the challenge and our goals

### 2.1 The challenge
- **Name:** Hacktoberfest Open-Source AI Challenge: Week 2, DEV event #80. Page: https://dev.to/challenges/hacktoberfest-week2-2026-10-12. Hub: https://dev.to/challenges/hf26
- **Theme ("Side Hustle"):** build something with open-weight models or open-source AI *that someone would actually pay for*. The open pieces must be what makes the project work.
- **The post must:** explain what we built and who would pay for it, show a demo, and explain **why open innovation matters**. **Bonus:** land a first user and report what happened.
- **Required tag:** `#hf26challenge`. Use the Side Hustle submission template from the challenge page.
- **Judging** (writing quality weighted most heavily):
  1. Writing Quality
  2. Relevance to the Prompt and Theme (open AI at the core; would someone pay?)
  3. Creativity
  4. Technical Execution
  5. Use of Partner Technology (optional, per category)
- **Prizes:** Overall $250 + DEV++ + badge. 6 featured categories at $200, 11 partner categories at $100. **Each participant can win once per challenge.** All valid entries get a completion badge (and a Hacktoberfest virtual sticker).
- **Category we're entering:** **Best Use of Gemma** (featured, $200), plus the overall prize (D-05, D-06).
- **Rules carried over from Week 1** (assumed; V-08): new project built during the challenge window; one entry per person.
- **Optional, encouraged:** save the agent session with DevRelay and embed it in the post.

### 2.2 Our goals, in priority order
1. **Learn modern AI hands-on:** embeddings as geometry (cosine similarity, Matryoshka truncation, cross-modal zero-shot), clustering, training a sequence model from scratch, LoRA fine-tuning with Unsloth, quantization and ONNX conversion, on-device inference with WebGPU.
2. **Win the overall prize and/or Best Use of Gemma.**
3. **Ship something a real person uses and would pay for.**

## 3. Problem, audience and business model

### 3.1 Audience: Deep Workers (D-40)
Named after Cal Newport's book *Deep Work* (2016). **Deep Workers** are people whose most valuable output comes from long stretches of focused, cognitively demanding work: software developers, writers, researchers, designers, analysts, grad students and freelancers who sell expertise. They already believe that depth matters. Their problem is protecting it.

We use Newport's vocabulary (deep work, shallow work) and Sophie Leroy's research on **attention residue** (part of your attention stays on the previous task after you switch). **We cite the book and the research. We never suggest that Cal Newport or anyone else endorses the product.**

- **First user:** a friend on an **Apple Silicon Mac** (Chrome), installed on Oct 17.

### 3.2 Problem
Screen-time tools tell you *"Chrome: 4 hours"*, or block whole sites. Neither protects deep work:
- The same site serves both depth and distraction. YouTube can be a conference talk or 40 minutes of Shorts. Reddit can be a debugging answer or a rage thread.
- They count total time, but depth comes from *unbroken blocks*. Sixty minutes interrupted ten times is not sixty minutes of deep work.
- They react *after* the damage. By the time you see the report, the evening is gone.
- The tools that look at content send it to a server. That's unacceptable for something that sees everything you read.

### 3.3 Why a Deep Worker would pay
- Their income and career depend on depth, and they already spend money on it (focus apps, noise-cancelling headphones, coworking, productivity courses).
- No existing tool measures **deep blocks** and **attention residue** from what's actually on screen, learns *their* patterns, and predicts a slide before it happens, **privately**.

### 3.4 Competitive landscape (checked 2026-10-15)
- **Free doomscroll extensions exist, and all are small and heuristic:**
  - RickStop: scroll timing and intensity only, then a hard lock.
  - Rewire: local "negative content" detection on predefined sites. v0.0.1, 1 user.
  - DoomScroll Guardian: scroll intensity → Calm / Escalating / Spiral states, breathing resets, a "What are you here for?" prompt, dashboard. 5 users.
  - Sentivisor: blocks fear-mongering and clickbait content.
- **Hacktoberfest Week 1 ("Touch Grass") had many screen-time entries:** Touchwood, GrassLock, Dayloom, OFFSCREEN, Outside Hour, TrailQuest, WanderWise and others. Judges have seen "doomscroll blocker" before.
- **What none of them do, and we do:**
  1. A **personal map of attention** built from multimodal embeddings, so the same site splits into Deep, Shallow and Drain territories.
  2. **Deep blocks and attention residue** as the measure of success, instead of minutes blocked.
  3. **Prediction** from your own history, with a baseline the model must beat.
  4. A **fine-tuned, in-browser Gemma** that explains your day.
  5. Everything **on-device, open-weight**.

### 3.5 Business model
- **Open-core.** MIT-licensed core on GitHub: observer, territories, map, nudges, privacy controls.
- **Pro: $29 one-time.** Weekly autopsy and trends, longer history, custom nudge styles. One-time pricing works because there are no servers to pay for, which is itself part of the "why open" story.
- **Not built for the hackathon.** Described in the post and here only.

### 3.6 Why open innovation matters (the post's core argument)
- **Privacy is the product.** A tool that sees everything you read cannot responsibly send it to someone else's API. Open-weight models running locally are what make it possible at all.
- **Cost makes one-time pricing work.** No inference bill means no subscription needed.
- **Ownership and specialisation.** We fine-tuned Gemma 3 270M for exactly two narrow jobs, which a general API does generically and expensively.
- **No lock-in.** Weights are pinned and cached locally; the product keeps working if any vendor changes pricing.

## 4. The product, as the user experiences it

### 4.1 Vocabulary (D-41)
| Label | Meaning | Examples |
|---|---|---|
| **Deep** | Focused, demanding work or learning | Writing a doc, reading documentation, a design tool in the browser, a long technical talk |
| **Shallow** | Necessary but low-value | Email, Slack, calendars, admin, quick lookups |
| **Drain** | Consumption that pulls you away and keeps you | Reels, Shorts, X threads, endless Reddit |

- **Deep block:** a stretch of **≥ 25 minutes** in Deep territories with no Shallow or Drain stretch longer than **2 minutes**. Away time (browser not focused) pauses the clock: it neither breaks the block nor adds to it (D-42, D-45).
- **Attention residue:** the number of switches out of Deep territories into Shallow or Drain, and the average time to get back to Deep.
- **Allowance:** minutes of a Drain territory per day that are fine (default 15, editable per territory). Only time beyond the allowance counts toward a spiral (D-43).

### 4.2 Voice (D-44)
All copy (nudges, autopsy, UI text) is a **calm, factual coach**: short, specific, non-judgemental. Example nudge: *"You left the report 4 minutes ago. Reels from here usually runs 40 minutes. Back to deep work?"* The fine-tuning data uses this voice.

### 4.3 First run
1. Install the extension (for the hackathon: "Load unpacked" or a zip; D-26).
2. An onboarding page explains what is observed, what is stored, and the one-time model download (~580 MB from Hugging Face, the only network traffic the extension ever makes). The user can edit the default privacy blocklist.
3. Models download and are cached. From then on the extension works offline.
   - **As built (M7, D-60):** only EmbeddingGemma 2 (~255 MB) downloads; the fine-tuned 270M ships inside the zip (D-58). A "Download and start now" button on the onboarding page starts it; otherwise it starts with the first item.
4. **Cold start (staged, D-14):**
   - **Hour 0:** rule-based spiral detection (velocity + known feed sites) drives nudges.
   - **~2 hours of browsing:** first territories appear and the user is asked to confirm their suggested labels and allowances.
   - **Evening of day 1:** the Markov model takes over.
   - **~2 days:** the GRU takes over if it beats Markov on held-out data.
   - The dashboard always shows which mode is active.

### 4.4 Surfaces (D-24)
- **Toolbar popup:** today's **deep blocks** (count + longest), **attention residue**, Drain time beyond allowance, nudges that worked, current mode, **Pause** (15 min / 1 h / until tomorrow / indefinitely), link to the dashboard.
- **Dashboard (its own extension tab):**
  - **Timeline:** coloured bands per territory through the day, the content-velocity line underneath, deep blocks outlined, nudge markers. Away time is simply a gap, never labelled or measured.
  - **Attention map:** each sample as a dot (UMAP projection of its embedding), coloured by label, grouped into territories.
  - **Territory list and labeling:** suggested name, topic tags, suggested label, allowance (Drain only); one click to confirm or change.
  - **Autopsy:** tonight's write-up.
  - **History and forget controls.**
  - **Settings:** sensitivity, max nudge step, quiet hours, blocklist, retention, store titles on/off, dev mode.
- **In-page nudge:** rendered in a shadow DOM on the page itself.
- **Keyboard shortcut:** toggle pause (`chrome.commands`).

### 4.5 The nudge ladder (D-22, D-23)
When the spiral score crosses the threshold:
1. **Step 1, banner:** a small dismissible banner with **Back to it** / **5 more min**.
2. **Step 2, blur:** if the user keeps going (score still above threshold after the cooldown), the feed blurs slightly with *Keep going?* / *Take a breath*.
3. **Step 3, breathing pause** (Should tier): an optional 30-second breathing cycle overlay.

Rules:
- The user picks the **highest step allowed** in settings.
- **Sensitivity:** Gentle / Balanced / Strict → threshold **0.75 / 0.60 / 0.45**.
- **Cooldown:** at most 1 nudge per 15 minutes. Optional quiet hours.
- Never nudge in a Deep or Shallow territory, or within a Drain territory's remaining allowance.
- Every response (accepted, snoozed, ignored, time to return) is logged and becomes a training feature.

### 4.6 The autopsy
Generated nightly (and on demand). A short write-up (≈120–180 words) in the coach voice:
1. **Headline:** deep blocks and attention residue, e.g. *"3 deep blocks today, the longest 74 minutes. 41 switches out of deep work."*
2. The strongest stretch.
3. What broke depth: the top triggers (preceding territory, time of day).
4. Which nudges worked.
5. One concrete suggestion for tomorrow.

**All numbers come from deterministically computed facts; the model only phrases them** (9.8). The autopsy always speaks of *browser* attention and never describes time outside the browser.

### 4.7 Product success metrics (D-48)
Computed locally, shown in the dashboard, used in the post:
- Deep blocks per day and longest block (want ↑).
- Attention residue: switches out of Deep, and mean time back (want ↓).
- Drain minutes beyond allowance (want ↓).
- Nudge acceptance rate and median time to return to Deep.

## 5. Scope and priorities

### 5.1 Priority tiers (D-33)
Musts are built first and frozen by **Oct 17 EOD**. Shoulds only start if all Musts work by **Oct 17 noon**. Coulds only if time remains.

| Tier | Items |
|---|---|
| **Must** | Observer + 30-second bins; dev-mode **recorder/replayer + synthetic-day generator** (D-35); EmbeddingGemma 2 text embeddings (+ vision if spike S2 passes); k-means territories + Hungarian ID matching + labeling UI with allowances; rules + Markov spiral scoring; nudge steps 1 (banner) and 2 (blur); popup + dashboard timeline + territory list; pause + forget (time range, site, wipe everything); fine-tuned 270M naming + autopsy with number-grounding; **baseline comparisons** for every ML component (D-36); deep blocks + attention residue metrics |
| **Should** | GRU + nightly evaluation/promotion; UMAP attention map; zero-shot topic tags; breathing pause (step 3); forget a single capture |
| **Could** | 768d dev-mode Matryoshka experiment; teacher-captioned topic-tag accuracy evaluation; quiet hours; keyboard shortcut; onboarding polish |

### 5.2 Explicit non-goals
- **Anything outside the browser.** No reporting, counting or display of time outside the browser (D-45). Phones and native desktop apps are out of scope.
- Safari and Firefox.
- Chrome Web Store listing (review takes days; roadmap).
- Payments or a Pro tier implementation.
- Cloud sync, accounts, or any server.
- Chrome's built-in Gemini Nano: not open-weight and not Gemma (D-08).

## 6. System architecture

### 6.1 Extension contexts (Manifest V3, built with WXT)

```
┌─────────────────────────────┐   events    ┌──────────────────────────┐   jobs    ┌───────────────────────────────────┐
│ Content script (every tab)  │ ──────────▶ │ Service worker           │ ────────▶ │ Offscreen document (WebGPU)        │
│ • blocklist check first     │             │ • routes messages        │           │ • EmbeddingGemma 2 (text+vision)   │
│ • observer: scroll, items,  │ ◀────────── │ • tab/focus/idle events  │ ◀──────── │ • territory assignment             │
│   video, dwell, item text   │   nudges    │ • heartbeat merge → bins │  scores   │ • spiral scoring (rules/Markov/GRU)│
│ • in-page nudge (shadow DOM)│             │ • captureVisibleTab      │           │ • nightly: k-means, UMAP, training,│
└─────────────────────────────┘             │ • chrome.alarms          │           │   topic tags, 270M naming/autopsy  │
                                            └──────────────────────────┘           └───────────────────────────────────┘
                                                        │                                         │
                                                        ▼                                         │
                                         ┌──────────────────────────────┐                         │
                                         │ IndexedDB (extension origin) │ ◀───────────────────────┘
                                         └──────────────────────────────┘
                                                        ▲
                                  Popup and dashboard pages read from IndexedDB and message the service worker.
```

**Why an offscreen document for the models?** WebGPU has historically not been available in MV3 service workers, and service workers are shut down unpredictably. Gemma Gem (an open-source extension running Gemma 4) uses an offscreen document. Hugging Face's April 2026 guide runs models in the service worker. Spike S2 decides; **the offscreen document is the default.** Whichever context hosts the models, treat model state as recoverable: re-initialise on restart.

### 6.2 Runtime flow for one sample
1. The content script checks the blocklist and pause state **before observing anything** (11.2).
2. It detects a **new item in view** (7.2) and sends `{item signals, item text, isVisual}`.
3. If `isVisual`, the service worker calls `chrome.tabs.captureVisibleTab` (rate-limited; 7.5) and passes the image to the offscreen document **in memory**.
4. The offscreen document puts the sample in the **embedding queue** (9.9). When processed, it:
   - embeds text, plus the image if any, with EmbeddingGemma 2,
   - truncates to 256 dimensions (768 in dev mode) and re-normalises,
   - assigns the nearest territory,
   - updates the 30-second bin,
   - computes the spiral score.
5. The sample and vector are written to IndexedDB. **Text and image are dropped.**
6. If the score crosses the threshold and the policy allows (4.5), the service worker tells the content script to show the next nudge step.

### 6.3 Nightly job (`chrome.alarms`, ~03:00 local or next wake, or on demand)
1. Apply retention (drop data older than 30 days) and any pending forgets.
2. Re-cluster (k-means + silhouette), then match new clusters to yesterday's (Hungarian matching on centroid cosine similarity) so territory IDs, labels and allowances stay stable.
3. *(Should)* Compute topic tags per territory (9.3).
4. Name new or changed territories and suggest labels with the 270M model; load it for this, then unload it (9.9).
5. Train Markov (and the GRU, Should tier) on all days except the latest; evaluate on the latest; promote the winner (D-20).
6. *(Should)* Compute the UMAP 2D map coordinates.
7. Compute the day's facts and generate the autopsy.
- **As built (M5):** steps 1, 2 and 7 run at the first check after 03:00 local (30-minute alarm, catches up after sleep): retention, re-cluster if due, then facts and the template autopsy for every finished day with data that has no report yet (a report made before its day ended is redone). Steps 3-6 arrive with later milestones. The result is recorded in `models/nightly-meta`.

## 7. The observer: what the extension sees

### 7.1 Approach (D-34)
**Our own observer**, roughly 400–600 lines of TypeScript on standard browser APIs. No session-replay library.
- **Not rrweb.** rrweb records a full DOM snapshot plus every mutation for replay. We'd discard almost all of it. It is costly on infinite feeds (Sentry's rrweb-based recorder stops recording after too many mutations). It captures far more content than our privacy principles allow. And it doesn't answer our core question: *which item is the user looking at?*
- **Borrowed patterns, not dependencies:**
  - **ActivityWatch's heartbeat model** (`aw-watcher-web`): repeated "still here" events merge into one span when they arrive within a pulse window. We use it to build 30-second bins and to survive service-worker restarts. Idea only; their code is MPL-2.0.
  - **rrweb's** scroll throttling and its list of media events to listen to.
  - *(Optional)* **Mozilla Readability** (Apache-2.0) for extracting the main text of article pages.

### 7.2 Signals per tab (content script)
| Signal | How | Used for |
|---|---|---|
| Scroll velocity (px/s, smoothed) | `scroll` events, throttled | Velocity features, rule mode |
| Item entered or left view | Item detection (7.3) + IntersectionObserver | Sample boundaries, items per minute, dwell time |
| Dwell per item (ms) | Time between item changes | Features |
| Video events | `play`, `pause`, `ended`, `timeupdate` on the dominant `<video>` | Skip rate (left before 2 s or before 25% watched); video-watching counts as active (7.4) |
| Item text | `innerText` of the item element, trimmed to ~512 tokens | Embedding input (then discarded) |
| Is the item visual? | Dominant media covers ≥50% of the viewport | Whether to screenshot |
| URL (origin + path, no query string), title | `location`, `document.title` | Metadata, naming (title optional; 11.1) |
| Page visibility | `visibilitychange` | Active time |

### 7.3 Item detection (generic, no site-specific selectors) (D-15)
- At most every 250 ms while scrolling, plus on scroll end: `document.elementFromPoint(viewport centre)`. Then walk up the ancestors to the first element whose height is **30–100% of the viewport** and which contains text ≥ 40 characters or a dominant `<img>`/`<video>`. That element is the **current item**.
- **Item identity** (D-47):
  1. a URL path change that looks like a per-item URL (`/shorts/<id>`, `/reels/<id>`, `/status/<id>`, `/comments/<id>`), else
  2. dominant media `currentSrc` + `duration` + `poster` (players reuse elements and often use `blob:` sources, so `src` alone is not enough), else
  3. the first 200 characters of normalised text.
- **New item:** identity changed **and** the previous item was in view ≥ 600 ms.
- **Fallback for pages with no card structure** (articles, docs, web apps): treat the viewport as the item, and emit a new sample when ≥ 60% of the visible text has changed, or every 60 s of continued activity.
- **Never rely on site CSS classes.** Instagram and others obfuscate them.

### 7.4 Signals per browser (service worker)
- `tabs.onActivated`, `tabs.onUpdated` (URL changes), `windows.onFocusChanged`. `WINDOW_ID_NONE` means the browser lost focus. This is stored internally as an **away** state (a model feature only; **never shown or reported**, D-45).
- `chrome.idle`: idle or locked time is excluded from all totals, **except** when the active tab is visible and has a playing video, which counts as active (D-46).
- Heartbeats from content scripts merge into spans (ActivityWatch pattern) and then into 30-second bins.

### 7.5 Screenshot policy (D-16)
- Only when the current item is **visual** (7.2), and at most **one every 3 s**. Chrome caps `captureVisibleTab` at roughly 2 calls per second; we stay well under it.
- Captured as a data URL in memory, passed to the offscreen document, embedded, and **dropped**. Never written to IndexedDB or disk.
- Never captured on blocklisted sites, in incognito, or while paused.

### 7.6 Velocity features (per 30-second bin)
`scroll_px_s_mean`, `items_per_min`, `mean_dwell_ms`, `video_skip_rate`, `tab_switches`, `away_s`, `idle_s`.

### 7.7 Recorder, replayer and synthetic days (D-35, Must)
- **Recorder (dev mode only):** writes the observer's event stream (the same compact events the service worker receives, never DOM or screenshots) to a JSONL file the owner can download.
- **Replayer:** feeds a recorded or synthetic event stream through the full pipeline at any speed (e.g. a day in 2 minutes). Used for tests, for development before real data exists, and for a reliable demo.
- **Synthetic-day generator:** produces plausible days for several personas (developer, writer, student, designer, researcher), shared with the teacher-data input generator (10.2).
- **Demo mode:** replays a prepared day so the video can show a spiral being caught on cue. Clearly labelled as a replay in the video.

## 8. Data model and storage

### 8.1 Storage: IndexedDB in the extension origin, via `idb`
No vector database. At ~3–6k samples/day × 256 float32 = ~3–6 MB/day, brute-force cosine similarity in JavaScript takes milliseconds.

| Store | Key | Contents |
|---|---|---|
| `samples` | auto id | `ts`, `tabId`, `origin`, `path`, `title` (optional), `isVisual`, `dwellMs`, `vector` (Float32Array, 256d; 768d in dev mode), `territoryId`, `territoryDist` |
| `bins` | `binStart` | 30-second bin: velocity features (7.6), `territoryId` (majority), `away`, `idle`, `nudgeShown`, `nudgeResponse` |
| `territories` | `id` | `centroid`, `size`, `name`, `topicTags[]` (tag + score), `suggestedLabel`, `label` (`deep` / `shallow` / `drain` / `null`), `labelConfirmed`, `allowanceMin` (Drain only, default 15), `firstSeen`, `lastSeen` |
| `nudges` | auto id | `ts`, `step` (1–3), `score`, `mode` (rules/markov/gru), `response` (`back` / `snooze` / `ignored`), `secondsToReturn` |
| `models` | name | Markov matrix, GRU weights (TF.js `indexeddb://`), last evaluation metrics, active mode |
| `reports` | date | Facts JSON, autopsy text, model version |
| `forgetLog` | auto id | What was forgotten (type + time range or site), **never the content** |
| `recorderEvents` | auto id | Dev-mode recorder (7.7): compact observer events, never item text, DOM or screenshots |

**Settings are not in IndexedDB** (D-52): sensitivity, max nudge step, quiet hours, blocklist edits, retention days, store titles, dev mode and pause-until live in `chrome.storage.local`, so content scripts can check pause and the blocklist as their first action (11.2).

### 8.2 Retention (D-17)
- Default **30 days** rolling (configurable).
- Item text and screenshots are **never stored**.
- URLs are stored as origin + path; query strings and fragments are always stripped.
- Titles are stored only if "store titles" is on (default on). They are used for clustering and naming only.

### 8.3 Vector size (D-18)
- **Default 256d** (Matryoshka truncation of the 768d output, then re-normalised).
- *(Could)* **Dev mode stores 768d** for the owner's first ~3 days so the post can report the measured 768 vs 512 vs 256 trade-off on real data.
- **Never 128d.** Cross-modal quality collapses at 128d (MMEB overall: 59.0 at 768d, 56.2 at 256d, 45.7 at 128d per the model card), and topic tagging (9.3) is cross-modal.

## 9. ML pipeline (runtime, in the browser)

### 9.1 Embedding: EmbeddingGemma 2
- **Model:** `onnx-community/embeddinggemma-2-ONNX` via `@huggingface/transformers` (Transformers.js), `device: "webgpu"`, WASM fallback.
- **Modules loaded:** text model + vision encoder. The audio encoder is never loaded.
- **dtype:** `q4f16` first choice (text ≈157 MB + vision ≈98 MB, ≈255 MB total). Spike S2 measures quality and speed; fall back to `q4` or `fp16` if needed. The model card warns that **float16 activations can overflow to NaN** in full fp16, so check for NaNs in the spike.
- **Inputs:** item text (≤512 tokens), plus the screenshot when visual, interleaved in one pass.
- **Task prefix:** use the **clustering/classification** prefix from the model card for samples and the matching prefix for topic phrases. *Copy the exact strings from the model card; do not invent them* (V-03). **Resolved in S2:** `task: clustering | query: {text}`; images take no prefix and are interleaved with `<|image|>` in one pass.
- **Output:** 768d L2-normalised vector, truncated to 256d and re-normalised.

### 9.2 Territories: clustering (D-19)
- **Algorithm:** k-means (k-means++ init) on 256d unit vectors using cosine distance, **written by us** (no library).
- **Choosing k:** silhouette score over k ∈ [4, 30]; pick the best, with a small bias toward fewer clusters.
- **Stability:** each nightly result is matched to the previous territories with the **Hungarian algorithm** on centroid cosine similarity. Matches above 0.8 similarity keep their ID, name, label and allowance. Unmatched clusters become new territories.
- **Online assignment** between nightly runs: nearest centroid. If the distance exceeds a threshold, the sample is marked "unassigned" until the next re-cluster.
- **First clustering:** once ≥ 300 samples exist (≈2 h of browsing), re-run every 2 h on day 1, then nightly.
- **As built (M3, D-53):** k is chosen on a ≤ 1,200-point subsample (the smallest k whose silhouette is within 0.02 of the best); the final fit uses the most recent ≤ 6,000 vectors, and clusters under 5 members are dissolved into the nearest one. The silhouette is exact but computed in O(n·k·d) from per-cluster vector sums. Owner-confirmed territories that no new cluster matches are kept as *dormant*, never deleted. A 30-minute alarm decides when a run is due (the nightly run happens at the first check after 03:00, so a sleeping laptop catches up); a 1-minute alarm assigns new samples and bins. Territory names that collide get a numeric suffix.
- *(Should)* **2D map:** `umap-js` on territory-sampled points, for display only.

### 9.3 Topic tags: zero-shot, cross-modal (Should)
- A hand-written vocabulary of ~300 short topic phrases ("cooking videos", "gym workouts", "political commentary", "memes", "programming tutorial", "documentation", "conference talk", "news", "shopping", …) in `extension/assets/topics.json`, embedded **once as text** at first run.
- For each territory: cosine similarity between the centroid and every topic vector. Keep the top 3 with score.
- This is how a text-only model learns what's *in* a visual territory: EmbeddingGemma 2 puts images and text in the same space.
- *(Could)* **Evaluation:** the Gemma 4 31B teacher (vision on) writes reference captions for ~50 of the owner's screenshots, collected with explicit consent in dev mode. Measure top-3 agreement.

### 9.4 Territory naming and suggested labels
- **Model:** our fine-tuned Gemma 3 270M (ONNX, 8-bit weights + fp16 activations, ≈324 MB, `dtype: "fp16"`) via Transformers.js on WebGPU, ≈118 tok/s (T2).
- **Input (text only):** top origins/paths with counts, up to 5 sample titles (if stored), top 3 topic tags with scores (if available), and velocity profile (items/min, skip rate, mean dwell).
- **Output (JSON):** `{"name": "...", "suggested_label": "deep|shallow|drain", "why": "..."}`, with `name` ≤ 6 words.
- **Validation:** parse the JSON. If invalid, retry once, then fall back to the baseline name `"<top origin> · <top topic>"` with no suggestion.
- **The user confirms** with one click and sets an allowance for Drain territories. Unconfirmed suggestions count at **half weight** in training (D-13).
- **As built (M6, D-58):** `lib/gen/` builds the `territory-description` from stored samples and bins (top 5 origin + first path segment, ≤ 5 titles when stored, velocity, minutes on the latest active day), asks the model (greedy, then one sampled retry), validates with a port of `parse_naming` (parity-tested against the Python on 660 variants) and falls back to the baseline name and the rule-based label. Runs after every re-cluster, nightly and on a dashboard button; only unconfirmed territories are renamed; a model name survives a re-cluster while the territory's top 3 origins are unchanged. Replayed personas: 42 of 53 territories named by the model (the rest had too little activity), all 42 suggested labels matched the persona's truth.

### 9.5 Spiral score (D-43)
**Spiral score** = predicted Drain minutes **beyond remaining allowance** over the **next 10 minutes** (20 bins of 30 s), divided by 10. Range 0–1.

For each Drain territory *t*:
- `remaining_t` = its allowance minus Drain minutes already spent in it today, floored at 0.
- `predicted_t` = predicted minutes in *t* over the next 10 minutes.
- `excess_t` = max(0, `predicted_t` − `remaining_t`).

Score = Σ `excess_t` / 10, capped at 1.

### 9.6 Prediction models (D-14, D-20)
- **Rules mode (cold start):** a logistic-style estimate of drain share from `items_per_min`, `scroll_px_s_mean` and `video_skip_rate`, plus a prior for known feed origins (`extension/assets/feed-origins.json`), minutes in the current territory, and whether the user just left a Deep territory. Hand-tuned, documented constants. Allowance logic (9.5) applies on top.
- **Markov mode:** a first-order transition matrix over territories (+ internal `away` and `idle` states) on 30-second bins, with Laplace smoothing. Roll out 20 steps from the current state to get `predicted_t` per territory.
- **GRU mode (Should):**
  - **Input per bin:** learned territory embedding (16d), label one-hot (4: deep/shallow/drain/unlabelled), velocity features (7.6, standardised), time of day (sin/cos), minutes in current territory, minutes since last Deep bin, nudge-shown flag, last nudge response.
  - **Sequence:** last 40 bins (20 minutes).
  - **Model:** 1-layer GRU, hidden size 64, ≈50k parameters.
  - **Two heads:** (a) next-bin territory (softmax, cross-entropy); (b) per-territory occupancy over the next 20 bins (softmax over territories, averaged), which gives `predicted_t`.
  - **Training:** TensorFlow.js with the WebGPU backend (or CPU; S3), nightly, about a minute.
- **Evaluation and promotion:** train on all days except the latest; evaluate on the latest. Metrics:
  - next-territory **top-1 and top-3 accuracy**,
  - **AUC** of the spiral score against "actual Drain beyond allowance ≥ 5 minutes in the next 10".

  Higher AUC runs tomorrow; ties go to Markov. Metrics are stored in `models` and shown in the dashboard.
- **As built (M8, D-61):** `lib/ml/gru.ts` (features, plain-TS forward pass used for inference, training windows), `gru-train.ts` (TF.js training, offscreen document only), `gru-service.ts` / `gru-promote.ts` (train on all days but the latest, evaluate on the latest, promotion rule, storage as `models/gru` and `models/gru-eval`). About 20k parameters (16d territory embedding, 1-layer GRU of 64, two softmax heads), 40-bin windows, at most 2,500 training windows, 8 epochs. WebGPU trains it in about 13 s, the CPU backend in about 150 s. The GRU is promoted only if its held-out AUC beats Markov's by at least 0.005 and the split is a full earlier-days/latest-day split; otherwise Markov stays. On synthetic personas it ties Markov and is never promoted (`docs/showcase/M8/gru-vs-markov.md`).

### 9.7 Nudge policy
See 4.5. Trigger when `score ≥ threshold(sensitivity)` and every rule in 4.5 allows it. Escalate one step if the previous nudge was ignored or snoozed and the score is still above threshold after the cooldown. Never exceed the user's max step. Log every nudge and response.
- **As built (M4, D-54):** no nudge while the Drain territory still has allowance left; unconfirmed territories use their suggested label; escalation needs the previous nudge within 60 min; step-2 buttons are *Back to it* / *Keep going* until M8 adds *Take a breath*. The score is computed every 30 s from the latest sample's territory and the last closed bin; Markov takes over once the history spans 24 h with ≥ 240 labelled bins (Laplace α = 0.05). Rules constants are in `lib/ml/rules.ts`.

### 9.8 Daily facts and the autopsy (D-21, D-42)
1. **Facts are computed deterministically** in TypeScript and saved as a `facts` JSON:
   - **deep blocks:** count, longest, total; computed on browser time with away time paused (4.1),
   - **attention residue:** switches out of Deep, mean minutes back to Deep,
   - totals by label; Drain beyond allowance per territory,
   - top triggers that broke depth (preceding territory, time of day),
   - nudge outcomes,
   - comparison with the 7-day average.
2. **The 270M model phrases them** in ≈120–180 words using the structure in 4.6, in the coach voice (4.2).
3. **Validation:** every number and time in the output must appear in `facts`, and the text must not mention activity outside the browser. If either check fails, regenerate once, then fall back to a template rendering of `facts`. **The model never invents numbers.**
- **As built (M6):** `writeAutopsy` sends the T1 student prompt (byte-exact port, tested on 50 real training prompts), greedy, 400 tokens; the text must pass `checkAutopsy` and the strict checks, otherwise one sampled regeneration, otherwise the M5 template. `reports.source` records attempts and the codes that refused a draft; the dashboard shows "Written by Gemma 3 270M (fine-tuned)" or "Written from a template (…)". Measured on 23 replayed persona days: with T2's model 15 model-written and 8 template (35% fallback, dominated by wrong nudge states); with the T3 retrain (D-59) 20 model-written and 3 template (13%).

### 9.9 Resource budget (D-49)
- **Embedding queue with backpressure:** at most 1 sample in flight. When items per minute exceed 20, embed every Nth item (N chosen to keep ≤ 20 embeds/min) and carry its territory to the skipped items. When the queue is longer than 10, drop the oldest *visual* samples first.
- **Model residency:**
  - The embedder stays loaded while the user is active and **unloads after 10 idle minutes**.
  - The 270M model is **loaded only** for naming and the autopsy, then unloaded.
- **Targets on the M4 Max** (verified in S2): median embed < 300 ms; extension memory (all contexts) < 1.5 GB while active; no visible scroll jank (observer work < 2 ms per scroll event).

### 9.10 Baselines (D-36, Must)
Every ML component is compared against a simple baseline, and the comparison goes in the post.
| Component | Baseline |
|---|---|
| Spiral prediction (Markov, GRU) | Rules mode; Markov is also the baseline for the GRU |
| Territory naming (270M) | `"<top origin> · <top topic>"` (or `"<top origin> · <top path segment>"` without topic tags), judged by the 31B and the owner |
| Autopsy (270M fine-tuned) | Base 270M (not fine-tuned) and the template rendering of `facts` |
| Topic tags (zero-shot) | Domain-only description |
| Territories (embeddings) | Grouping by domain alone: show in the post where embeddings split one domain into Deep and Drain |

## 10. Fine-tuning pipeline (offline, on the Mac)

Lives in `training/`, Python managed by `uv`. Hardware: Apple M4 Max, 64 GB unified memory.

### 10.1 Teacher (D-09, D-10)
- **Model:** `unsloth/gemma-4-31B-it-GGUF`, variant **UD-Q4_K_XL**, vision enabled, with **multi-token prediction (MTP)**. Unsloth Studio enables MTP automatically; the MTP draft model is inside the regular GGUF package. Memory: about 18–21 GB at 4-bit. MTP gives about 1.4× speed-up on dense models like the 31B (Unsloth docs).
- **Serving for scripted generation:** call the model from Python over an OpenAI-compatible API. Use Unsloth Studio's API if it has one; otherwise run `llama-server` on the same GGUF with `--spec-type draft-mtp` and parallel slots (`-np 4`).
- **Thinking mode off** for data generation.
- **Measure tokens/s first** (spike S4), then run generation overnight.

### 10.2 Training data (~1,000 examples, D-11)
Synthetic but realistic. We generate *inputs* programmatically (plausible territories, browsing days and `facts` JSON for Deep Worker personas: developer, writer, researcher, designer, student, freelancer), sharing code with the synthetic-day generator (7.7). The teacher writes *outputs* in the **coach voice** (4.2) using the **Deep / Shallow / Drain** vocabulary.

| Task | Count | Input | Output |
|---|---|---|---|
| Territory naming + suggested label | ~600 | Territory description (9.4 format) | JSON `{name, suggested_label, why}` |
| Autopsy | ~400 | `facts` JSON (9.8 format) | 120–180-word autopsy following 4.6, using only numbers present in `facts`, never mentioning activity outside the browser |

- **Filtering:** drop outputs that fail JSON parsing, the length limits, or the grounding checks (9.8). The owner spot-checks ~30.
- **Split:** 900 train / 100 held-out evaluation, stratified by task.
- **Format:** Gemma chat template, saved as JSONL in `training/data/`.

### 10.3 Student and training (D-07, D-12)
- **Base:** Gemma 3 270M instruction-tuned (`google/gemma-3-270m-it`, or Unsloth's copy).
- **Method:** LoRA fine-tune with **Unsloth**.
  - Preferred: a scripted run with Unsloth Core, if it trains on Apple Silicon (spike S5).
  - Otherwise: Unsloth Studio or Desktop, which train on Mac via MLX.
  - Last resort: `mlx-tune`, a community MLX port with the same `FastLanguageModel` API (not an official Unsloth project).
- **Starting hyperparameters** (to tune): LoRA rank 16, alpha 32, lr 2e-4, 3 epochs, max sequence length 2048, loss on completions only.
- **Merge** the LoRA into the base weights and export as Hugging Face safetensors.

### 10.4 Evaluation (D-12, D-36)
- On the 100 held-out examples, compare the **baselines (9.10) vs base 270M vs fine-tuned 270M**, with the teacher as the ceiling:
  - **Automatic:** JSON validity rate; number-grounding pass rate; length compliance; "outside browser" mention rate (must be 0).
  - **LLM judge:** the 31B scores each output 1–5 on factual faithfulness, structure and voice against a written rubric (`training/eval/rubric.md`).
  - **Human:** the owner reviews 20 side by side.
- **Ship bar:** ≥ 95% JSON validity, ≥ 90% grounding pass, judge mean ≥ 3.5, and better than the baseline on the judge score. The comparison table goes in the post.

### 10.5 Conversion and publishing
- Convert to **ONNX, q4f16**, compatible with Transformers.js, using the conversion path from Google's "fine-tune Gemma 3 270M for on-device" guide (Optimum / ONNX notebook).
- Verify in a plain web page with Transformers.js on WebGPU before wiring it into the extension.
- **Publish** to the owner's Hugging Face account as a public repo (proposed name `<hf-user>/doomscroll-autopsy-gemma-3-270m-ONNX`). The extension pins an exact commit hash. **Publishing requires the owner's explicit yes.**
- **The model card must:** state that it is a Gemma 3 derivative, **include the Gemma Terms of Use** and pass on its use restrictions, describe the training data (synthetic, generated by Gemma 4 31B) and give the evaluation results.

## 11. Privacy and security

### 11.1 Principles and honest wording (D-50)
1. **Nothing observed leaves the device.** The only network traffic is the one-time model download from Hugging Face, pinned to commit hashes. No analytics, no telemetry, no remote logging.
2. **Store as little as possible.** No item text, no screenshots, no query strings. Vectors and metadata only, 30-day retention. Titles can be turned off.
3. **The user is always in control:** pause, forget and wipe, all one click away.
4. **Say exactly what's true.** Embeddings can be partly inverted back into text by known research techniques, so stored vectors are **not anonymous**. Our claim is *"your data never leaves your device"*, never *"we only store anonymous numbers."* The post and onboarding page use this wording.

### 11.2 Blocklist (editable, D-25)
- **Default entries:** banking and payment sites, health portals, password managers, email web clients, government and tax sites, `chrome://` and extension pages. **Incognito:** extension not enabled there by default.
- Shipped as patterns in `extension/assets/blocklist.json`: domain lists plus keyword patterns.
- **Enforcement:** keyword patterns can't be expressed as Chrome match patterns, so content scripts are injected everywhere and **check the blocklist and pause state as their first action**. On a match they attach no listeners, read nothing, and exit. Domain entries are also passed as `excludeMatches` where possible.

### 11.3 Pause
15 min / 1 h / until tomorrow / indefinitely. Available from the popup, the dashboard and (Could) a keyboard shortcut. While paused, content scripts stop observing **entirely** (not just embedding). The status is visible in the toolbar badge.

### 11.4 Forget, with cascade
- **Options:** a time range (including "last 20 minutes"), everything from a site (with an optional *always skip* that adds it to the blocklist), **wipe everything** (database + cached models + settings), and (Should) a single capture.
- **Cascade:** delete the samples and bins → recompute affected territory centroids → regenerate names if their inputs changed → exclude the data from the next training (optional "retrain now") → regenerate affected reports. The `forgetLog` records only *what kind* of thing was forgotten.
- **As built (M5, D-57):** the cascade is implemented in `lib/privacy/forget.ts`; the dashboard offers last 20 minutes / last hour / today / custom range, forget a site (with *always skip*), a blocklist editor, a retention setting, a store-titles toggle (plus *remove titles already stored*) and a typed-confirmation wipe. "Retrain now" is not a separate button: the Markov model is refreshed as part of every forget.

### 11.5 Permissions (manifest)
`storage`, `unlimitedStorage`, `offscreen`, `tabs`, `alarms`, `idle`, `scripting`, `host_permissions: ["<all_urls>"]`. The keyboard shortcut (Could) adds a `commands` manifest key; it is not a permission. The install warning ("read and change all your data on all websites") is unavoidable for this product. The onboarding page and the post explain it, and 11.1 is the answer to it.

## 12. Tech stack, platform details and repository layout

### 12.1 Stack
| Area | Choice |
|---|---|
| Extension framework | **WXT** (Manifest V3), TypeScript |
| UI | **Preact**, D3 (timeline, charts), `umap-js` (map, Should) |
| Inference | `@huggingface/transformers` (Transformers.js) on WebGPU, with WASM fallback |
| Sequence model | `@tensorflow/tfjs` + WebGPU backend (CPU fallback) |
| Storage | IndexedDB via `idb` |
| Observer, clustering, Markov, Hungarian, metrics | Our own TypeScript |
| Training | Python 3.13, `uv`, Unsloth (Core, Studio or mlx-tune; 10.3); teacher via Unsloth Studio or `llama-server` |
| Conversion | Optimum / ONNX export (Google's 270M on-device guide) |
| License | Repo MIT; EmbeddingGemma 2 Apache 2.0; our fine-tune under the Gemma Terms of Use |

### 12.2 MV3 platform details (D-51)
- **CSP:** `extension_pages` must allow `'wasm-unsafe-eval'` for ONNX Runtime Web and TF.js WASM.
- **Model downloads:** fetched from `huggingface.co` and its CDN (covered by `<all_urls>`), cached via the Cache API in the extension origin.
- **Offscreen document:** created with `chrome.offscreen.createDocument`. The `reasons` value accepted for ML work is `WORKERS` (S2, V-07). Only one offscreen document can exist at a time.
- **WebGPU device sharing:** Transformers.js (ONNX Runtime Web) and TF.js each request a device. Verify they coexist in one context (S3); otherwise run TF.js on CPU (the GRU is tiny).
- **Storage quota:** `unlimitedStorage` so model caches and IndexedDB aren't evicted.
- **Service worker restarts:** all state lives in IndexedDB or `chrome.storage.session`; heartbeat merging (7.1) tolerates gaps.

### 12.3 Repository layout (proposed)
```
doomscroll-autopsy/
├── PDD.md                    ← this document
├── README.md                 ← user-facing install and usage
├── LICENSE                   ← MIT
├── extension/                ← WXT project
│   ├── entrypoints/
│   │   ├── background.ts     ← service worker
│   │   ├── offscreen/        ← model host (WebGPU)
│   │   ├── content.ts        ← observer + nudge UI
│   │   ├── popup/
│   │   ├── dashboard/
│   │   └── onboarding/
│   ├── lib/
│   │   ├── observer/         ← item detection, velocity, heartbeats
│   │   ├── replay/           ← recorder, replayer, synthetic days, demo mode
│   │   ├── ml/               ← embed queue, kmeans, hungarian, topics, rules, markov, gru, scoring, facts
│   │   ├── db/               ← idb schema, retention, forget cascade
│   │   └── nudge/            ← ladder, policy
│   └── assets/               ← topics.json, blocklist.json, feed-origins.json
├── training/                 ← uv project
│   ├── gen_inputs.py         ← synthetic territories, days, facts (shares logic with lib/replay)
│   ├── gen_teacher.py        ← calls the 31B, writes outputs
│   ├── filter.py
│   ├── finetune.py           ← Unsloth LoRA
│   ├── eval/                 ← rubric.md, judge.py, baselines, report
│   ├── export_onnx.py
│   └── data/                 ← JSONL (gitignored except samples)
├── experiments/              ← spikes.md, MRL trade-off, GRU vs Markov, baselines, topic-tag accuracy
└── docs/                     ← post draft, screenshots, GIFs, demo script, first-user interview
```

## 13. Schedule

All dates are 2026, in the owner's local time. **Code freeze: Oct 17 EOD.** Tiers as in 5.1.

| Day | Must finish |
|---|---|
| **Thu Oct 15** | Repo + WXT skeleton. Spikes S1–S5 (section 14). **Observer + bins live in the owner's browser** so real data starts accumulating (vectors can be back-filled later only for samples that are still in view; otherwise bins alone). Recorder. Synthetic-day/teacher-input generator; measure teacher speed; **start teacher generation overnight.** |
| **Fri Oct 16** | Embedding pipeline with queue and budget. k-means, Hungarian matching, labeling UI with allowances. Rules + Markov scoring; banner and blur nudges. Replayer. Filter teacher data, **fine-tune 270M**, evaluate against baselines, convert to ONNX, publish to HF (with owner's yes). |
| **Sat Oct 17** | Deep blocks + residue facts; autopsy with validation. Popup and dashboard timeline. Pause, forget cascade, blocklist enforcement. **Package zip; friend installs by early afternoon**; first-user interview; fix their issues. Shoulds only if all Musts work by noon. **Freeze by EOD.** |
| **Sun Oct 18** | Showcase only: run experiments and baseline comparisons; write the post; record a 2–3 min video (demo mode, labelled) and GIFs; save the DevRelay agent session; publish with `#hf26challenge` **before 11:59 PM PDT** (with owner's yes). |

**Data caveat:** by Oct 18 the prediction models will have about 2.5 days of the owner's data. That is thin, and the post says so. The baselines keep the claims honest.

## 14. Day-one spikes

Each spike answers one question with a pass/fail result. Record results in `experiments/spikes.md`.

| ID | Question | Pass | If it fails |
|---|---|---|---|
| **S1** | Does item detection (7.3) work generically on YouTube Shorts, Instagram web, X, Reddit and a docs site, including item identity on Reels/Shorts? | A new item is detected for ≥ 90% of manual scrolls on each | Fall back to "viewport on change" for that site class |
| **S2** | Does EmbeddingGemma 2 **text + vision** run in an extension (offscreen document, then service worker) on WebGPU, within the budget (9.9)? | Both modalities return finite vectors; median embed latency < 300 ms per sample on the M4 Max; no NaNs; memory within target | Try other dtypes; worst case use text-only embeddings plus metadata (weakens the multimodal story) |
| **S3** | Do Transformers.js and TF.js WebGPU coexist in the same context? | Both load; GRU trains on synthetic data | Run TF.js on CPU |
| **S4** | Teacher throughput (31B, MTP, non-thinking) | ≥ 15 tok/s aggregate | Reduce to ~700 examples, shorten autopsies, or use Gemma 4 26B-A4B |
| **S5** | Can Unsloth fine-tune Gemma 3 270M on this Mac (scripted or Studio), and does the result convert to ONNX that loads in Transformers.js? | A 50-step toy run completes; converted model generates text in a web page | Use `mlx-tune`; if conversion breaks, try alternative export paths before Oct 16 noon |

## 15. Risks and fallbacks
| Risk | Likelihood | Impact | Mitigation / fallback |
|---|---|---|---|
| Too much scope for 2.5 days | High | High | Priority tiers (5.1); Shoulds only after Musts work by Oct 17 noon |
| Judges see "another doomscroll blocker" | High | High | Lead with Deep Workers, deep blocks, the personal map and prediction (3.4); show where embeddings split one domain into Deep and Drain |
| Vision encoder doesn't work in an extension | Medium | High | S2 first; fall back to text + metadata embeddings |
| Teacher generation too slow | Medium | Medium | S4; reduce count; parallel slots; MoE fallback |
| Unsloth training path on Mac blocked | Medium | High | Studio UI → mlx-tune |
| 270M quality too low | Medium | Medium | Structure + grounding validation + template fallback; baselines show honestly whether it helps |
| Not enough personal data for prediction | High | Medium | Markov + promotion rule; replayer + synthetic days for development; say so plainly in the post |
| Can't show a live spiral on camera | Medium | Medium | Demo mode replaying a prepared day, labelled in the video |
| Sites break item detection | Medium | Medium | Generic heuristics + viewport fallback |
| Battery, memory or jank | Medium | Medium | Resource budget (9.9) measured in S2 |
| Service worker shutdowns lose state | High | Low | Models in offscreen document; state in IndexedDB; heartbeat merging |
| Install warning scares the first user | Medium | Low | Onboarding explanation; open source; offline after download |
| Overclaiming privacy | Low | High | Honest wording (11.1) |
| Gemma license misuse in our published model | Low | High | Model card includes Gemma Terms and use restrictions (10.5) |

## 16. Showcase: judging criteria, post and demo

### 16.1 How we meet each judging criterion
| Criterion | Our answer |
|---|---|
| **Writing quality** (most weight) | A story-driven post for Deep Workers: "I let two Gemma models watch my browser for 3 days to protect my deep work." Real numbers from our experiments, a first-user story, honest limits |
| **Relevance (open AI at the core; would pay?)** | Both models are open-weight Gemma, running locally; the product cannot exist responsibly without them. A clear buyer (Deep Workers) with a clear reason (depth is their income) and a clear price ($29 one-time) |
| **Creativity** | Personal attention territories from multimodal embeddings, deep blocks and attention residue as the success measure, prediction instead of blocking, cross-modal topic tags. Positioned against existing tools (3.4) |
| **Technical execution** | Fully in-browser multimodal embeddings, our own clustering, prediction models that must beat baselines, a fine-tuned 270M with a measured before/after |
| **Best Use of Gemma** | Two Gemma models with distinct, essential roles (perception + explanation), a Gemma teacher, Gemma-only pipeline end to end |

### 16.2 Post outline (Side Hustle template; required tag `#hf26challenge`)
1. Hook: one real moment the extension protected a deep block, with the screenshot of the nudge.
2. What I built, for whom (Deep Workers, with credit to Newport's book and Leroy's research), and who would pay.
3. Demo: video + GIFs.
4. How it works: architecture diagram (Mermaid), the two Gemma models, the math (embeddings, Matryoshka, cross-modal zero-shot, k-means, Markov vs GRU).
5. Results: baselines table, prediction comparison, fine-tune before/after, MRL trade-off (if measured), the "one domain, two territories" example.
6. Why open innovation matters (3.6), including the honest privacy wording (11.1).
7. First user: what they said, would they pay at $29, what they asked for.
8. Limits and roadmap (browser only by design, thin data, Store listing, Pro).
9. Code, model link, embedded DevRelay agent session.

### 16.3 Demo video (2–3 min) + GIFs (D-30)
Script: install and first-run download → browse normally → open Reels → nudge appears, then escalates (demo mode, labelled) → dashboard timeline with deep blocks → labeling and allowances → autopsy → pause and forget → "everything you just saw ran on this laptop." GIFs: the nudge ladder, the timeline, labeling.

### 16.4 First-user interview (D-48)
After a day of use on Oct 17: (1) What did it get right about your attention? (2) What did it get wrong? (3) Did any nudge help, and did any annoy you? (4) At $29 one-time, would you buy it? Too cheap / about right / too expensive / wouldn't pay? (5) What would you want next?

### 16.5 After publishing
Offer a post-mortem on DEV only with the owner's yes. Never publish anything without explicit approval.

## 17. Decision log

| ID | Decision | Rationale | Rejected alternatives |
|---|---|---|---|
| D-01 | Idea: Doomscroll Autopsy | Most original of the shortlist; strongest "why open" case; most learning | Marginalia (reading coach), Drift (focus guard), Focus Forecast (TabPFN), Breathprint, Shelf, Loose Ends |
| D-02 | **Chromium browser extension**, not a desktop app | Exact signals (scroll, items, video skips, text) beat screenshot guessing; in-page nudges; no Screen Recording permission; easy install | Python daemon + web UI with screenshot capture; Swift menu-bar app; Tauri app |
| D-03 | **Everything inside the extension**, no local companion process | Simplest install; strongest privacy story | Extension + local Python companion |
| D-04 | Chromium only for v1 | Safari memory limits and separate extension model | Safari, Firefox |
| D-05 | **Drop Tinker**; Gemma only | Tinker has no Gemma models; one coherent all-Gemma story; we fine-tune locally ourselves. One win per challenge anyway | Tinker LoRA on Qwen3.5-4B |
| D-06 | No other partner categories | Focus; genuine use only | .tech domain, Render, GitHub Copilot, Tiger Data, MongoDB |
| D-07 | Generation model: **Gemma 3 270M, fine-tuned** | **324 MB** ONNX with 8-bit weights in the browser (T2: every 4-bit build of the fine-tune lost too much quality; the 273 MB figure was the published base model at 4 bits), ≈118 tok/s; Google's on-device fine-tune path exists; narrow tasks suit it. Text-only is fine: vision is handled by EmbeddingGemma 2 (9.3) | Gemma 4 E2B (≈2.3–3.1 GB in ONNX; possible future optional upgrade) |
| D-08 | Not Chrome's built-in Gemini Nano | Not open-weight, not Gemma | Prompt API |
| D-09 | Local training uses **Unsloth** | Owner's choice; official Mac training via Studio/Desktop (MLX) | Plain MLX-LM, PEFT on MPS |
| D-10 | Teacher: **Gemma 4 31B GGUF UD-Q4_K_XL, vision, MTP** | Highest-quality local Gemma; fits 64 GB; MTP speed-up; all-Gemma and open | Gemma 4 12B, E4B, 26B-A4B; Claude (closed) |
| D-11 | ~1,000 examples, non-thinking | Likely fits overnight; enough for two narrow tasks | 1,500; 500 hand-curated |
| D-12 | Eval: 100 held-out + 31B judge + 20 manual reviews | Numbers for the post plus a human check | Manual only; automatic only |
| D-13 | Labels: AI suggests, user confirms; unconfirmed at half weight | Labels are personal; low friction | Manual-only; fully automatic |
| D-14 | Cold start staged: rules → Markov → GRU | Useful from minute one; honest model progression | Observe-only 2 days; pre-train on synthetic sessions |
| D-15 | Unit of attention: **item in view**, generic detection | Matches how feeds are consumed; accurate items/min | Viewport on change (kept as fallback); page visit |
| D-16 | Screenshots only on visual feeds, ≤1 per 3 s, memory only | Text is cheaper and better where it exists | Every change; never |
| D-17 | 30-day rolling retention; no text, no images, no query strings | Enough history; minimal footprint | 7 days; forever |
| D-18 | 256d vectors by default; 768d dev mode (Could); never 128d | ~95% of multimodal quality at 1/3 storage; 128d breaks cross-modal tagging | 768d always |
| D-19 | k-means (ours) + silhouette + nightly Hungarian ID matching | Simple, explainable, stable labels | HDBSCAN port; online-only clustering |
| D-20 | GRU replaces Markov only if it wins on the held-out latest day | Honest with little data; gives the post a real result | Always GRU; blend |
| D-21 | Autopsy facts computed in code; model only phrases; grounding validation | A 270M model must not invent numbers | Free generation |
| D-22 | Escalating nudges: banner → blur → optional breathing pause | Effective without feeling controlling | Banner only; breathing every time |
| D-23 | Sensitivity Gentle/Balanced/Strict = 0.75/0.60/0.45; 15-min cooldown; quiet hours | Understandable control | Fixed threshold; self-adjusting threshold |
| D-24 | Popup + dashboard tab + in-page nudges (shadow DOM) | The timeline and map need room | Side panel; popup only |
| D-25 | Observe all sites except an editable privacy blocklist | Deep and Shallow time must be visible for the metrics to make sense | Feed sites only; user picks sites |
| D-26 | Models downloaded from HF on first run, pinned; fine-tune published on owner's HF account. **EmbeddingGemma 2 is pinned to `onnx-community/embeddinggemma-2-ONNX@daa72c51243991dfcaf9f9137d2c573d8f7790c0`, `q4f16` (M2, 2026-10-15); the ONNX runtime wasm ships inside the extension, so Hugging Face is the only network host** | Small package; Store-compatible | Bundle ~530 MB inside the extension |
| D-27 | Stack: WXT + TypeScript + Preact | Best-maintained MV3 framework; small UI lib | Vite + CRXJS; plain TS |
| D-28 | Business model: open-core, $29 one-time Pro (not built) | No server costs justify one-time pricing | $5/month; pay-what-you-want |
| D-29 | First user: friend on an Apple Silicon Mac, installs Oct 17 | Same platform as development | Windows/Linux friend; online community |
| D-30 | Demo: 2–3 min video + GIFs | Judges likely won't install it | GIFs only; video + installable zip |
| D-31 | Code freeze Oct 17 EOD; Oct 18 showcase only | Writing is weighted most heavily and needs a full day | Building through Oct 18 |
| D-32 | PDD lives in the repo as `PDD.md` | Agents and contributors see it next to the code | Claude Doc; both |
| D-33 | **Priority tiers** Must / Should / Could (5.1) | Guarantees a working product at freeze | Everything treated as required |
| D-34 | **Our own observer** with borrowed patterns (ActivityWatch heartbeats, rrweb throttling, optional Readability) | rrweb records the whole DOM, is costly on feeds, over-collects, and can't tell which item is in view | rrweb as the base; fork aw-watcher-web |
| D-35 | **Recorder, replayer, synthetic days and demo mode** (Must) | Test and demo without waiting for days of real data | Real data only |
| D-36 | **Baselines for every ML component** (Must) | Without them we can't claim the models add anything | Model-only evaluation |
| D-40 | Audience: **Deep Workers** (after Cal Newport's *Deep Work*); cite, never imply endorsement | Positive goal, clear buyer, differentiates from Week 1 entries and existing extensions | Freelancers ("billable attention"); students; adults with ADHD; general knowledge workers |
| D-41 | Labels: **Deep / Shallow / Drain** | Speaks the Deep Worker's language; "Shallow" is a more honest middle than "Neutral" | Nourishing/Neutral/Draining; Deep/Shallow/Distraction |
| D-42 | Headline metric: **deep blocks (≥25 min) + attention residue** | Rewards unbroken depth, per Newport and Leroy | Deep hours; drain minutes saved |
| D-43 | **Daily allowance per Drain territory** (default 15 min); spiral score counts only time beyond it | Some is fine, too much isn't; avoids nagging at the wrong time | Session intention prompt; both; fixed labels |
| D-44 | Voice: **calm, factual coach** for nudges and autopsy | Nudges interrupt; tone must not feel flippant; one style keeps fine-tuning simple | Witty pathologist; a mix |
| D-45 | **Report only browser activity.** Time outside the browser is never shown, counted or described; internally an `away` state is a model feature only, and away time pauses deep blocks | We don't observe it, so we make no claims about it | Count it as Deep by default; neutral; ask after each absence |
| D-46 | A visible tab with a playing video counts as active, even without input | Otherwise watching a talk or a Reel counts as idle | Plain `chrome.idle` |
| D-47 | Item identity from per-item URL paths, then media `currentSrc` + duration + poster, then text | Players reuse elements; `blob:` sources | `src` only |
| D-48 | Product success metrics (4.7) and a 5-question first-user interview with a $29 willingness-to-pay question | Evidence for "would someone pay?" | No metrics |
| D-49 | Resource budget: embedding queue with backpressure and sub-sampling; idle unload; 270M loaded on demand | Battery, memory and jank on a model-heavy extension | Always-loaded models, embed everything |
| D-50 | Honest privacy wording: vectors are not anonymous; claim is "never leaves your device"; titles optional | Embedding inversion is a known technique | "Anonymous numbers" claim |
| D-51 | MV3 platform details (12.2): `wasm-unsafe-eval`, HF host access, `unlimitedStorage`, WebGPU sharing check, blocklist checked first in content scripts | Avoid day-one surprises | — |
| D-52 | **Settings in `chrome.storage.local`**, not IndexedDB (M0, 2026-10-15) | Content scripts run in the page's origin and can't read the extension's IndexedDB; pause and blocklist must be checked there first, without waking the service worker | `settings` store in IndexedDB mirrored to `chrome.storage.local`; content scripts asking the service worker on every page load |
| D-53 | **Territory re-clustering keeps owner-confirmed territories** (M3, 2026-10-16): k chosen on a subsample, clusters < 5 members dissolved, unmatched confirmed territories stay dormant instead of being deleted | A changed k must never silently erase a label the owner confirmed; full-data k selection cost ~100 G multiply-adds | Delete unmatched territories (PDD 9.2 as first written) |
| D-54 | **Nudge details settled in M4** (2026-10-16): (1) no nudge while a Drain territory still has allowance left (the score decides *whether*, this guard decides *when*, so nudges fire when the allowance is used up); (2) unconfirmed territories score and nudge with their rule-based suggested label so hour-0 detection works; (3) step-2 buttons are **Back to it** / **Keep going** until the breathing step exists (M8 adds **Take a breath**); (4) escalation to step 2 needs the previous nudge within 60 min and ignored, snoozed or unanswered; a *Back to it* resets to step 1; (5) replays never write to the stored data | Makes "within the allowance" unambiguous and the demo's timing predictable; keeps the owner's data clean | Nudge on the predicted overrun before the allowance is used up; only confirmed labels |
| D-55 | **Metric definitions settled in M5** (2026-10-16): (1) a *deep block* is measured in browsing time (bins with active seconds, away/idle/unobserved bins are gaps that pause the clock) from the first to the last Deep bin, so interruptions of ≤ 120 s (exactly 2 min allowed) are included and a trailing interruption is not; a block needs ≥ 1,500 s; (2) **a gap longer than 30 minutes ends a block** (and a "return to Deep"), so lunch-sized absences can't stitch two short stretches into one block; shorter gaps only pause (D-42/D-45 otherwise unchanged); (3) a block belongs to the day it starts in; (4) a *switch out of Deep* is a Deep bin followed by a Shallow or Drain bin (unlabelled bins neither count nor cancel one); mean time back counts returns only; (5) labels used are confirmed-else-suggested, as scoring uses; (6) unanswered nudges count as ignored; (7) `vs7Day` needs 7 earlier days within the last 14 and uses stored reports, else facts computed live from bins | The spec's "away pauses, never breaks" is right for short absences; unbounded pausing produces blocks nobody would call focus. The other points make the numbers reproducible | Unbounded pause; counting switches into unlabelled territories; partial 7-day average |
| D-56 | **Template autopsy is a validated, always-valid fallback; no D3** (M5, 2026-10-16): `renderAutopsy(facts)` always yields 120-180 words (optional sentences dropped by priority, neutral fillers added) and must pass `checkAutopsy`, a TypeScript port of T1's `check_autopsy` (hand-written, so it runs under the MV3 CSP, K-01). The timeline is plain SVG in Preact | M6 needs a fallback that can never fail the validator it applies to the model; a chart library adds ~100 kB for one chart | Free-form template; D3 |
| D-57 | **Privacy cascade details settled in M5** (2026-10-16): forget range deletes samples, bins, nudges and recorder events in the range; forget site deletes the site's samples (host + subdomains) and the bins those items covered (bins carry no origin); both recompute the centroid and size of affected territories (a territory left empty is deleted if unconfirmed, dormant if confirmed, D-53), rename unconfirmed ones, regenerate the reports of affected days (deleted if the day is empty), refresh the Markov model and log only kind + range/site. Wipe clears every store, the Cache API (model cache), session and local storage, and leaves no log entry. Handlers run in the service worker, one at a time and never during a re-cluster. Retention drops raw data older than the setting, reports once their whole day is outside it | The PDD 11.4 cascade needs concrete rules; running in the worker avoids racing the territory sweep | Deleting bins by time only for site forget; keeping a wipe log |
| D-58 | **The fine-tuned 270M is bundled with the extension until the owner publishes it** (M6, 2026-10-16): `scripts/copy-model.mjs` copies the T2 ONNX export into `public/models/doomscroll-270m/` at build time (git-ignored); `lib/gen/config.ts` selects `bundled` or `hf` (repo + pinned commit) in one line. Also: model names and suggested labels are used only for unconfirmed territories; a rule-based Drain for a known feed is kept when the model says otherwise; the autopsy is accepted only if it passes `checkAutopsy` **and** the strict checks (K-07), after one sampled regeneration, else the template | Publishing to Hugging Face needs the owner's explicit yes (the agent instructions) and he was unavailable; bundling keeps Load-unpacked installs working offline today. A wrongly relaxed feed would silence nudges, a wrongly strict one only asks for a click | Waiting for HF (blocks M6 and M7); downloading from a personal URL |
| D-59 | **Retrain on corrected data, and a length tolerance for model output** (T3/M6, 2026-10-16): the shipped 270M is `run3`, trained on T1 data with the 32 strict-check failures dropped, the nudge paragraph rewritten from `facts` and varied (160 real-use nudge variants), and texts over 172 words dropped; the runtime accepts a model autopsy of **110-200 words** (PDD says ≈ 120-180; the template stays inside 120-180) | M6 measured 34.8% template fallback with T2's model, mostly wrong nudge states (ignored-only configs were rare in the data); after the retrain it is 13.0% on the same 23 replayed days. Faithful 185-195-word texts on busy days are not a defect for the reader | Judge-only acceptance; rejecting any text over 180 words; leaving the data as is |
| D-60 | **Release packaging and onboarding settled in M7** (2026-10-17): the first user gets a zip of the unpacked build with the 270M bundled (D-58; ≈ 300 MB zipped); onboarding opens by itself on install (`onInstalled` reason `install`), explains observed/stored/limits with the PDD 11.1 wording and the install warning, starts the EmbeddingGemma 2 download on a button (`embed-warm`, fire and forget; also starts by itself on the first item), lets the user edit the blocklist and pick a sensitivity, and stores `onboardedAt` in `chrome.storage.local`; the zip is verified by unzipping it into a fresh profile (`probe:m7`, which re-runs the M5 and M4 probes on it). The onboarding copy never describes time outside the browser (guarded by `tests/browser-only.test.ts`) | The friend installs by hand without help; a plain, honest first screen is the privacy story. A fresh-profile test on the exact artifact catches packaging bugs the dev build hides | Chrome Web Store (days of review); a model download for the writer (needs the owner's HF publish) |
| D-61 | **GRU details settled in M8** (2026-10-17): train with TF.js in the offscreen document, **infer in plain TypeScript** from stored weights (a test proves it matches TF.js to 4 decimals), so the service worker never loads TF.js; `yieldEvery: 'never'` because TF.js's default yield uses `requestAnimationFrame`, which never fires in an offscreen document (training hung forever); promotion needs a held-out AUC at least **0.005** above Markov (run-to-run GRU AUC varied by more than that on the same data, so a bare "strictly higher" would flip on noise) and a full latest-day split; `TF.js` moves from devDependencies to dependencies | The PDD's "TF.js, WebGPU or CPU" holds, while keeping the always-on scoring path free of a 1+ MB library. The margin is what makes "ties go to Markov" true in practice | Inference in TF.js in the worker; strict `>`; training in the service worker |

(D-37 to D-39 intentionally unused.)

## 18. Open questions and things to verify
| ID | Item | Where it gets resolved |
|---|---|---|
| V-01 | WebGPU in offscreen document vs service worker for Transformers.js | S2 — Resolved (S2): offscreen document, WebGPU, q4f16. |
| V-02 | EmbeddingGemma 2 vision encoder via Transformers.js inside an extension; interleaved text + image input API | S2 — Resolved (S2): `AutoProcessor` + `AutoModel`; text with `<|image|>` and `images=[[img]]` gives one embedding. |
| V-03 | Exact task-prefix strings for EmbeddingGemma 2 (copy from model card) | S2 — Resolved (S2): `task: clustering | query: `. |
| V-04 | Teacher tokens/s with MTP on the M4 Max; whether Unsloth Studio exposes an API | S4 |
| V-05 | Unsloth Core scripted training on Apple Silicon vs Studio-only | S5 — Resolved (S5): scripted `unsloth train` from Studio 2026.10.5 (MLX backend); 732 steps in ~15 min. |
| V-06 | ONNX conversion of the fine-tuned 270M loads and generates in Transformers.js | S5 — Resolved (S5): onnxruntime-genai builder, 8-bit weights, 324 MB, `dtype: "fp16"`, ~118 tok/s. 4-bit loses too much quality. |
| V-07 | Offscreen document `reasons` value accepted for ML workloads | S2 — Resolved (S2): `WORKERS`. |
| V-08 | Week 2 rules: new-project and one-entry rules carried over from Week 1 (assumed) | Check the challenge page before publishing |
| V-09 | Required post template content for Side Hustle | Challenge page, Oct 18 |
| V-10 | Hugging Face repo name for the fine-tune | Owner, Oct 16 |
| V-11 | Deep-block thresholds (25 min block, 2 min interruption) feel right on real data | Owner's first day of data, Oct 16 |
| V-12 | Item identity on Instagram Reels web and YouTube Shorts (D-47) | S1 |

## 19. Glossary
- **Deep Worker:** our audience; someone whose best output needs long, unbroken focus.
- **Deep / Shallow / Drain:** the three territory labels (4.1).
- **Deep block:** ≥ 25 minutes in Deep territories, interruptions ≤ 2 minutes; away time pauses it.
- **Attention residue:** switches out of Deep, and the mean time to return (after Sophie Leroy's research).
- **Allowance:** daily minutes of a Drain territory that don't count toward a spiral.
- **Sample:** one item in view, embedded once.
- **Bin:** a 30-second time slice with aggregated features.
- **Territory:** a cluster of samples with a stable ID, a name, a label and (for Drain) an allowance.
- **Away:** internal state when the browser isn't focused; never shown or reported.
- **Content velocity:** how fast content passes: scroll px/s, items per minute, skip rate.
- **Spiral score:** predicted Drain minutes beyond allowance over the next 10 minutes, divided by 10.
- **Nudge ladder:** banner → blur → breathing pause.
- **Autopsy:** the nightly write-up.
- **Heartbeat:** a "still here" event; consecutive heartbeats merge into one span (ActivityWatch pattern).
- **Matryoshka (MRL):** training that makes the first N dimensions of an embedding usable on their own.
- **Teacher / student:** the large model that writes training examples / the small model that learns from them.
- **MTP:** multi-token prediction; speculative decoding that speeds up generation without changing outputs.

## 20. References
- Challenge: https://dev.to/challenges/hacktoberfest-week2-2026-10-12 · Hub: https://dev.to/challenges/hf26
- Cal Newport, *Deep Work: Rules for Focused Success in a Distracted World* (2016). Sophie Leroy, "Why is it so hard to do my work? The challenge of attention residue when switching between work tasks", *Organizational Behavior and Human Decision Processes* (2009).
- EmbeddingGemma 2 (ONNX, Transformers.js): https://huggingface.co/onnx-community/embeddinggemma-2-ONNX · Model: https://huggingface.co/google/embeddinggemma-2
- Article: "EmbeddingGemma 2: How Google's Open Multimodal Embedding Model Works" by Prabhakar Chaudhary: https://dev.to/prabhakar_chaudhary_7afe4/embeddinggemma-2-how-googles-open-multimodal-embedding-model-works-2if3
- Gemma 3 270M ONNX: https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX
- Google, "Own your AI: fine-tune Gemma 3 270M and run it on-device": https://developers.googleblog.com/own-your-ai-fine-tune-gemma-3-270m-for-on-device/
- Gemma 4 E2B mobile ONNX (sizes): https://huggingface.co/onnx-community/gemma-4-E2B-it-qat-mobile-ONNX
- Hugging Face, Transformers.js in a Chrome extension: https://huggingface.co/blog/transformersjs-chrome-extension
- Gemma Gem (Gemma 4 in a Chrome extension): https://github.com/kessler/gemma-gem
- Chrome built-in AI: https://developer.chrome.com/docs/ai/built-in
- Unsloth on macOS: https://unsloth.ai/docs/get-started/install/mac · MTP guide: https://unsloth.ai/docs/models/mtp · Gemma 3 guide: https://unsloth.ai/docs/models/tutorials/gemma-3-how-to-run-and-fine-tune
- mlx-tune (formerly unsloth-mlx): https://github.com/masna-ai/unsloth-mlx
- ActivityWatch web watcher: https://addons.mozilla.org/firefox/addon/aw-watcher-web/
- rrweb-based recording overhead: PostHog, https://posthog.com/blog/session-recording-performance · Sentry Session Replay troubleshooting, https://docs.sentry.io/platforms/javascript/guides/react-router/session-replay/troubleshooting/
- Competitors: RickStop https://chromeboard.com/extension/rickstop-anti-doomscroll-hjcdolbkambehmolcmjmddhdkgopbjbp · Rewire https://addons.mozilla.org/firefox/addon/rewire/ · DoomScroll Guardian https://chromeboard.com/extension/doomscroll-guardian-20-omncnhmbgnobhhbegnjfmmhdckcnjdpe · Sentivisor https://chromeboard.com/extension/sentivisor-pbijedghbpddceigfnigieogjcfcgadp
- Week 1 entries in this space (DEV): "Touchwood" https://dev.to/lillygrace_213530f21c9600/touchwood-my-feeds-only-unlock-after-an-open-weight-model-sees-me-outside-37eo · "GrassLock" https://dev.to/webpixar01/grasslock-an-in-browser-open-weight-ai-that-forces-you-to-touch-grass-published-true-1jbd · "Dayloom" https://dev.to/amayl97/dayloom-what-if-ai-helped-you-spend-less-time-on-your-screen-1mbd · "OFFSCREEN" https://dev.to/leo1612d/offscreen-a-local-gemma-powered-planner-for-spending-less-time-online-3kap · "Outside Hour" https://dev.to/xexpertai/outside-hour-a-local-gemma-model-that-wants-you-off-your-phone-in-60-seconds-564b
- Tinker (rejected, for the record): https://tinker-docs.thinkingmachines.ai/tinker/models/models_and_pricing/
