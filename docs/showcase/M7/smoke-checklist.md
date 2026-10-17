# M7 fresh-profile smoke test (release 0.2.0; re-run on 0.3.0 after M8, all checks passed, see m7-probe.json)

Run: `cd extension && npm run zip && npm run eval:m5 && npm run probe:m7` (headless Chrome, throwaway profile, the **unzipped release**, not the dev build). Raw results: `m7-probe.json`; screenshots `onboarding*.png`, `probe-m5/`, `probe-m4/`.

| # | Step | Result | Where |
|---|---|---|---|
| 1 | Zip unzips, loads, manifest version matches, carries the 270M and the ORT runtime | PASS | m7-probe |
| 2 | Onboarding opens by itself on install | PASS | m7-probe |
| 3 | Onboarding: observed / stored / honest privacy wording ("never leaves your device", "not anonymous") | PASS | m7-probe |
| 4 | Install warning explained; limits (WebGPU, size, browser only) | PASS | m7-probe |
| 5 | No wording about time outside the browser | PASS | m7-probe + `tests/browser-only.test.ts` |
| 6 | Blocklist shown (109 entries), add site + keyword, sensitivity saved | PASS | m7-probe |
| 7 | Model download from onboarding: progress shown, reached "Ready" in ~50 s on this connection | PASS | m7-probe (`download` in the json) |
| 8 | "I've read this" → dashboard, `onboardedAt` stored; popup links back to the welcome page | PASS | m7-probe |
| 9 | Seeded replay: metrics tiles, timeline, autopsy, popup metrics | PASS | `probe:m5` on the release |
| 10 | Forget (last hour, a day with its report, a site + always skip), blocklist editor, retention, wipe empties DB + cache + settings | PASS | `probe:m5` on the release |
| 11 | Nudge fires (banner, blur, demo mode) on strict-CSP and plain pages; refused when paused or blocklisted | PASS | `probe:m4` on the release |
| 12 | No exceptions in extension pages | PASS | all three |

Not covered (owner / the friend, on a real Mac): real browsing producing territories after ~2 h (K-15, K-20), a real nudge in a daily profile (K-19), WebGPU on the friend's machine (K-11), memory with both models resident (K-09, K-13).
