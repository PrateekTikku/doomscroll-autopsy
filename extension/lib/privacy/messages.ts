import type { ForgetReport } from './forget';
import type { RetentionReport } from './retention';
import type { WipeReport } from './wipe';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Dashboard → background: forget [from, to] (epoch ms). */
    'privacy-forget-range': { request: { from: number; to: number }; response: ForgetReport };
    /** `alwaysSkip` also adds the site to the blocklist. */
    'privacy-forget-site': { request: { site: string; alwaysSkip: boolean }; response: ForgetReport };
    'privacy-wipe': { request: void; response: WipeReport };
    /** Applies the configured retention now. */
    'privacy-retention': { request: void; response: RetentionReport };
    /** Removes stored titles from every sample. */
    'privacy-strip-titles': { request: void; response: { cleared: number } };
  }
}

export {};
