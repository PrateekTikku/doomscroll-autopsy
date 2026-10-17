import type { TagReport } from './topics-service';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Dashboard → background: embed the topic phrases if needed and refresh every territory's top-3 tags. */
    'topics-refresh': { request: void; response: TagReport };
  }
}

export {};
