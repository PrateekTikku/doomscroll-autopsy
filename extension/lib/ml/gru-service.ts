import { getAll, type BinRecord } from '@/lib/db';
import { evaluateModes, chooseSplit, type EvalResult } from './eval';
import { trainGru, type TrainOptions } from './gru-train';
import { evalRecord, saveGru, type GruEvalRecord } from './gru-promote';
import { territoryInfo } from './scoring';

/**
 * Train, evaluate and promote the GRU on the stored history (PDD 9.6, D-20). Runs in the offscreen
 * document (it imports TF.js); the background asks for it with `gru-train`.
 * Train on every day but the latest, evaluate on the latest, promote only if AUC beats Markov.
 */
export async function trainAndEvaluateStored(opts: TrainOptions = {}, now = Date.now()): Promise<{ record: GruEvalRecord | null; result: EvalResult | null }> {
  const bins = ((await getAll('bins')) as BinRecord[]).sort((a, b) => a.binStart - b.binStart);
  const info = territoryInfo(await getAll('territories'));
  const split = chooseSplit(bins);
  if (split.kind === 'none') return { record: null, result: null };
  const t0 = performance.now();
  const model = await trainGru(bins.slice(0, split.testStart), info, opts);
  if (!model) return { record: null, result: null };
  const trainMs = Math.round(performance.now() - t0);
  const result = evaluateModes(bins, info, { now, split, gru: model });
  const record = evalRecord(result, model, trainMs);
  await saveGru(model, record);
  return { record, result };
}
