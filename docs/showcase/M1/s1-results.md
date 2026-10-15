# M1 — spike S1 and observer numbers

Generic item detection (PDD 7.3) has no site-specific selectors. It was measured with `npm run probe:s1`: headless Chrome, 20 scrolls per site, 2.5 s apart.

| Site | Items detected per scroll | Scroll handler p95 |
|---|---|---|
| YouTube Shorts | 1.10 (one per short, identity from `/shorts/<id>`) | 0.5 ms |
| Mastodon public feed | 1.00 | 0.3 ms |
| Bluesky feed | 1.10 | 0.2 ms |
| MDN docs (viewport fallback) | 0.95 | 0.2 ms |
| Wikipedia article | 0.85 (tall sections stay in view) | 0.2 ms |

- **Observer cost per scroll event:** at most 0.5 ms p95, against a PDD budget of 2 ms. Item detection runs at most every 250 ms, off the scroll handler.
- **Privacy, checked on everything stored after the run** (553 records):
  - 0 URLs with a query string or fragment
  - 0 records with item text
  - 0 events from a blocklisted site
  - 0 events while paused
- **Post line:** "the same 12 kB observer works on Shorts, Mastodon, Bluesky and MDN without a single site-specific selector."
- **Still to add:** the owner's results from Instagram, X and Reddit (logged in).
