import type { NudgeResponse } from '@/lib/db';
import type { NudgeStep } from './policy';
import type { Mode } from '@/lib/ml/scoring';

/** What the content script needs to draw a nudge. */
export interface NudgePayload {
  /** Id of the `nudges` record; null for replays, which are never stored. */
  id: number | null;
  step: NudgeStep;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  /** Step 2 offers a "Take a breath" button (the user allows step 3). */
  offerBreath?: boolean;
  /** Shown as a visible "Replay" pill (demo mode). */
  replay: boolean;
}

export interface SpiralStatus {
  mode: Mode;
  /** Why this mode is active. */
  modeReason: string | null;
  /** Current spiral score 0–1, or null when nothing is being observed right now. */
  score: number | null;
  threshold: number;
  /** Label of what the user is on right now, if known. */
  currentLabel: 'deep' | 'shallow' | 'drain' | null;
  replay: boolean;
}

declare module '@/lib/messaging' {
  interface MessageMap {
    /** Background → content script of the active tab. */
    'nudge-show': { request: NudgePayload; response: { shown: boolean } };
    /** Content script → background: how the user responded. */
    'nudge-response': { request: { id: number; response: NudgeResponse }; response: void };
    /** Popup → background. */
    'spiral-status': { request: void; response: SpiralStatus };
  }
}

export {};
