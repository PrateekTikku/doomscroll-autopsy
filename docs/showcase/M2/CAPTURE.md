# M2: what to capture (owner, ~5 min)

1. **Popup while the model downloads** (first run after `npm run live` and reload): the "Model: downloading, N%" line.
2. **Popup when ready**: "Model: ready, NN ms per item" and "Embedded today: X of Y items" after a few minutes of browsing.
3. **Dashboard → Developer**: with dev mode on, the sample count rising; optional: DevTools console of the offscreen document (chrome://extensions → Doomscroll Autopsy → "offscreen.html") showing nothing but model logs.
4. **Activity Monitor**: Chrome's total memory with the model loaded (the budget is < 1.5 GB for the extension); note it for the post.
5. Optional GIF: scroll Shorts for 30 s with the popup pinned open; the embedded count follows the items count.
