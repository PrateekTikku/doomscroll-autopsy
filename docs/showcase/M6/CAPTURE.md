# M6 capture list (owner)

Run `npm run live` in `extension/` (it now copies the 324 MB model into the build), reload the extension, then:

1. **Territories**: Dashboard → Territories → "Name territories with Gemma". Capture the list before (baseline names like `github.com · pulls`) and after (names like "GitHub code review and issue tracking"), with the small "named by Gemma 3 270M (fine-tuned)" tags. Headless reference: `dashboard-territories-model.png`.
2. **Autopsy**: Dashboard → Autopsy → "Write today's autopsy now". Capture the paragraph and the pill ("Written by Gemma 3 270M (fine-tuned)" or "Written from a template (...)"). Reference: `dashboard-autopsy-model.png`.
3. **Side by side** for the post: `autopsy-vs-template.md` (model text next to the template for the same facts).
4. **Popup**: the "Writer model: ..." line while it works and after it sleeps. Reference: `popup-writer.png`.
5. **Real data**: after a day of browsing, note how many names/autopsies came from the model (Dashboard → Autopsy footer: "Autopsies: x of y from the model") for the post.

Numbers: `fallback-rate.json`, `naming-examples.md`, `g1-spike.json`.
