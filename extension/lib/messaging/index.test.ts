import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import { createRouter } from './index';

const sender = {} as Browser.runtime.MessageSender;

describe('lib/messaging', () => {
  it('answers messages addressed to its target', async () => {
    const router = createRouter('background');
    router.register('ping', () => ({ ok: true, from: 'background' }));
    await expect(router.dispatch({ target: 'background', type: 'ping' }, sender)).resolves.toEqual({
      ok: true,
      data: { ok: true, from: 'background' },
    });
  });

  it('ignores messages for other targets and non-envelopes', () => {
    const router = createRouter('background');
    router.register('ping', () => ({ ok: true, from: 'background' }));
    expect(router.dispatch({ target: 'offscreen', type: 'ping' }, sender)).toBeUndefined();
    expect(router.dispatch('hello', sender)).toBeUndefined();
    expect(router.dispatch(null, sender)).toBeUndefined();
  });

  it('reports unknown types and handler errors instead of throwing', async () => {
    const router = createRouter('offscreen');
    router.register('ping-offscreen', async () => {
      throw new Error('boom');
    });
    await expect(router.dispatch({ target: 'offscreen', type: 'ping' }, sender)).resolves.toMatchObject({ ok: false });
    await expect(router.dispatch({ target: 'offscreen', type: 'ping-offscreen' }, sender)).resolves.toEqual({
      ok: false,
      error: 'boom',
    });
  });

  it('refuses duplicate handlers', () => {
    const router = createRouter('background');
    router.register('ping', () => ({ ok: true, from: 'background' }));
    expect(() => router.register('ping', () => ({ ok: true, from: 'background' }))).toThrow(/already registered/);
  });
});
