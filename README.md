# Doomscroll Autopsy

*Protect your deep work from the feed.*

A Chromium (Manifest V3) extension for Deep Workers. It embeds what you look at in the browser with **EmbeddingGemma 2**, groups it into personal territories labelled **Deep / Shallow / Drain**, predicts when you're about to spiral, nudges you inside the page, and writes a nightly autopsy with a **fine-tuned Gemma 3 270M**. All inference runs in the browser; nothing you browse leaves your device. The only network traffic is the one-time model download from Hugging Face.

Status: release candidate (0.3.0), built for the DEV Hacktoberfest Open-Source AI Challenge, Week 2. Design: [`PDD.md`](PDD.md).

- **Fine-tuned model (Gemma 3 270M, ONNX):** <https://huggingface.co/PrateekTikku/doomscroll-autopsy-gemma-3-270m>
- **Demo video and poster:** [`submission/`](submission/)
- **Release zip (about 300 MB, includes the model):** the latest GitHub Release

## Install (for a first user)

Download `doomscroll-autopsy-<version>.zip` from the latest GitHub Release (about 300 MB: the fine-tuned writer model is inside).

1. Unzip it somewhere permanent (for example `~/Applications/doomscroll-autopsy`). Chrome ties the extension and its stored data to that folder, so don't move or delete it afterwards.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. A welcome page opens. Read it, review the blocklist, press **Download and start now** (a one-time ~255 MB download of EmbeddingGemma 2 from Hugging Face; about a minute on a good connection), then **I've read this, let's go**.
4. Pin the extension (puzzle icon → pin). Browse as usual.

What's in it: deep blocks and attention residue (popup and dashboard), territories with names and topic tags, an attention map, spiral prediction (rules, Markov, and a GRU that is used only if it beats Markov on your own data), in-page nudges (banner, blur, optional 30-second breathing pause), a nightly autopsy, and privacy controls including forgetting a single item.

What to expect: nudges start from hour 0 with simple rules; territories appear after about two hours of browsing and ask you to confirm their labels; the Markov model takes over the next evening; the nightly autopsy is written the first time Chrome is open after 3 am (or press "Write today's autopsy now" on the dashboard).

Requirements: Chrome or another Chromium browser with **WebGPU** (Apple Silicon Macs are fine), about 1.5 GB of free memory while the models run. Chrome shows "read and change all your data on all websites": that is how it sees what you scroll; see Privacy below.

Limits, by design: it only knows about this browser. It never counts or shows anything outside it, not phones and not other apps. Chromium only (no Safari or Firefox). Incognito is off unless you enable it.

To remove everything: Dashboard → Privacy → **Wipe everything**, then remove the extension.

## Build and load (developers)

Requirements: Node 24 + npm, Chrome (or another Chromium browser).

```sh
cd extension
npm ci
npm run build          # → extension/.output/chrome-mv3
npm run zip            # → releases/doomscroll-autopsy-<version>.zip (gitignored), prints size and sha256
```

The build bundles the fine-tuned 270M from `training/data/runs/run3/onnx_final` (see `scripts/copy-model.mjs`); without it the writer reports "unavailable" and templates are used. To get the same weights from Hugging Face: `hf download PrateekTikku/doomscroll-autopsy-gemma-3-270m --local-dir ./model`, then build with `DOOMSCROLL_MODEL_DIR=$PWD/model`.

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `extension/.output/chrome-mv3`.

**For daily use** (your real data accumulates here): run `npm run live` and load `extension/.live/chrome-mv3` instead. That folder only changes when you run `npm run live` again (then click the reload icon in `chrome://extensions`). Keep it at the same path: Chrome ties an unpacked extension's ID, and so its stored data, to the folder.

Already-open tabs are picked up on install. Pages Chrome can't script (`chrome://`, the Web Store) and blocklisted sites are never observed.

`npm run dev` starts WXT in watch mode with hot reload; load `extension/.output/chrome-mv3-dev` the same way (once), and it reloads on save.

## Tests

```sh
cd extension && npm test            # Vitest
cd extension && npm run probe:m7   # fresh profile on the unzipped release: onboarding, download, then probe:m5 + probe:m4 (after npm run zip && npm run eval:m5)
cd extension && npm run smoke       # headless Chrome: load the build, open popup/dashboard (after npm run build)
cd extension && npm run probe:s1    # headless Chrome: scroll public sites, count detected items, check privacy (~7 min)
cd extension && npm run build:spike && npm run probe:s2   # EmbeddingGemma 2 latency / NaN / memory (downloads ~255 MB once)
cd training && uv run pytest        # Python 3.13 via uv
```

## Layout

| Path | What |
|---|---|
| `extension/` | WXT + TypeScript + Preact extension (`entrypoints/`, `lib/`, `assets/`) |
| `shared/` | JSON Schemas shared by both lanes, `personas.json`, generated `types.ts` |
| `training/` | Teacher data, fine-tuning, evaluation, ONNX export (Python, `uv`) |
| `experiments/` | Spike results and measurements |
| `docs/` | Plans and showcase material |

## Privacy

No item text, screenshots or query strings are ever stored. Stored vectors are not anonymous (embeddings can be partly inverted), which is why the claim is simply that **your data never leaves your device**. See PDD section 11.

## License

The code is MIT (see `LICENSE`). The Gemma models are not covered by that license: EmbeddingGemma and the fine-tuned Gemma 3 270M are used and distributed under the Gemma Terms of Use (full text in [`training/GEMMA_TERMS.md`](training/GEMMA_TERMS.md)); EmbeddingGemma is downloaded from its own Hugging Face page at first run.
