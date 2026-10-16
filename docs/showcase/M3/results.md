# M3 results: territories and labeling

Raw data: `m3-probe.json` (headless Chrome, fresh profile, EmbeddingGemma 2 q4f16 on WebGPU, 60 scrolls on each of YouTube Shorts, Mastodon, Bluesky, MDN and Wikipedia; dev mode on, so vectors were stored at 768d and truncated to 256d for clustering). `npm run probe:s1` with `M3=1`.

## Pipeline on real embeddings (headless run, 202 embedded items of 225)
| Measure | Result |
|---|---|
| Items → territories | 202 vectors → **6 territories** (an earlier run of the same sites gave 10) |
| Re-cluster time | **123 ms** (service worker) |
| Samples with a territory | 225 of 225 (the 23 vectorless ones carried the previous item's territory) |
| Bins with a territory | 21 of 21 |
| Re-cluster of the same data | all 6 territories matched (centroid similarity ≥ 0.99999), 0 new |
| Labels: clicked Deep on one row and Drain on another in the dashboard, forced a second re-cluster | both labels and the Drain allowance (15 min) **survived**, same IDs |
| Privacy scan (probe) | 0 URLs with `?`/`#`, 0 records with text, 0 of 163 page-text lines found in storage |

Territories found: Bluesky/Mastodon feeds together (86 items), YouTube Shorts (62), Mastodon explore (29), MDN docs (27), Wikipedia (16 + 2). The rule-based suggestion marked Shorts territories **Drain**; nothing else got a suggestion. The embedding grouped two *different* domains with the same kind of content (Bluesky and Mastodon posts) into one territory, which a domain-only view can't do.

## "One domain, many territories": not yet shown on the owner's data
In the first headless run (k = 10) YouTube Shorts alone split into 3 territories; in the second (k = 6) it was one. With Shorts-only YouTube and ~200 items, whether a domain splits depends on the k that the silhouette picks, so this run is **not** the evidence for the post. The real example (YouTube tutorials vs Shorts, or Reddit threads in a work subreddit vs a meme subreddit) needs the owner's browsing: Dashboard → Developer → dev mode → Compute evidence. See `CAPTURE.md`.

## Not measured
- **Match stability on a changing data set (C2):** the second run used identical data, so similarities were ~1.0. How the 0.8 threshold behaves when data grows or drifts is unmeasured on real data; the dashboard status now shows the weakest match after each re-cluster so the owner can see it.
- **Real-profile timing and memory:** only headless numbers.

Spike C1 (cost of choosing k): see `experiments/spikes.md`.
