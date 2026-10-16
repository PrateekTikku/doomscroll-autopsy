import type { NamingReport } from './naming-service';
import type { GenStats } from './stats';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Background → offscreen: run the writer model. `sample` selects the sampled retry. */
    generate: {
      request: { prompt: string; maxNewTokens: number; sample: boolean };
      response: { text: string; newTokens: number; ms: number };
    };
    'gen-status': { request: void; response: GenStatus };
    'gen-unload': { request: void; response: GenStatus };
    /** Dashboard → background: name the unconfirmed territories with the writer model now. */
    'gen-name-territories': { request: { force?: boolean } | void; response: NamingReport };
    /** Popup / dashboard → background: the writer's state and the pass/fallback counters. */
    'gen-overview': { request: void; response: GenOverview };
  }
}

export interface GenOverview {
  modelName: string;
  modelVersion: string;
  /** Null while the offscreen document doesn't exist (nothing loaded yet). */
  status: GenStatus | null;
  stats: GenStats;
}

export type GenState = 'not-started' | 'loading' | 'ready' | 'unloaded' | 'error';

export interface GenStatus {
  state: GenState;
  /** 0-100 while loading (a download when the model comes from Hugging Face). */
  percent: number;
  error: string | null;
  device: string | null;
  loadMs: number | null;
  generations: number;
  medianTokPerS: number | null;
}

export {};
