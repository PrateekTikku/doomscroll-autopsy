import { get, getAll, put, type BinRecord } from '@/lib/db';
import { evaluateModes, type EvalResult } from './eval';
import { trainMarkov, type MarkovModel } from './markov';
import { selectMode, territoryInfo, type Mode } from './scoring';

/** Storage side of the prediction models: `models` records `markov`, `eval`, `prediction-mode` (PDD 8.1). */
export const MODEL_MARKOV = 'markov';
export const MODEL_EVAL = 'eval';
export const MODEL_MODE = 'prediction-mode';
/** The live Markov model is rebuilt from all retained bins at most this often. */
export const MARKOV_REFRESH_MS = 6 * 3600_000;

export interface ModeRecord {
  mode: Mode;
  reason: string;
  spanMs: number;
  labelledBins: number;
}

async function sortedBins(): Promise<BinRecord[]> {
  return (await getAll('bins')).sort((a, b) => a.binStart - b.binStart);
}

export function modeStats(bins: BinRecord[]): { spanMs: number; labelledBins: number } {
  const labelled = bins.filter((b) => b.territoryId != null && !b.away && !b.idle);
  return { spanMs: bins.length ? bins[bins.length - 1]!.binStart - bins[0]!.binStart : 0, labelledBins: labelled.length };
}

/** Decides the active mode (rules until a day of bins, then Markov), stores it and, in Markov mode, the model. */
export async function refreshPrediction(now = Date.now(), force = false): Promise<{ mode: Mode; markov: MarkovModel | null }> {
  const bins = await sortedBins();
  const stats = modeStats(bins);
  const mode = selectMode(stats);
  let markov: MarkovModel | null = null;
  if (mode === 'markov') {
    const stored = await get('models', MODEL_MARKOV);
    if (!force && stored && now - stored.updatedAt < MARKOV_REFRESH_MS) {
      markov = stored.data as MarkovModel;
    } else {
      markov = trainMarkov(bins);
      await put('models', { name: MODEL_MARKOV, updatedAt: now, data: markov });
    }
  }
  const record: ModeRecord = {
    mode,
    spanMs: stats.spanMs,
    labelledBins: stats.labelledBins,
    reason:
      mode === 'markov'
        ? 'a day of labelled bins is available'
        : `rules until the history spans a day (${Math.round(stats.spanMs / 3600_000)} h so far, ${stats.labelledBins} labelled bins)`,
  };
  await put('models', { name: MODEL_MODE, updatedAt: now, data: record });
  return { mode, markov };
}

export async function getStoredMode(): Promise<ModeRecord | null> {
  return ((await get('models', MODEL_MODE))?.data as ModeRecord | undefined) ?? null;
}

/** Rules vs Markov on the owner's data; stored as `models/eval`. */
export async function evaluateOnStoredData(now = Date.now()): Promise<EvalResult> {
  const bins = await sortedBins();
  const info = territoryInfo(await getAll('territories'));
  const result = evaluateModes(bins, info, { now });
  await put('models', { name: MODEL_EVAL, updatedAt: now, data: result });
  return result;
}

export async function getStoredEval(): Promise<EvalResult | null> {
  return ((await get('models', MODEL_EVAL))?.data as EvalResult | undefined) ?? null;
}
