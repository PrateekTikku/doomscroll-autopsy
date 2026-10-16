import { evaluateModes, type EvalResult, type ModeMetrics } from '@/lib/ml/eval';
import { DEFAULT_ALLOWANCE_MIN, type TerritoryInfo } from '@/lib/ml/scoring';
import type { PipelineEvent } from '@/lib/observer/types';
import { replayAll } from './replayer';
import { personaTerritories, personas, syntheticDay } from './synthetic';

/**
 * Rules vs Markov on synthetic multi-day histories (one per persona), for the showcase table.
 * Honest caveat that goes with every number from here: the days come from a generator we wrote, so
 * this validates the harness and the pipeline end to end; it does not show how well either model
 * predicts a real person.
 */
export interface PersonaEval {
  persona: string;
  days: number;
  bins: number;
  eval: EvalResult;
  nudges: { total: number; banners: number; blurs: number; perDay: number };
}

export interface SyntheticEvaluation {
  days: number;
  seed: number;
  perPersona: PersonaEval[];
  mean: { rules: Pick<ModeMetrics, 'top1' | 'top3' | 'switchTop3' | 'auc'>; markov: Pick<ModeMetrics, 'top1' | 'top3' | 'switchTop3' | 'auc'> };
}

const avg = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function evaluateSynthetic(opts: { days?: number; seed?: number; start?: Date; personaIds?: string[] } = {}): SyntheticEvaluation {
  const days = opts.days ?? 14;
  const seed = opts.seed ?? 1;
  const start = opts.start ?? new Date(2026, 8, 28);
  const perPersona: PersonaEval[] = [];
  for (const p of personas.filter((x) => !opts.personaIds || opts.personaIds.includes(x.id))) {
    const { territories, routes } = personaTerritories(p);
    const events: PipelineEvent[] = [];
    for (let d = 0; d < days; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      events.push(...syntheticDay(p, date, seed).events);
    }
    const result = replayAll(events, { territories, routes });
    const info = new Map<string, TerritoryInfo>(territories.map((t) => [t.id, { label: t.label, allowanceMin: t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN }]));
    perPersona.push({
      persona: p.id,
      days,
      bins: result.bins.length,
      eval: evaluateModes(result.bins, info),
      nudges: {
        total: result.nudges.length,
        banners: result.nudges.filter((n) => n.step === 1).length,
        blurs: result.nudges.filter((n) => n.step === 2).length,
        perDay: result.nudges.length / days,
      },
    });
  }
  const mean = (m: 'rules' | 'markov') => ({
    top1: avg(perPersona.map((r) => r.eval[m].top1)),
    top3: avg(perPersona.map((r) => r.eval[m].top3)),
    switchTop3: avg(perPersona.map((r) => r.eval[m].switchTop3)),
    auc: avg(perPersona.map((r) => r.eval[m].auc)),
  });
  return { days, seed, perPersona, mean: { rules: mean('rules'), markov: mean('markov') } };
}

const pct = (x: number | null) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null) => (x == null ? 'n/a' : x.toFixed(3));

export function evaluationMarkdown(e: SyntheticEvaluation): string {
  const rows = e.perPersona
    .map((r) => `| ${r.persona} | ${r.eval.split} | ${r.eval.testBins} | ${pct(r.eval.rules.top1)} / ${pct(r.eval.markov.top1)} | ${pct(r.eval.rules.top3)} / ${pct(r.eval.markov.top3)} | ${pct(r.eval.rules.switchTop3)} / ${pct(r.eval.markov.switchTop3)} | ${num(r.eval.rules.auc)} / ${num(r.eval.markov.auc)} | ${r.eval.markov.positives}/${r.eval.markov.nScore} | ${r.nudges.perDay.toFixed(1)} |`)
    .join('\n');
  return [
    `Synthetic evaluation: ${e.days} days per persona, seed ${e.seed}. Cells are rules / Markov. Held-out = the latest day.`,
    '',
    '| Persona | Split | Test bins | Top-1 | Top-3 | Top-3 on switches | Spiral AUC | Positives | Nudges/day |',
    '|---|---|---|---|---|---|---|---|---|',
    rows,
    `| **mean** | | | ${pct(e.mean.rules.top1)} / ${pct(e.mean.markov.top1)} | ${pct(e.mean.rules.top3)} / ${pct(e.mean.markov.top3)} | ${pct(e.mean.rules.switchTop3)} / ${pct(e.mean.markov.switchTop3)} | ${num(e.mean.rules.auc)} / ${num(e.mean.markov.auc)} | | |`,
  ].join('\n');
}
