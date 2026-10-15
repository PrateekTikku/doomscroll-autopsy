import { describe, expect, it } from 'vitest';
import { MODULE } from './index';

describe('lib/nudge', () => {
  it('is wired into the build and test setup', () => {
    expect(MODULE).toBe('nudge');
  });
});
