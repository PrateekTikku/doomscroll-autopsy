*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2)*

It's 11 a.m. You open one tab to look something up. Two hours later you're still scrolling, and the best focus of your day is gone.

I wanted a tool that would have stopped me at minute ten, not told me about it at midnight. That tool turned out to need two open models, a lot of boring engineering, and one rule I refused to bend: **nothing I browse leaves my laptop.**

## What I Built

**Doomscroll Autopsy** is a Chrome extension (Apple Silicon Mac + Chrome for now) that does four things:

1. **Reads what you read.** Every post, video or page that scrolls past becomes a vector: a list of numbers that captures its meaning, computed on your local GPU by **EmbeddingGemma**.
2. **Builds a map of your attention.** Those vectors group into "territories" that are yours, discovered from your habits, then labelled Deep, Shallow or Drain. It is not a blocklist. The same site can land in different places depending on what you're actually looking at.
3. **Predicts the rabbit hole, then nudges.** A small model watches the signals that come before one (how fast you scroll, where you just came from, how long you've stayed, whether you just left deep work). When they add up you get a calm nudge, and if you ignore it, it escalates slowly: a banner, then a blur, then a 30-second breathing pause.
4. **Writes your autopsy.** Each night a **fine-tuned Gemma 3 270M** reads the day's numbers and writes what happened: when you went deep, what broke it, what to change tomorrow.

The metric it cares about isn't "minutes blocked." It's **deep blocks** (unbroken stretches of focus) and **attention residue** (how long it takes you to get back after a switch), after Cal Newport's *Deep Work* and Sophie Leroy's research. I credit both for the vocabulary; neither has anything to do with this project.

Here is one day from the demo profile on the dashboard:

![Dashboard: four deep blocks, a timeline of Deep, Shallow and Drain, and an autopsy written by the on-device model](https://raw.githubusercontent.com/PrateekTikku/doomscroll-autopsy/main/docs/showcase/M9/dashboard-day.png)

### Who would pay, and why

**Deep Workers**: developers, writers, researchers, designers, grad students and freelancers whose income depends on long, unbroken thinking. They already pay for focus apps, noise-cancelling headphones and coworking. What they don't have is something that sees the *content* of their attention, learns their patterns and acts before the damage, without shipping their reading history to a server.

The plan is open-core: the core (observer, territories, map, nudges, privacy controls) is MIT on GitHub, and a **$29 one-time Pro** adds weekly trends and longer history. One-time pricing only works because there is no inference bill, which is a point I come back to below. I have not sold a single copy; $29 is a hypothesis, and I say so plainly in the first-user section.

## Demo

{% embed https://youtu.be/XP_dJrgPX_Y %}

The dashboard in it runs on a demo profile I built from my own browsing history (which sites, at what hours) with scroll and dwell reconstructed, so there was enough data to show every screen. The models, the clustering and the autopsies you see are the real extension running on it.

## Code

{% embed https://github.com/PrateekTikku/doomscroll-autopsy %}

- **Fine-tuned model (Gemma 3 270M, ONNX):** [PrateekTikku/doomscroll-autopsy-gemma-3-270m](https://huggingface.co/PrateekTikku/doomscroll-autopsy-gemma-3-270m)
- **Install:** download `doomscroll-autopsy-0.3.0.zip` from the [latest release](https://github.com/PrateekTikku/doomscroll-autopsy/releases/tag/v0.3.0), unzip it somewhere permanent, then Load unpacked in `chrome://extensions` (about 300 MB because the writer model is bundled; the README has the 60-second steps).
- **Build from source:** `cd extension && npm ci && npm run build`

## How I Built It

### The pipeline

![Architecture: perceive with EmbeddingGemma 2, understand and act with territories, prediction and the nudge ladder, explain with the fine-tuned Gemma 3 270M, all inside the browser](https://raw.githubusercontent.com/PrateekTikku/doomscroll-autopsy/main/docs/showcase/M9/architecture.png)

**Perception.** EmbeddingGemma 2 runs in an offscreen extension document through Transformers.js on WebGPU (q4f16, about 255 MB, downloaded once). On my M4 Max it embeds a text item in a median of **16 ms** and a screenshot in **213 ms**; same-topic items sit at cosine 0.99 and unrelated ones at 0.75 in 256 dimensions.

**Territories.** I wrote my own spherical k-means with silhouette scoring to choose *k*, and Hungarian matching so a territory keeps its name and label when the data shifts. The Gemma 270M names each one ("AI and machine learning research", "Short form video consumption") from its top sites and topic tags, which come from cosine similarity against 324 hand-written topic phrases embedded as text, a zero-shot trick that works because EmbeddingGemma puts text and images in the same space.

**Prediction.** A rules model works from day one. A Markov model and a small GRU (trained in the browser with TF.js) must beat it on a held-out day before they're allowed to drive nudges. More on how that went in the limits section.

**Explaining.** The generator never gets to say whatever it likes. Its output passes validators (every number and clock time must exist in the day's facts, no invented triggers, 110 to 200 words), and if it fails, a template writes the autopsy instead. The dashboard tells you which one you got.

### Fine-tuning a 270M model for two narrow jobs

A general API can write a paragraph about your day. It can't be trusted to do it from a small, on-device model without inventing numbers. So I fine-tuned Gemma 3 270M for exactly two tasks, naming territories and writing the autopsy, using 1,073 examples written by a 31B Gemma teacher from synthetic persona days, then exported it to an 8-bit ONNX of 324 MB that generates at about 118 tokens/s in the browser.

On 100 held-out examples (blind judge: Gemma 4 31B, the same model that wrote the training examples, so I treat the judge score as biased upward):

| Task | System | Valid output | Grounded in the facts | Judge mean (1 to 5) |
|---|---|---|---|---|
| Naming | Template baseline | 100% | 100% | 2.92 |
| Naming | Base 270M | 0% | 0% | 2.53 |
| Naming | **Fine-tuned 270M (shipped)** | **97%** | **97%** | **4.99** |
| Autopsy | Base 270M | 12% right length | 38% | 1.07 |
| Autopsy | Template baseline | n/a | 100% | 4.30 |
| Autopsy | **Fine-tuned 270M (shipped)** | **95% right length** | **92%** | **4.51** |

Two honest notes. The template autopsy is dull but always correct, so the fine-tuned model's edge on the judge score is small; what it adds is voice and variety. And the first model slipped on small facts, such as calling an ignored nudge "snoozed". A second pass that dropped the bad training examples and added nudge-state cases cut the template fallback in the real extension from **35% to 13%** on 23 replayed days. 4-bit quantization collapsed quality (autopsy grounding fell to 52%), so I shipped 8-bit.

### Working with AI

I built this as an FDE in close collaboration with **Claude Code**. I set the idea, product direction and the non-negotiables (privacy first, prediction instead of blocking, every claim backed by a measurement) in a written design document and a milestone plan, and Claude Code helped with implementation, the tests and the evaluation runs, milestone by milestone against that plan. The post and the video were made with AI assistance as well, which DEV asks me to disclose, and I checked every number in them against the evaluation files in the repo.

## Why Does Open Innovation Matter?

- **Privacy is the product.** A tool that sees everything you read cannot responsibly send it to someone else's API. Running open weights locally is what makes this product possible at all. The only network traffic is the one-time model download.
- **Cost makes the business model work.** No inference bill means no subscription. $29 once is honest pricing.
- **Specialisation.** A 270M model fine-tuned for two narrow jobs beats a base model on those jobs by a wide margin, and fits in a browser tab.
- **No lock-in.** Weights are pinned and cached on the device. If a vendor changes pricing or terms, the product keeps working.

**Best Use of Gemma:** two Gemma models with separate, essential jobs (EmbeddingGemma for perception, Gemma 3 270M for explanation), plus a 31B Gemma as teacher and judge. The whole pipeline is Gemma end to end.

## My First User

The first user is me, and I don't have much to report yet. I've only lived with it for a short stretch, nowhere near enough days to claim it changed my habits, and I won't pretend a handful of nudges proves anything. A friend on an Apple Silicon Mac has the build too, but there wasn't time for a real trial before the deadline, so there is **no outside feedback and no paying customer to report**. The questions I'm going to ask them (what did it get right, what did it get wrong, did a nudge help or annoy, would you pay $29) are written down in the repo, and I'll add the answers when I have them.

## Limits, said plainly

- **Platform:** Apple Silicon Mac, Chromium and WebGPU only, for the hackathon.
- **Prediction is unproven on real people.** On synthetic personas the rules and Markov models are nearly tied (spiral AUC 0.995 vs 0.996) and my GRU did not beat Markov, so Markov drives the nudges. Synthetic days make every model look good, so this checks the machinery, not predictive skill. I have not yet run it over weeks of a real person's browsing.
- **Territory names can repeat** ("Social media and tech forums 2") when content overlaps. That's the model being honest about overlapping clusters, not a bug I've hidden.
- **Vectors are not anonymous.** Embeddings can be partly inverted back to text by known research techniques. My claim is *your data never leaves your device*, never "we only store anonymous numbers." Item text, screenshots and query strings are never stored; vectors and metadata are kept for 30 days; pause, forget-one-capture and wipe are one click.
- **It never looks outside the browser.** It doesn't count, show or guess time away from Chrome.
- **Size:** the install is about 300 MB because the writer model is bundled.

Thanks for reading. If you do deep work for a living, I'd love to know what a nudge would have to look like for you to keep it switched on.

## Prize Categories

Best Use of Gemma, and the overall prize.
