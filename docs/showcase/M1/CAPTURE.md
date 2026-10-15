# M1 — what to capture

Screenshots for the post. Take them from your daily profile (the `extension/.live/chrome-mv3` install) after some normal browsing. **Crop out tab titles or page content you don't want public.**

1. **Popup with live counts:** click the toolbar icon after ~30 minutes of browsing. It shows items seen, active minutes and items per minute.
2. **Items per minute on a feed vs a doc:** open the popup while flicking through YouTube Shorts (the number climbs, e.g. 20+), then again after a few minutes reading documentation (low single digits). Two crops side by side make the "content velocity" idea concrete.
3. **Pause:** popup → *Until tomorrow*. Capture the amber "Paused until …" line and the `II` badge on the toolbar icon.
4. **Dev-mode console (optional, for the "how it works" section):** with dev mode on (dashboard → Developer), open DevTools on a Shorts tab and capture a few `[doomscroll] item u: … visual` lines. They show items being detected with no site-specific code, and that only hashed keys are logged.
5. **Dashboard Developer section:** sample, bin and recorded-event counts, plus the JSONL download button.

Numbers for the post are in `s1-results.md` (probe table, per-scroll cost) and `s1-probe.json` (raw).
