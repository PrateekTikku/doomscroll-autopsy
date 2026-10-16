import type { NudgeStep } from './policy';

/**
 * Coach-voice copy for nudges (PDD 4.2, D-44): calm, factual, short, non-judgemental. Speaks only
 * of browser attention and never of time outside the browser (D-45).
 */
export interface NudgeFacts {
  /** Name of the Drain territory the user is in. */
  territory: string;
  allowanceMin: number;
  /** Drain minutes spent in it today. */
  spentMin: number;
  /** The Deep territory the user left recently, if any. */
  leftDeep?: { name: string; minutesAgo: number } | null;
}

export interface NudgeCopy {
  title: string;
  body: string;
  /** Labels: primary = back to work, secondary = carry on. */
  primary: string;
  secondary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const minutes = (n: number) => plural(Math.max(0, Math.round(n)), 'minute');

export function nudgeCopy(step: NudgeStep, f: NudgeFacts): NudgeCopy {
  const spent = Math.round(f.spentMin);
  const used =
    spent > f.allowanceMin
      ? `You've spent ${minutes(f.spentMin)} in ${f.territory} today, past your ${minutes(f.allowanceMin)}.`
      : `You've used your ${minutes(f.allowanceMin)} in ${f.territory} today.`;
  if (step === 1) {
    const left = f.leftDeep && f.leftDeep.minutesAgo >= 1 ? `You left ${f.leftDeep.name} ${minutes(f.leftDeep.minutesAgo)} ago. ` : '';
    return {
      title: 'A moment',
      body: `${left}${used} Back to deep work?`,
      primary: 'Back to it',
      secondary: '5 more min',
    };
  }
  return {
    title: 'Still here?',
    body: `${used} The pace hasn't changed. Keep going?`,
    primary: 'Back to it',
    secondary: 'Keep going',
  };
}
