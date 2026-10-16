import { describe, expect, it } from 'vitest';
import { createCaptureLimiter } from './capture';

describe('createCaptureLimiter', () => {
  it('allows one capture per interval', () => {
    const l = createCaptureLimiter(3000);
    expect(l.tryAcquire(1000)).toBe(true);
    expect(l.tryAcquire(2500)).toBe(false);
    expect(l.tryAcquire(4000)).toBe(true);
    expect(l.tryAcquire(6999)).toBe(false);
    expect(l.tryAcquire(7000)).toBe(true);
  });
});
