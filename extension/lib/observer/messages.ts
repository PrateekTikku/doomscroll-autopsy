import type { ObserverEvent } from '@shared/types';
import type { LiveStats } from './service';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Content script → service worker. The tab id comes from the sender. */
    'observer-event': { request: ObserverEvent; response: void };
    /** Popup → service worker: today's live counts (PDD 4.4, M1). */
    'live-stats': { request: void; response: LiveStats };
  }
}

export {};
