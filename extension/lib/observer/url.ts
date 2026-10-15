/**
 * URL handling (PDD 8.2): we only ever keep origin + path. Query strings and fragments are
 * stripped everywhere, and non-http(s) pages are never observed.
 */

/** Path with any query string or fragment removed; always starts with "/". */
export function sanitizePath(path: string): string {
  const cut = path.search(/[?#]/);
  const p = cut >= 0 ? path.slice(0, cut) : path;
  return p.startsWith('/') ? p : `/${p}`;
}

/** `{origin, path}` for an http(s) URL, or null for anything else (chrome://, file://, data:, …). */
export function pageLocation(href: string): { origin: string; path: string; hostname: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return { origin: url.origin, path: sanitizePath(url.pathname), hostname: url.hostname.toLowerCase() };
}
