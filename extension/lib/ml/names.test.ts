import { describe, expect, it } from 'vitest';
import { baselineName, isFeedSample, isShallowHost, pathSegment, suggestLabel, topOrigins } from './names';

const s = (origin: string, path: string) => ({ origin, path });

describe('baselineName', () => {
  it('uses the top origin and top path segment', () => {
    const items = [s('https://www.youtube.com', '/shorts/abc'), s('https://www.youtube.com', '/shorts/def'), s('https://www.youtube.com', '/watch'), s('https://x.com', '/home')];
    expect(baselineName(items)).toBe('youtube.com · shorts');
  });
  it('skips ID-like segments and names root-only territories "home"', () => {
    expect(pathSegment('/123456')).toBeNull();
    expect(pathSegment('/a1b2c3d4e5f6a7b8')).toBeNull();
    expect(pathSegment('/Docs/x')).toBe('docs');
    expect(baselineName([s('https://www.reddit.com', '/'), s('https://www.reddit.com', '/')])).toBe('reddit.com · home');
  });
  it('handles empty input', () => expect(baselineName([])).toBe('Unnamed'));
});

describe('topOrigins', () => {
  it('orders by count', () => {
    const items = [s('https://a.com', '/'), s('https://b.com', '/'), s('https://b.com', '/')];
    expect(topOrigins(items, 2)).toEqual([{ origin: 'https://b.com', count: 2 }, { origin: 'https://a.com', count: 1 }]);
  });
});

describe('suggestLabel', () => {
  it('suggests drain for feed pages only when they are the majority', () => {
    expect(isFeedSample(s('https://www.youtube.com', '/shorts/x'))).toBe(true);
    expect(isFeedSample(s('https://www.youtube.com', '/watch'))).toBe(false);
    const shorts = Array.from({ length: 6 }, () => s('https://www.youtube.com', '/shorts/x'));
    const watch = Array.from({ length: 4 }, () => s('https://www.youtube.com', '/watch'));
    expect(suggestLabel([...shorts, ...watch])).toBe('drain');
    expect(suggestLabel([...watch, ...watch, ...shorts.slice(0, 2)])).toBeNull();
  });
  it('suggests shallow for chat, mail and calendar hosts, including subdomains', () => {
    expect(isShallowHost('https://app.slack.com')).toBe(true);
    expect(isShallowHost('https://acme.slack.com')).toBe(true);
    expect(isShallowHost('https://notslack.com')).toBe(false);
    expect(suggestLabel([s('https://calendar.google.com', '/'), s('https://app.slack.com', '/x')])).toBe('shallow');
  });
  it('is null for ordinary pages and empty input', () => {
    expect(suggestLabel([s('https://developer.mozilla.org', '/en-US/docs')])).toBeNull();
    expect(suggestLabel([])).toBeNull();
  });
});
