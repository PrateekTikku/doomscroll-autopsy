import type { createRouter } from '@/lib/messaging';
import { onReclustered } from '@/lib/ml/territories';
import { setAutopsyWriter, type AutopsyWriter } from '@/lib/metrics/service';
import { exclusive } from '@/lib/privacy/background';
import { writeAutopsy } from './autopsy';
import { generateViaOffscreen, unloadWriter, writerStatus } from './client';
import { GEN_MODEL_NAME, GEN_MODEL_VERSION } from './config';
import './messages';
import { nameTerritories } from './naming-service';
import { getGenStats, recordGen } from './stats';

/**
 * Service-worker wiring of the writer model (M6): the model-first autopsy writer for reports, naming
 * after every re-cluster and on demand, and the status the popup and dashboard show. Generation
 * itself runs in the offscreen document (`lib/gen/host.ts`).
 */
type Router = ReturnType<typeof createRouter>;

/** Model first, validated, then the template (PDD 9.8); counts every outcome. */
export const modelAutopsyWriter: AutopsyWriter = async (facts) => {
  const r = await writeAutopsy(facts, generateViaOffscreen);
  if (r.source.errors[0] !== 'empty_day') {
    await recordGen('autopsy', { model: r.source.kind === 'model', unavailable: r.unavailable, generations: r.source.attempts, errors: r.source.errors });
  }
  return { text: r.text, version: r.version, source: r.source };
};

export function registerGen(router: Router): void {
  setAutopsyWriter(modelAutopsyWriter);
  const run = (force = false) =>
    exclusive(async () => {
      try {
        return await nameTerritories(generateViaOffscreen, { force });
      } finally {
        await unloadWriter();
      }
    });
  onReclustered(() => run());
  router.register('gen-name-territories', (req) => run(req?.force ?? false));
  router.register('gen-overview', async () => ({ modelName: GEN_MODEL_NAME, modelVersion: GEN_MODEL_VERSION, status: await writerStatus(), stats: await getGenStats() }));
}
