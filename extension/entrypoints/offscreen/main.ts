import { createGenHost } from '@/lib/gen/host';
import '@/lib/gen/messages';
import { createRouter } from '@/lib/messaging';
import { trainAndEvaluateStored } from '@/lib/ml/gru-service';
import '@/lib/ml/gru-messages';
import { createModelHost } from '@/lib/ml/host';
import '@/lib/ml/messages';

// Offscreen document: the model host (PDD 6.1). Treat all state here as recoverable, since the
// document can be closed and re-created; the model reloads on the next embed.
const router = createRouter('offscreen');
const host = createModelHost();
const gen = createGenHost();
router.register('ping', () => ({ ok: true, from: 'offscreen' }));
router.register('embed', (input) => host.embed(input));
router.register('embedder-status', () => host.status());
router.register('embedder-warm', () => host.warm());
router.register('embedder-unload', () => host.unload());
router.register('generate', (req) => gen.generate(req));
router.register('gru-train', async (opts) => (await trainAndEvaluateStored(opts ?? {})).record);
router.register('gen-status', () => gen.status());
router.register('gen-unload', () => gen.unload());
router.listen();
