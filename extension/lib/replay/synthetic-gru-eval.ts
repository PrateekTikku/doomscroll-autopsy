import { chooseSplit, evaluateModes, type EvalResult } from '@/lib/ml/eval';
import { trainGru, type TrainOptions } from '@/lib/ml/gru-train';
import { decidePromotion } from '@/lib/ml/gru-promote';
import { DEFAULT_ALLOWANCE_MIN, type TerritoryInfo } from '@/lib/ml/scoring';
import type { PipelineEvent } from '@/lib/observer/types';
import { replayAll } from './replayer';
import { personaTerritories, personas, syntheticDay } from './synthetic';

/**
 * GRU vs Markov vs rules on synthetic persona histories (D-20, M8). Same caveat as
 * `synthetic-eval.ts` (K-18): the generator is ours, so this checks the machinery and shows what the
 * promotion rule does; it does not show how well anything predicts a real person.
 */
export interface PersonaGruEval {
  persona: string;
  days: number;
  bins: number;
  trainWindows: number;
  trainMs: number;
  backend: string;
  eval: EvalResult;
  promoted: boolean;
  reason: string;
}

export async function evaluateSyntheticGru(opts: { days?: number; seed?: number; personaIds?: string[] } & Pick<TrainOptions, 'epochs' | 'maxWindows'> = {}): Promise<PersonaGruEval[]> {
  const days = opts.days ?? 7;
  const seed = opts.seed ?? 1;
  const start = new Date(2026, 8, 28);
  const out: PersonaGruEval[] = [];
  for (const p of personas.filter((x) => !opts.personaIds || opts.personaIds.includes(x.id))) {
    const { territories, routes } = personaTerritories(p);
    const events: PipelineEvent[] = [];
    for (let d = 0; d < days; d++) events.push(...syntheticDay(p, new Date(start.getFullYear(), start.getMonth(), start.getDate() + d), seed).events);
    const { bins } = replayAll(events, { territories, routes });
    const info = new Map<string, TerritoryInfo>(territories.map((t) => [t.id, { label: t.label, allowanceMin: t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN }]));
    const split = chooseSplit(bins);
    const t0 = performance.now();
    const model = await trainGru(bins.slice(0, split.testStart), info, { backend: 'cpu', epochs: opts.epochs, maxWindows: opts.maxWindows });
    const trainMs = Math.round(performance.now() - t0);
    if (!model) continue;
    const result = evaluateModes(bins, info, { split, gru: model });
    const d = decidePromotion(result);
    out.push({ persona: p.id, days, bins: bins.length, trainWindows: model.trainWindows, trainMs, backend: model.backend, eval: result, promoted: d.promoted, reason: d.reason });
  }
  return out;
}

const pct = (x: number | null | undefined) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null | undefined) => (x == null ? 'n/a' : x.toFixed(3));

export function gruMarkdown(rows: PersonaGruEval[]): string {
  const lines = [
    `# GRU vs Markov vs rules on synthetic personas (${rows[0]?.days ?? 0} days, last day held out)`,
    '',
    '| Persona | Next top-1 GRU / Markov | Next top-3 GRU / Markov | Switch top-3 GRU / Markov | AUC GRU / Markov / rules | Train | Promoted? |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const e = r.eval;
    lines.push(
      `| ${r.persona} | ${pct(e.gru?.top1)} / ${pct(e.markov.top1)} | ${pct(e.gru?.top3)} / ${pct(e.markov.top3)} | ${pct(e.gru?.switchTop3)} / ${pct(e.markov.switchTop3)} | ${num(e.gru?.auc)} / ${num(e.markov.auc)} / ${num(e.rules.auc)} | ${r.trainWindows} windows, ${(r.trainMs / 1000).toFixed(0)} s (${r.backend}) | ${r.promoted ? 'yes' : 'no'} |`,
    );
  }
  lines.push('', 'Promotion rule (D-20): the GRU runs only if its AUC on the held-out day is higher than Markov\'s by at least 0.005; ties go to Markov.', '', 'Caveat (K-18): synthetic days come from our own generator, so AUC saturates for every model. This checks the machinery and the promotion rule; it is not evidence of predictive skill on a real person.');
  return lines.join('\n');
}
