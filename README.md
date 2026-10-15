# Doomscroll Autopsy

*Protect your deep work from the feed.*

A Chromium (Manifest V3) extension for Deep Workers. It embeds what you look at in the browser with **EmbeddingGemma 2**, groups it into personal territories labelled **Deep / Shallow / Drain**, predicts when you're about to spiral, nudges you inside the page, and writes a nightly autopsy with a **fine-tuned Gemma 3 270M**. All inference runs in the browser; nothing you browse leaves your device. The only network traffic is the one-time model download from Hugging Face.

Status: under construction for the DEV Hacktoberfest Week 2 challenge. Design: [`PDD.md`](PDD.md).

## Build and load

Requirements: Node 24 + npm, Chrome (or another Chromium browser).

```sh
cd extension
npm ci
npm run build          # → extension/.output/chrome-mv3
```

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `extension/.output/chrome-mv3`.

**For daily use** (your real data accumulates here): run `npm run live` and load `extension/.live/chrome-mv3` instead. That folder only changes when you run `npm run live` again (then click the reload icon in `chrome://extensions`). Keep it at the same path: Chrome ties an unpacked extension's ID, and so its stored data, to the folder.

Already-open tabs are picked up on install. Pages Chrome can't script (`chrome://`, the Web Store) and blocklisted sites are never observed.

`npm run dev` starts WXT in watch mode with hot reload; load `extension/.output/chrome-mv3-dev` the same way (once), and it reloads on save.

## Tests

```sh
cd extension && npm test            # Vitest
cd extension && npm run smoke       # headless Chrome: load the build, open popup/dashboard (after npm run build)
cd extension && npm run probe:s1    # headless Chrome: scroll public sites, count detected items, check privacy (~7 min)
cd training && uv run pytest        # Python 3.13 via uv
```

## Layout

| Path | What |
|---|---|
| `extension/` | WXT + TypeScript + Preact extension (`entrypoints/`, `lib/`, `assets/`) |
| `shared/` | JSON Schemas shared by both lanes, `personas.json`, generated `types.ts` |
| `training/` | Teacher data, fine-tuning, evaluation, ONNX export (Python, `uv`) |
| `experiments/` | Spike results and measurements |
| `docs/` | Plans, showcase material, post draft |

## Privacy

No item text, screenshots or query strings are ever stored. Stored vectors are not anonymous (embeddings can be partly inverted), which is why the claim is simply that **your data never leaves your device**. See PDD section 11.

## License

MIT (see `LICENSE`). EmbeddingGemma 2 is Apache 2.0; the fine-tuned Gemma 3 270M is distributed under the Gemma Terms of Use.
