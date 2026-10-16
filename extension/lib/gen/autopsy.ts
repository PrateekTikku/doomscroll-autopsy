import type { DailyFacts } from '@shared/types';
import { renderAutopsy, TEMPLATE_VERSION } from '@/lib/metrics/autopsy';
import { validateAutopsy } from '@/lib/metrics/validate';
import type { GenerateFn } from './client';
import { GEN_MODEL_VERSION, MAX_NEW_TOKENS } from './config';
import { studentPrompt } from './prompt';

/**
 * The autopsy writer (PDD 9.8): the fine-tuned model phrases `facts`; its text is accepted only if it
 * passes the number-grounding checks, the structure checks and the strict semantic checks (K-07).
 * One sampled regeneration is allowed; then the M5 template is used, which always passes.
 */
export interface AutopsyResult {
  text: string;
  /** `template` or the model version, stored in `reports.modelVersion`. */
  version: string;
  source: { kind: 'model' | 'template'; attempts: number; errors: string[] };
  /** The writer model could not run at all (not a validation failure). */
  unavailable: boolean;
}

export const MAX_ATTEMPTS = 2;

const hasContent = (f: DailyFacts) => f.totalsMin.deep + f.totalsMin.shallow + f.totalsMin.drain > 0 || f.deepBlocks.count > 0;

export async function writeAutopsy(facts: DailyFacts, generate: GenerateFn): Promise<AutopsyResult> {
  const fallback = (attempts: number, errors: string[], unavailable = false): AutopsyResult => ({
    text: renderAutopsy(facts),
    version: TEMPLATE_VERSION,
    source: { kind: 'template', attempts, errors },
    unavailable,
  });
  // Nothing to phrase on an empty day: the template says so plainly.
  if (!hasContent(facts)) return fallback(0, ['empty_day']);

  const prompt = studentPrompt('autopsy', facts);
  const errors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string;
    try {
      text = (await generate({ prompt, maxNewTokens: MAX_NEW_TOKENS.autopsy, sample: attempt > 1 })).text.trim();
    } catch (e) {
      return fallback(attempt - 1, [...errors, `unavailable: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)], true);
    }
    const errs = validateAutopsy(text, facts);
    if (errs.length === 0) return { text, version: GEN_MODEL_VERSION, source: { kind: 'model', attempts: attempt, errors }, unavailable: false };
    errors.push(...errs);
  }
  return fallback(MAX_ATTEMPTS, errors);
}
