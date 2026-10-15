import { describe, expect, it } from 'vitest';
import { hash53, itemKey, perItemPath } from './identity';
import { pageLocation, sanitizePath } from './url';

describe('item identity (D-47)', () => {
  it('recognises per-item URL paths', () => {
    expect(perItemPath('/shorts/aufYc8uiqco')).toBe('/shorts/aufYc8uiqco');
    expect(perItemPath('/reel/C9xYz12AbC/')).toBe('/reel/C9xYz12AbC');
    expect(perItemPath('/reels/C9xYz12AbC')).toBe('/reels/C9xYz12AbC');
    expect(perItemPath('/p/C9xYz12AbC/')).toBe('/p/C9xYz12AbC');
    expect(perItemPath('/jack/status/1234567890')).toBe('/jack/status/1234567890');
    expect(perItemPath('/r/rust/comments/1abcde/some_title/')).toBe('/r/rust/comments/1abcde');
    expect(perItemPath('/@someone/video/7312345678901')).toBe('/@someone/video/7312345678901');
    expect(perItemPath('/watch')).toBeNull();
    expect(perItemPath('/r/rust/')).toBeNull();
    expect(perItemPath('/')).toBeNull();
  });

  it('prefers the URL, then media, then text', () => {
    const media = { currentSrc: 'blob:https://www.youtube.com/4f1c', duration: 31.2, poster: '' };
    expect(itemKey({ path: '/shorts/abcdef', media, text: 'hello world' })).toBe('u:/shorts/abcdef');
    expect(itemKey({ path: '/', media, text: 'hello world' })).toMatch(/^m:[0-9a-z]+$/);
    expect(itemKey({ path: '/', text: 'hello world' })).toMatch(/^t:[0-9a-z]+$/);
    expect(itemKey({ path: '/', text: '   ' })).toBeNull();
  });

  it('distinguishes reused players by currentSrc + duration', () => {
    const a = itemKey({ path: '/', media: { currentSrc: 'blob:x/1', duration: 30, poster: '' } });
    const b = itemKey({ path: '/', media: { currentSrc: 'blob:x/1', duration: 45, poster: '' } });
    const c = itemKey({ path: '/', media: { currentSrc: 'blob:x/2', duration: 30, poster: '' } });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('never puts text in a key, and only uses the first 200 normalised characters', () => {
    const text = 'Secret post text that must not leak '.repeat(10);
    const key = itemKey({ path: '/', text })!;
    expect(key).not.toContain('Secret');
    expect(itemKey({ path: '/', text: `  ${text.slice(0, 200)}  tail differs` })).toBe(itemKey({ path: '/', text: text.slice(0, 200) + 'other' }));
    expect(key.length).toBeLessThanOrEqual(200);
  });

  it('hash53 is deterministic and spreads', () => {
    expect(hash53('abc')).toBe(hash53('abc'));
    expect(hash53('abc')).not.toBe(hash53('abd'));
  });
});

describe('url', () => {
  it('strips query strings and fragments', () => {
    expect(sanitizePath('/watch?v=abc#t=10')).toBe('/watch');
    expect(sanitizePath('/a/b#frag')).toBe('/a/b');
    expect(sanitizePath('x')).toBe('/x');
  });

  it('only accepts http(s) pages', () => {
    expect(pageLocation('https://www.youtube.com/watch?v=abc#x')).toEqual({ origin: 'https://www.youtube.com', path: '/watch', hostname: 'www.youtube.com' });
    expect(pageLocation('chrome://newtab/')).toBeNull();
    expect(pageLocation('file:///Users/me/a.html')).toBeNull();
    expect(pageLocation('not a url')).toBeNull();
  });
});
