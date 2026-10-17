import type { Dtype, Device } from './embedder';

export type EmbedderState = 'not-started' | 'idle' | 'downloading' | 'loading' | 'ready' | 'unloaded' | 'error';

export interface EmbedderStatus {
  state: EmbedderState;
  /** Download progress, 0–100 (while `downloading`). */
  percent: number;
  device: Device | null;
  dtype: Dtype | null;
  vision: boolean | null;
  error: string | null;
  embeds: number;
  failed: number;
  medianMs: number | null;
  p95Ms: number | null;
}

/** What the popup shows: the model host's status plus the queue's counters. */
export interface EmbedStatusView extends EmbedderStatus {
  queued: number;
  skipped: number;
  droppedImages: number;
  droppedJobs: number;
  submitted: number;
  written: number;
  noInput: number;
  noInputVisual: number;
  unmatched: number;
  nonFinite: number;
  errors: number;
  /** Samples today with / without a vector, from IndexedDB. */
  vectorsToday: number;
  samplesToday: number;
}

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Background → offscreen. Text and image exist only in memory. */
    embed: {
      request: { text: string | null; image: string | null };
      response: { vector: number[] | null; ms: number };
    };
    'embedder-status': { request: void; response: EmbedderStatus };
    'embedder-warm': { request: void; response: EmbedderStatus };
    'embedder-unload': { request: void; response: EmbedderStatus };
    /** Popup → background. */
    'embed-status': { request: void; response: EmbedStatusView };
    /** Onboarding → background: start the one-time model download now. Returns at once; poll embed-status. */
    'embed-warm': { request: void; response: EmbedderStatus };
  }
}

export {};
