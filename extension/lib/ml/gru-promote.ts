import { get, put, type BinRecord } from '@/lib/db';
import type { EvalResult } from './eval';
import type { GruModel } from './gru';
import { windowAt, runningContexts, predictedMinutes, SEQ_LEN, type Window } from './gru';
import { binState } from './markov';
import type { TerritoryInfo } from './scoring';

/** Storage and the promotion rule for the GRU (PDD 9.6, D-20). No TF.js here: safe for the service worker. */
export const MODEL_GRU = 'gru';
export const MODEL_GRU_EVAL = 'gru-eval';

export interface GruEvalRecord {
  ranAt: number;
  promoted: boolean;
  reason: string;
  gruAuc: number | null;
  markovAuc: number | null;
  rulesAuc: number | null;
  gruTop1: number | null;
  markovTop1: number | null;
  gruTop3: number | null;
  markovTop3: number | null;
  split: EvalResult['split'];
  trainBins: number;
  testBins: number;
  trainWindows: number;
  backend: string;
  trainMs: number;
}

/** AUC differences below this are noise on one day of data: "ties go to Markov" includes near-ties. */
export const PROMOTION_MARGIN = 0.005;

/**
 * "Higher AUC runs tomorrow; ties go to Markov." The GRU must have an AUC, Markov must have one to
 * be compared against, and the GRU's must be higher by at least PROMOTION_MARGIN.
 */
export function decidePromotion(result: Pick<EvalResult, 'split' | 'markov' | 'gru'>): { promoted: boolean; reason: string } {
  if (result.split === 'none' || !result.gru) return { promoted: false, reason: 'not enough history to compare against Markov yet' };
  if (result.split !== 'latest-day') return { promoted: false, reason: 'the GRU is only compared once a full earlier day can train it and the latest day can test it' };
  const g = result.gru.auc;
  const m = result.markov.auc;
  if (g == null || m == null) return { promoted: false, reason: 'the held-out day has no spiral to measure AUC on, so Markov stays' };
  if (g - m >= PROMOTION_MARGIN) return { promoted: true, reason: `GRU AUC ${g.toFixed(3)} beat Markov ${m.toFixed(3)} on the held-out day` };
  return { promoted: false, reason: `GRU AUC ${g.toFixed(3)} did not beat Markov ${m.toFixed(3)} by ${PROMOTION_MARGIN} (ties go to Markov)` };
}

export function evalRecord(result: EvalResult, model: GruModel, trainMs: number): GruEvalRecord {
  const d = decidePromotion(result);
  return {
    ranAt: result.ranAt,
    promoted: d.promoted,
    reason: d.reason,
    gruAuc: result.gru?.auc ?? null,
    markovAuc: result.markov.auc,
    rulesAuc: result.rules.auc,
    gruTop1: result.gru?.top1 ?? null,
    markovTop1: result.markov.top1,
    gruTop3: result.gru?.top3 ?? null,
    markovTop3: result.markov.top3,
    split: result.split,
    trainBins: result.trainBins,
    testBins: result.testBins,
    trainWindows: model.trainWindows,
    backend: model.backend,
    trainMs,
  };
}

export async function getGruEval(): Promise<GruEvalRecord | null> {
  return ((await get('models', MODEL_GRU_EVAL))?.data as GruEvalRecord | undefined) ?? null;
}

/** The promoted GRU model, or null if none is promoted. */
export async function getPromotedGru(): Promise<GruModel | null> {
  const ev = await getGruEval();
  if (!ev?.promoted) return null;
  return ((await get('models', MODEL_GRU))?.data as GruModel | undefined) ?? null;
}

export async function saveGru(model: GruModel, record: GruEvalRecord): Promise<void> {
  await put('models', { name: MODEL_GRU, updatedAt: record.ranAt, data: model });
  await put('models', { name: MODEL_GRU_EVAL, updatedAt: record.ranAt, data: record });
}

/** Live use: expected minutes per state over the next 10 minutes from the latest bins, or null if too little context. */
export function gruPredictFromBins(model: GruModel, bins: BinRecord[], territories: Map<string, TerritoryInfo>, currentState?: string): Map<string, number> | null {
  if (bins.length < 8) return null;
  const tail = bins.slice(-SEQ_LEN);
  const ctxs = runningContexts(tail, territories);
  const w: Window = windowAt(tail, ctxs, tail.length - 1, model.vocab, territories, model.stats);
  // The newest sample can be ahead of the last closed bin (K-16): use it as the final step's state.
  if (currentState && currentState !== binState(tail[tail.length - 1]!)) {
    const idx = model.vocab.indexOf(currentState);
    if (idx >= 0) w.ids[w.ids.length - 1] = idx;
  }
  return predictedMinutes(model, w);
}
