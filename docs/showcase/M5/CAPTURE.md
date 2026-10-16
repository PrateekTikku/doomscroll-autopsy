# M5 capture list (owner, ~10 minutes)

Run `npm run live` in `extension/`, reload the extension in your daily profile, browse a while, then:

1. **Dashboard → Today** (screenshot, full width): the four tiles, the "Browser time" line and the timeline with deep blocks outlined. Headless reference: `dashboard-today.png`.
2. **Timeline close-up** (GIF, 10 s): hover a deep-block outline, a lane segment and a nudge marker to show the tooltips.
3. **Autopsy**: click "Write today's autopsy now" and capture the paragraph plus the "Written from a template" pill. (M6 turns this into "Written by the fine-tuned 270M".)
4. **History picker**: choose an earlier day; capture the tiles and its autopsy.
5. **Popup** (screenshot): deep blocks, attention residue, drain past allowance, nudges that worked. Reference: `popup.png`.
6. **Privacy flow** (GIF, 20 s): Forget → "Last hour" → the message "Forgot N items…" → the timeline loses that hour; then add a site to the blocklist.
7. **Wipe** (optional, destroys your data): type WIPE, watch the dashboard reload empty. Reference: `dashboard-after-wipe.png`.

Numbers for the post: `persona-days.md` (six personas' replayed days) and `facts-*.json` + `autopsy-*.md` (the same day as facts and as a template autopsy).
