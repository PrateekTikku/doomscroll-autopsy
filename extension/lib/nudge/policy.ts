import type { Label, NudgeResponse } from '@/lib/db';

/**
 * Nudge policy (PDD 4.5, 9.7). Pure: given the score and the situation, decide whether to nudge
 * and at which step. The caller delivers and logs.
 *
 * Rules, in order:
 *  - never outside a Drain territory (Deep and Shallow are never nudged);
 *  - never while the territory still has allowance left (the score already encodes how far past
 *    it the user is predicted to go; this guard makes "within the allowance" a hard stop);
 *  - never during quiet hours;
 *  - score must reach the sensitivity threshold;
 *  - at most one nudge per 15 minutes (the cooldown);
 *  - step 1 first; step 2 if the previous nudge (within an hour) was ignored or snoozed and the
 *    score is still above the threshold after the cooldown; "back" resets to step 1;
 *  - never above the user's max step. Step 3 (breathing) arrives in M8, so the ceiling is 2 here.
 */
export const COOLDOWN_MS = 15 * 60_000;
export const ESCALATION_WINDOW_MS = 60 * 60_000;
export const IMPLEMENTED_MAX_STEP = 2;

export type NudgeStep = 1 | 2 | 3;
export type SkipReason = 'below-threshold' | 'not-drain' | 'within-allowance' | 'cooldown' | 'quiet-hours';

export interface LastNudge {
  ts: number;
  step: NudgeStep;
  response: NudgeResponse | null;
}

export interface PolicyInput {
  now: number;
  score: number;
  threshold: number;
  currentLabel: Label | null;
  /** Remaining allowance of the current Drain territory, in minutes. */
  remainingCurrentMin: number | null;
  maxStep: NudgeStep;
  quietHours: { start: string; end: string } | null;
  last: LastNudge | null;
}

export type Decision = { show: true; step: NudgeStep } | { show: false; reason: SkipReason };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Local-time range, which may wrap past midnight (e.g. 22:00–07:00). */
export function inQuietHours(now: number, q: { start: string; end: string } | null): boolean {
  if (!q) return false;
  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes();
  const a = minutesOf(q.start);
  const b = minutesOf(q.end);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

export function decideNudge(input: PolicyInput): Decision {
  if (input.currentLabel !== 'drain') return { show: false, reason: 'not-drain' };
  if ((input.remainingCurrentMin ?? 0) > 0) return { show: false, reason: 'within-allowance' };
  if (inQuietHours(input.now, input.quietHours)) return { show: false, reason: 'quiet-hours' };
  if (input.score < input.threshold) return { show: false, reason: 'below-threshold' };
  const last = input.last;
  if (last && input.now - last.ts < COOLDOWN_MS) return { show: false, reason: 'cooldown' };
  const ceiling = Math.min(input.maxStep, IMPLEMENTED_MAX_STEP) as NudgeStep;
  let step: NudgeStep = 1;
  if (last && last.response !== 'back' && input.now - last.ts < ESCALATION_WINDOW_MS) {
    step = Math.min(last.step + 1, ceiling) as NudgeStep;
  }
  return { show: true, step };
}
