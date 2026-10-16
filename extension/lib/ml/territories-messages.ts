import type { ReclusterReport, SyncReport } from './territories';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Dashboard → background. `force` lowers the minimum to 60 embedded items. */
    'territories-recluster': { request: { force?: boolean } | void; response: ReclusterReport };
    /** Dashboard → background: assign recent samples and bins now. */
    'territories-sync': { request: void; response: SyncReport };
  }
}

export {};
