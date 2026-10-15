import { describe, expect, it } from 'vitest';
import { MODULE } from './index';

describe('lib/observer', () => {
  it('is wired into the build and test setup', () => {
    expect(MODULE).toBe('observer');
  });
});
