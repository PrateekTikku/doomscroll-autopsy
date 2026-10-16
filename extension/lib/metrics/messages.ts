import type { ReportRecord } from '@/lib/db';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Dashboard → background: (re)compute facts and the template autopsy for a local date and store them. */
    'report-generate': { request: { date: string }; response: ReportRecord };
  }
}

export {};
