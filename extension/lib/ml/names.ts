import feedOrigins from '@/assets/feed-origins.json';
import shallowOrigins from '@/assets/shallow-origins.json';
import type { Label } from '@/lib/db';

/** The parts of a sample that naming and label suggestions look at. */
export interface SampleLike {
  origin: string;
  path: string;
}

export interface Feed {
  origin: string;
  pathPatterns: string[];
}

const ID_LIKE = /^(\d+|[0-9a-f]{8,}|[A-Za-z0-9_-]{16,})$/i;

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, '');
  } catch {
    return origin.replace(/^https?:\/\//, '').replace(/^www\./, '');
  }
}

/** First path segment, or null for IDs (digits, hashes, long tokens) and the root. */
export function pathSegment(path: string): string | null {
  const seg = path.split('/').filter(Boolean)[0];
  if (!seg || ID_LIKE.test(seg)) return null;
  return seg.toLowerCase().slice(0, 24);
}

function topBy<T>(items: T[], key: (t: T) => string | null, n: number): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k != null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

export function topOrigins(samples: SampleLike[], n = 3): Array<{ origin: string; count: number }> {
  return topBy(samples, (s) => s.origin, n).map((t) => ({ origin: t.key, count: t.count }));
}

/** Baseline territory name (PDD 9.10): "<top origin> · <top path segment>"; "home" for root-only paths. */
export function baselineName(samples: SampleLike[]): string {
  const top = topOrigins(samples, 1)[0];
  if (!top) return 'Unnamed';
  const inOrigin = samples.filter((s) => s.origin === top.origin);
  const seg = topBy(inOrigin, (s) => pathSegment(s.path), 1)[0];
  const home = inOrigin.filter((s) => s.path === '/' || s.path === '').length > inOrigin.length / 2;
  return `${hostOf(top.origin)} · ${seg?.key ?? (home ? 'home' : 'pages')}`;
}

export function isFeedSample(s: SampleLike, feeds: Feed[] = feedOrigins.feeds): boolean {
  return feeds.some((f) => f.origin === s.origin && f.pathPatterns.some((p) => new RegExp(p).test(s.path)));
}

export function isShallowHost(origin: string, hosts: string[] = shallowOrigins.hosts): boolean {
  const host = hostOf(origin);
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Rule-based suggested label (milestone task 5): mostly known feed pages → drain; mostly
 * chat/mail/calendar hosts → shallow; otherwise none. Always a suggestion, never a label.
 */
export function suggestLabel(samples: SampleLike[], feeds?: Feed[], hosts?: string[]): Label | null {
  if (samples.length === 0) return null;
  const feed = samples.filter((s) => isFeedSample(s, feeds)).length;
  if (feed / samples.length >= 0.5) return 'drain';
  const shallow = samples.filter((s) => isShallowHost(s.origin, hosts)).length;
  if (shallow / samples.length >= 0.5) return 'shallow';
  return null;
}
