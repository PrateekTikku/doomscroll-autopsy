import { describe, expect, it } from 'vitest';
import { drainShare, type RulesInput } from './rules';

const base: RulesInput = {
  features: { items_per_min: 6, scroll_px_s_mean: 120, video_skip_rate: 0.3 },
  feed: true,
  minutesInCurrent: 3,
  leftDeepRecently: false,
};

describe('rules mode', () => {
  it('is high on a feed and low off it', () => {
    expect(drainShare(base)).toBeGreaterThan(0.8);
    expect(drainShare({ ...base, feed: false })).toBeLessThan(0.3);
  });
  it('rises with velocity', () => {
    const slow = drainShare({ ...base, features: { items_per_min: 0.5, scroll_px_s_mean: 5, video_skip_rate: 0 } });
    const fast = drainShare({ ...base, features: { items_per_min: 12, scroll_px_s_mean: 300, video_skip_rate: 0.6 } });
    expect(fast).toBeGreaterThan(slow);
  });
  it('a busy chat without the feed prior stays under 0.2', () => {
    expect(drainShare({ ...base, feed: false, features: { items_per_min: 5, scroll_px_s_mean: 60, video_skip_rate: 0.2 } })).toBeLessThan(0.2);
  });
  it('leaving Deep nudges the estimate up', () => {
    const f = { ...base, feed: false };
    expect(drainShare({ ...f, leftDeepRecently: true })).toBeGreaterThan(drainShare(f));
  });
  it('stays in (0, 1) at extremes', () => {
    const hi = drainShare({ ...base, features: { items_per_min: 1e6, scroll_px_s_mean: 1e6, video_skip_rate: 5 }, minutesInCurrent: 1e6 });
    expect(hi).toBeLessThan(1);
    expect(hi).toBeGreaterThan(0.9);
  });
});
