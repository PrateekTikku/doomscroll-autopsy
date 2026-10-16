# M4: what to capture (owner, ~10 min)

After `npm run live` and a reload of the extension:

1. **Demo mode, banner**: open any ordinary page (a news article, YouTube Shorts), then in another tab Dashboard → Prediction and replay → set 60× → **Start demo** → switch to the page. At about 57 s of replay time (≈ 57 s at 60×): the banner appears with an orange **Replay** pill. Capture it. (Screenshots from the headless probe are in this folder as a fallback: `demo-banner.png`.)
2. **Demo mode, blur**: about 15 replay-minutes later (≈ 15 s at 60×) the page blurs with the card (**Back to it** / **Keep going**, orange **Replay** pill). Capture it.
3. **GIF (best asset)**: the whole demo at 120×, screen recording of the page: calm → banner → blur (≈ 40 s). Label it as a replay in the post.
4. **Popup**: while the demo runs, open the popup: "Replay running", and the line "Mode: rules · spiral score 0.xx (nudges at 0.60)".
5. **Dashboard → Prediction and replay**: the mode line, and the rules vs Markov table after "Evaluate on my data" and "Synthetic evaluation" (the table is the showcase's baseline comparison).
6. A real nudge, if one fires in normal browsing (check Dashboard → Developer counts, or the popup's score near the threshold). Not required.
