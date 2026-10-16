# M4 results: spiral prediction, nudges, replay

## Demo day (replayed, nothing stored)
`demoDay()` in `lib/replay/demo.ts`: 38 min of docs reading, a 4 min Slack break, then a 38 min YouTube Shorts spiral (Drain, allowance 15 min), balanced sensitivity, rules mode.

| What | Expected | Measured (virtual minutes from start) |
|---|---|---|
| Banner (step 1) | 57 ± 2 (allowance used up at minute 57) | 57:00, score 0.91–0.95 |
| Blur (step 2) | one 15-minute cooldown later, ≈ 72 | 72:00, score 0.87–0.88 |
| Nudges during the docs / Slack part | none | none |
| A user who answers "Back to it" | banner again, not a blur | banner, banner |

Unit test: `lib/replay/replay.test.ts` ("demo mode"). Headless run (`npm run probe:m4`, demo at 120×): banner on the page in front at 29–30 s real time, blur at 37 s, Replay flag set for the popup. Screenshots in this folder: `demo-banner.png`, `demo-blur.png`, `nudge-*.png`.

## Nudge rendering (spike N1)
Pass on a strict-CSP local page, a plain page, github.com and youtube.com/shorts; refused when paused; never delivered to blocklisted pages. See `experiments/spikes.md` N1.

## Rules vs Markov: synthetic days
`npm run eval:m4` → `synthetic-eval.md` / `.json`: 6 personas × 14 days, held-out latest day, cells are rules / Markov.

**Read this table with its limits.** The days come from a generator we wrote, in which a Drain stretch is a long run on one site. That makes the spiral label almost a function of the current territory, so **AUC saturates (≈ 0.99–1.00) for both modes and next-territory top-1 is identical (96.4%)** because bins are dominated by staying where you are. The one place the two differ is when the next territory is *not* the current one: top-3 on those switches is 80.4% for persistence-based rules and 88.9% for Markov on average (the Markov model learns the common hops, such as Slack to calendar), but the spread between personas is large (designer 35.5% vs 87.1%). The honest summary: on synthetic data Markov is a little better at predicting switches and the same elsewhere; the real comparison needs real days, and the first real day will use a 70/30 split of that day (the dashboard says so).

## Rules vs Markov: the owner's data
Not run by this chat (the owner's browsing data lives in their daily profile). Dashboard → Prediction and replay → "Evaluate on my data" computes and stores it in `models/eval`; paste the table here before using it in the post.

## Replay cost (spike N2)
84 synthetic days (≈ 15,000 events each) replayed, scored and evaluated in 3.8 s (about 45 ms per day).
