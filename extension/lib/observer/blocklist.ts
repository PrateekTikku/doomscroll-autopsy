import defaults from '@/assets/blocklist.json';
import type { Settings } from '@/lib/settings';

/**
 * Privacy blocklist (PDD 11.2). The rules are in the `description` of assets/blocklist.json:
 * a hostname is blocked if it equals or is a subdomain of a `domains` entry, ends with a
 * `suffixes` entry, or contains a `keywords` entry. User edits live in settings (D-52).
 */
export interface Blocklist {
  domains: string[];
  suffixes: string[];
  keywords: string[];
}

const clean = (s: string) => s.trim().toLowerCase().replace(/^\*?\.?/, '').replace(/\.$/, '');

/** Defaults plus the user's additions, minus the default domains they removed. */
export function effectiveBlocklist(edits: Settings['blocklist']): Blocklist {
  const removed = new Set(edits.removedDomains.map(clean));
  const domains = new Set([...defaults.domains, ...edits.addedDomains.map(clean)].filter((d) => d && !removed.has(d)));
  const keywords = new Set([...defaults.keywords, ...edits.addedKeywords.map((k) => k.trim().toLowerCase())].filter(Boolean));
  return { domains: [...domains].sort(), suffixes: [...defaults.suffixes], keywords: [...keywords].sort() };
}

export function isBlockedHost(hostname: string, list: Blocklist): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (list.domains.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  if (list.suffixes.some((s) => host.endsWith(s))) return true;
  return list.keywords.some((k) => host.includes(k));
}

/**
 * Chrome match patterns for `excludeMatches` (defence in depth: Chrome never injects the observer
 * there). `*.` in a host pattern matches the domain itself and its subdomains. Keywords can't be
 * expressed as match patterns; the content script's first-action check covers them.
 */
export function excludeMatchesFor(list: Blocklist, opts: { suffixes?: boolean } = {}): string[] {
  const hosts = [...list.domains, ...(opts.suffixes === false ? [] : list.suffixes.map((s) => s.slice(1)))];
  return hosts.map((h) => `*://*.${h}/*`);
}
