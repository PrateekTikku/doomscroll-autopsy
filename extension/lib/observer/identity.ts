/**
 * Item identity (PDD 7.3, D-47), in priority order:
 *   1. a per-item URL path (`/shorts/<id>`, `/reel/<id>`, `/status/<id>`, `/comments/<id>`, …) → `u:<path>`
 *   2. dominant media `currentSrc` + `duration` + `poster` → `m:<hash>` (players reuse elements and use blob: sources)
 *   3. the first 200 characters of normalised text → `t:<hash>`
 * Media and text keys are hashed, so no text (or media URL) ever appears in a key.
 */

/** cyrb53: a fast, synchronous 53-bit string hash. Not cryptographic; used for identity only. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const PER_ITEM_PATH = /^(.*?\/(?:shorts|reels?|status|comments|video|p)\/[A-Za-z0-9_-]{4,})(?:\/|$)/;

/** The per-item prefix of a path, e.g. "/r/rust/comments/abc123" for a Reddit thread; null if none. */
export function perItemPath(path: string): string | null {
  const m = PER_ITEM_PATH.exec(path);
  return m?.[1] ?? null;
}

export interface MediaIdentity {
  currentSrc: string;
  duration: number | null;
  poster: string;
}

export const KEY_MAX = 200;

export function itemKey(input: { path: string; media?: MediaIdentity | null; text?: string }): string | null {
  const urlPath = perItemPath(input.path);
  if (urlPath) {
    const key = `u:${urlPath}`;
    return key.length <= KEY_MAX ? key : `u#${hash53(urlPath)}`;
  }
  const m = input.media;
  if (m && (m.currentSrc || m.poster)) {
    const duration = m.duration != null && Number.isFinite(m.duration) ? Math.round(m.duration * 10) / 10 : '';
    return `m:${hash53(`${m.currentSrc}|${duration}|${m.poster}`)}`;
  }
  const text = normalizeText(input.text ?? '').slice(0, 200);
  return text ? `t:${hash53(text)}` : null;
}
