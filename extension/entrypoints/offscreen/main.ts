import { createRouter } from '@/lib/messaging';

// Offscreen document: the model host (PDD 6.1). Models arrive in M2; treat all state here as
// recoverable, since the document can be closed and re-created.
const router = createRouter('offscreen');
router.register('ping', () => ({ ok: true, from: 'offscreen' }));
router.listen();
