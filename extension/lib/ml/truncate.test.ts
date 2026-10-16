import { describe, expect, it } from 'vitest';
import { truncateAndNormalize } from './truncate';

describe('truncateAndNormalize', () => {
  it('keeps the prefix and re-normalises to unit length', () => {
    const v = Array.from({ length: 768 }, (_, i) => (i % 7) + 1);
    const t = truncateAndNormalize(v, 256)!;
    expect(t).toHaveLength(256);
    expect(Math.hypot(...t)).toBeCloseTo(1, 5);
    // direction preserved: ratios of the kept values are unchanged
    expect(t[1]! / t[0]!).toBeCloseTo(v[1]! / v[0]!, 5);
  });

  it('rejects NaN, Infinity, zero vectors and too-short input', () => {
    expect(truncateAndNormalize([1, NaN, 3], 3)).toBeNull();
    expect(truncateAndNormalize([1, Infinity, 3], 3)).toBeNull();
    expect(truncateAndNormalize([0, 0, 0], 3)).toBeNull();
    expect(truncateAndNormalize([1, 2], 3)).toBeNull();
  });
});
