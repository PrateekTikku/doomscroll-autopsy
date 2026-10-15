import { describe, expect, it } from 'vitest';
import blocklist from '@/assets/blocklist.json';
import feedOrigins from '@/assets/feed-origins.json';
import topics from '@/assets/topics.json';

describe('assets/blocklist.json', () => {
  it('has lowercase bare domains, dotted suffixes and keywords', () => {
    expect(blocklist.domains.length).toBeGreaterThan(50);
    for (const d of blocklist.domains) expect(d).toMatch(/^[a-z0-9.-]+\.[a-z0-9]+$/);
    for (const s of blocklist.suffixes) expect(s).toMatch(/^\.[a-z.]+$/);
    for (const k of blocklist.keywords) expect(k).toMatch(/^[a-z0-9]+$/);
    expect(new Set(blocklist.domains).size).toBe(blocklist.domains.length);
  });

  it('covers each PDD 11.2 category', () => {
    for (const d of ['chase.com', 'hdfcbank.com', 'paypal.com', 'mychart.com', '1password.com', 'mail.google.com']) {
      expect(blocklist.domains).toContain(d);
    }
    expect(blocklist.suffixes).toContain('.gov');
  });
});

describe('assets/feed-origins.json', () => {
  it('has valid origins, compilable path patterns and known kinds', () => {
    const kinds = new Set(['short-video', 'feed', 'forum', 'news', 'video']);
    for (const f of feedOrigins.feeds) {
      expect(f.origin).toMatch(/^https:\/\/[^/]+$/);
      expect(kinds.has(f.kind)).toBe(true);
      for (const p of f.pathPatterns) expect(() => new RegExp(p)).not.toThrow();
    }
  });

  it('includes the feed sites named in M0', () => {
    const origins = feedOrigins.feeds.map((f) => f.origin);
    for (const o of ['https://www.youtube.com', 'https://www.instagram.com', 'https://x.com', 'https://www.reddit.com', 'https://www.tiktok.com', 'https://www.facebook.com', 'https://www.linkedin.com']) {
      expect(origins).toContain(o);
    }
    const yt = feedOrigins.feeds.find((f) => f.origin === 'https://www.youtube.com')!;
    expect(yt.pathPatterns.some((p) => new RegExp(p).test('/shorts/abc123'))).toBe(true);
    expect(yt.pathPatterns.some((p) => new RegExp(p).test('/watch'))).toBe(false);
  });
});

describe('assets/topics.json', () => {
  it('has about 300 unique, short phrases', () => {
    expect(topics.topics.length).toBeGreaterThanOrEqual(280);
    expect(new Set(topics.topics.map((t) => t.toLowerCase())).size).toBe(topics.topics.length);
    for (const t of topics.topics) expect(t.length).toBeLessThanOrEqual(60);
  });
});
