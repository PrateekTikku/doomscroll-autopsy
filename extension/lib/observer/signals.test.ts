import { describe, expect, it } from 'vitest';
import { nextResumeTime, pauseUntil } from './pause';
import { changedFraction, findItemIndex, isSkip, isVisualMedia, VelocitySmoother, WatchTimer, type ElementLike } from './signals';

const el = (height: number, textLength = 0, hasMedia = false): ElementLike => ({ height, textLength, hasMedia });

describe('item detection walk (PDD 7.3)', () => {
  const vh = 800;
  it('returns the first ancestor 30–100% of the viewport high with text or media', () => {
    expect(findItemIndex([el(20, 10), el(100, 80), el(400, 300), el(2000, 9000)], vh)).toBe(2);
    expect(findItemIndex([el(700, 0, true), el(720, 5)], vh)).toBe(0);
  });
  it('skips elements that are too small, too tall or empty', () => {
    expect(findItemIndex([el(200, 500), el(500, 10), el(900, 5000)], vh)).toBe(-1);
  });
  it('returns -1 (viewport fallback) when there is no card structure', () => {
    expect(findItemIndex([el(30, 50), el(5000, 20000), el(5200, 21000)], vh)).toBe(-1);
  });
  it('does not measure text when the height already rules an element out', () => {
    let reads = 0;
    const lazy: ElementLike = { height: 5000, get textLength() { reads++; return 100; }, hasMedia: false };
    findItemIndex([lazy], vh);
    expect(reads).toBe(0);
  });
});

describe('isVisualMedia', () => {
  it('counts media covering half the viewport', () => {
    expect(isVisualMedia(1000, 600, 1440, 800)).toBe(true);
    expect(isVisualMedia(300, 200, 1440, 800)).toBe(false);
  });
  it('counts a tall portrait video (Shorts on desktop)', () => {
    expect(isVisualMedia(405, 720, 1440, 813)).toBe(true);
  });
});

describe('viewport fallback', () => {
  it('measures the share of new visible text blocks', () => {
    expect(changedFraction(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(changedFraction(['a', 'b', 'c'], ['c', 'd', 'e'])).toBeCloseTo(2 / 3);
    expect(changedFraction([], [])).toBe(0);
  });
});

describe('VelocitySmoother', () => {
  it('converges to a steady scroll speed and resets to 0', () => {
    const s = new VelocitySmoother(1000);
    let v = 0;
    for (let t = 0; t <= 5000; t += 50) v = s.update(t, 50); // 50 px every 50 ms = 1000 px/s
    expect(v).toBeGreaterThan(950);
    expect(v).toBeLessThanOrEqual(1000.0001);
    s.reset();
    expect(s.pxPerS).toBe(0);
  });
  it('smooths a single spike', () => {
    const s = new VelocitySmoother(1000);
    s.update(0, 0);
    expect(s.update(100, 2000)).toBeLessThan(20_000 * 0.2);
  });
});

describe('video skip rule (PDD 7.2)', () => {
  it('flags leaving before 2 s or before 25% watched', () => {
    expect(isSkip(1.5, 60)).toBe(true);
    expect(isSkip(10, 60)).toBe(true);
    expect(isSkip(20, 60)).toBe(false);
    expect(isSkip(30, null)).toBe(false);
    expect(isSkip(3, 10)).toBe(false);
  });
  it('accumulates watched time across loops and ignores seeks', () => {
    const w = new WatchTimer();
    for (const t of [0, 0.25, 0.5, 0.75, 1.0, 0.1, 0.35, 30, 30.25]) w.update(t);
    expect(w.watchedS).toBeCloseTo(1.0 + 0.25 + 0.25, 5);
  });
});

describe('pause (PDD 11.3)', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m).getTime();
  it('"until tomorrow" resumes at the next 04:00 local', () => {
    expect(nextResumeTime(at(9))).toBe(new Date(2026, 9, 16, 4).getTime());
    expect(nextResumeTime(at(23, 30))).toBe(new Date(2026, 9, 16, 4).getTime());
    expect(nextResumeTime(at(2))).toBe(new Date(2026, 9, 15, 4).getTime());
    expect(nextResumeTime(at(4))).toBe(new Date(2026, 9, 16, 4).getTime());
  });
  it('computes the other options', () => {
    expect(pauseUntil('15m', 1000)).toBe(1000 + 15 * 60_000);
    expect(pauseUntil('1h', 1000)).toBe(1000 + 3_600_000);
    expect(pauseUntil('forever', 1000)).toBe('forever');
  });
});
