import { defineBackground } from '#imports';
import { createRouter, send } from '@/lib/messaging';
import { ensureOffscreenDocument } from '@/lib/offscreen';

// Service worker (PDD 6.1). Keep this file thin: features register their handlers here from
// their own modules, e.g. `registerNudgeHandlers(router)`, so parallel milestones don't collide.
export default defineBackground(() => {
  const router = createRouter('background');

  router.register('ping', () => ({ ok: true, from: 'background' }));

  router.register('ping-offscreen', async () => {
    try {
      await ensureOffscreenDocument();
      const reply = await send('offscreen', 'ping');
      return { ok: true, offscreen: reply.from === 'offscreen' };
    } catch (err) {
      return { ok: false, offscreen: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  router.listen();
});
