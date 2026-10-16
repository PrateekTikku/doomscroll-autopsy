import { createRouter } from '@/lib/messaging';
import { createModelHost } from '@/lib/ml/host';
import '@/lib/ml/messages';

// Offscreen document: the model host (PDD 6.1). Treat all state here as recoverable, since the
// document can be closed and re-created; the model reloads on the next embed.
const router = createRouter('offscreen');
const host = createModelHost();
router.register('ping', () => ({ ok: true, from: 'offscreen' }));
router.register('embed', (input) => host.embed(input));
router.register('embedder-status', () => host.status());
router.register('embedder-unload', () => host.unload());
router.listen();
