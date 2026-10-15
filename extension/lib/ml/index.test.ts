import { describe, expect, it } from 'vitest';
import { MODULE } from './index';

describe('lib/ml', () => {
  it('is wired into the build and test setup', () => {
    expect(MODULE).toBe('ml');
  });
});
