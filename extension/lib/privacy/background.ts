import type { createRouter } from '@/lib/messaging';
import { isReclustering } from '@/lib/ml/territories';
import { getSettings, updateSettings } from '@/lib/settings';
import { addDomain } from './blocklist-edit';
import { forgetRange, forgetSite, siteKey } from './forget';
import './messages';
import { applyRetention, stripTitles } from './retention';
import { wipeEverything } from './wipe';

/**
 * Service-worker side of the privacy controls (PDD 11). They run here so they serialise with the
 * territory sweep and re-cluster, which write the same stores.
 */
type Router = ReturnType<typeof createRouter>;

let chain: Promise<unknown> = Promise.resolve();

/** Runs jobs one after another, and never during a re-cluster. */
export function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = async () => {
    for (let i = 0; i < 120 && isReclustering(); i++) await new Promise((r) => setTimeout(r, 500));
    return job();
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

export function registerPrivacy(router: Router): void {
  router.register('privacy-forget-range', (req) => exclusive(() => forgetRange(req.from, req.to)));
  router.register('privacy-forget-site', (req) =>
    exclusive(async () => {
      if (req.alwaysSkip) {
        const settings = await getSettings();
        const { edits, error } = addDomain(settings.blocklist, siteKey(req.site));
        if (error) throw new Error(error);
        await updateSettings({ blocklist: edits });
      }
      return forgetSite(req.site);
    }),
  );
  router.register('privacy-wipe', () => exclusive(() => wipeEverything()));
  router.register('privacy-retention', () => exclusive(async () => applyRetention((await getSettings()).retentionDays)));
  router.register('privacy-strip-titles', () => exclusive(async () => ({ cleared: await stripTitles() })));
}
