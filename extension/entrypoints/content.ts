import { defineContentScript } from '#imports';

// Observer + in-page nudges (PDD 6.1, 7). Stub until M1.
// M1: the blocklist and pause check (chrome.storage.local, D-52) must be the very first action;
// on a match, attach no listeners, read nothing, and return (PDD 11.2).
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {},
});
