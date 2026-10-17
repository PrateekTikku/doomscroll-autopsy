import type { GruEvalRecord } from './gru-promote';

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Background → offscreen: train, evaluate and (maybe) promote the GRU on the stored history. */
    'gru-train': { request: { epochs?: number; maxWindows?: number; backend?: 'webgpu' | 'cpu' | 'auto' } | void; response: GruEvalRecord | null };
    /** Dashboard → background: run it now, then refresh the active mode. */
    'gru-run': { request: { backend?: 'webgpu' | 'cpu' | 'auto' } | void; response: GruEvalRecord | null };
    /** Dashboard → background: the latest GRU-vs-Markov evaluation. */
    'gru-status': { request: void; response: GruEvalRecord | null };
  }
}

export {};
