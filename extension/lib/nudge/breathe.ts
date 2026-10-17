/**
 * Breathing pause (PDD 4.5 step 3, Should): a 30-second guided cycle, three rounds of 5 s in and 5 s out.
 * Pure timing here; the overlay is drawn in `ui.ts`.
 */
export const BREATH_TOTAL_MS = 30_000;
export const BREATH_PHASE_MS = 5_000;

export type BreathPhase = 'in' | 'out';

export interface BreathState {
  phase: BreathPhase;
  /** Whole seconds left in this phase, 5 down to 1. */
  phaseSecondsLeft: number;
  /** Whole seconds left in the pause. */
  totalSecondsLeft: number;
  /** 0 (empty) to 1 (full): how open the circle should be. */
  fullness: number;
  done: boolean;
}

export function breathState(elapsedMs: number): BreathState {
  const t = Math.max(0, elapsedMs);
  if (t >= BREATH_TOTAL_MS) return { phase: 'out', phaseSecondsLeft: 0, totalSecondsLeft: 0, fullness: 0, done: true };
  const inPhase = t % (2 * BREATH_PHASE_MS);
  const phase: BreathPhase = inPhase < BREATH_PHASE_MS ? 'in' : 'out';
  const within = phase === 'in' ? inPhase : inPhase - BREATH_PHASE_MS;
  const progress = within / BREATH_PHASE_MS;
  return {
    phase,
    phaseSecondsLeft: Math.ceil((BREATH_PHASE_MS - within) / 1000),
    totalSecondsLeft: Math.ceil((BREATH_TOTAL_MS - t) / 1000),
    fullness: phase === 'in' ? progress : 1 - progress,
    done: false,
  };
}

export const breathLabel = (s: BreathState) => (s.done ? 'Done' : s.phase === 'in' ? 'Breathe in' : 'Breathe out');
