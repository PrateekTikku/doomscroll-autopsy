import type { BinRecord, NudgeResponse, SampleRecord } from '@/lib/db';
import { binTerritories, type TimedSample } from '@/lib/ml/territories-core';
import { binState, trainMarkov, type MarkovModel } from '@/lib/ml/markov';
import { DEFAULT_ALLOWANCE_MIN, scoreSpiral, selectMode, type Mode, type ScoreContext, type SpiralScore, type TerritoryInfo } from '@/lib/ml/scoring';
import { nudgeCopy } from '@/lib/nudge/copy';
import type { NudgePayload } from '@/lib/nudge/messages';
import { decideNudge, type LastNudge, type NudgeStep } from '@/lib/nudge/policy';
import { BIN_MS, initialState, step as pipelineStep, type PipelineState } from '@/lib/observer/pipeline';
import type { PipelineEvent } from '@/lib/observer/types';
import { SENSITIVITY_THRESHOLD, type Settings } from '@/lib/settings';
import { resolveRoute, type ReplayTerritory, type Route } from './synthetic';

/**
 * Replayer (PDD 7.7, D-35): feeds recorded or synthetic events through the real pipeline (`step`)
 * on the events' own clock, resolves territories from routes, and runs scoring and the nudge policy
 * after every closed bin, the way the live service does every 30 s.
 *
 * Everything is in memory. A replay never writes samples, bins or nudges to the real stores, so it
 * can't pollute the owner's data; the results are returned and can be downloaded.
 */
export interface ReplaySettings {
  sensitivity: Settings['sensitivity'];
  maxNudgeStep: Settings['maxNudgeStep'];
  quietHours: Settings['quietHours'];
}

export const DEFAULT_REPLAY_SETTINGS: ReplaySettings = { sensitivity: 'balanced', maxNudgeStep: 2, quietHours: null };
const MARKOV_RETRAIN_MS = 6 * 3600_000;
const HISTORY_BINS = 20;

export interface ReplayNudge {
  ts: number;
  step: NudgeStep;
  score: number;
  mode: Mode;
  territory: string;
  /** How the replay answered it (scripted; nobody clicks in a replay). */
  response: NudgeResponse;
  payload: NudgePayload;
}

export interface ReplayOptions {
  territories: ReplayTerritory[];
  routes: Route[];
  settings?: Partial<ReplaySettings>;
  /** Force a mode; default follows the live rule (rules until a day of labelled bins). */
  mode?: Mode | 'auto';
  /** Called as soon as a nudge fires. */
  onNudge?: (n: ReplayNudge) => void;
  /** What the scripted user does with each nudge. Default: ignore it. */
  respond?: (n: ReplayNudge) => NudgeResponse;
}

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function createReplayEngine(opts: ReplayOptions) {
  const settings = { ...DEFAULT_REPLAY_SETTINGS, ...opts.settings };
  const threshold = SENSITIVITY_THRESHOLD[settings.sensitivity];
  const info = new Map<string, TerritoryInfo>(opts.territories.map((t) => [t.id, { label: t.label, allowanceMin: t.allowanceMin ?? DEFAULT_ALLOWANCE_MIN }]));
  const names = new Map(opts.territories.map((t) => [t.id, t.name]));

  const pipeline: PipelineState = initialState();
  const samples: TimedSample[] = [];
  const sampleRecords: SampleRecord[] = [];
  const bins: BinRecord[] = [];
  const nudges: ReplayNudge[] = [];
  const scores: Array<{ ts: number; score: number; mode: Mode; state: string }> = [];
  let last: LastNudge | null = null;
  let markov: MarkovModel | null = null;
  let markovAt = 0;
  let spent = new Map<string, number>();
  let spentDay = -1;
  let lastDeep: { id: string; end: number } | null = null;

  function modeAt(ts: number): { mode: Mode; markov: MarkovModel | null } {
    const labelled = bins.filter((b) => b.territoryId != null && !b.away && !b.idle).length;
    const span = bins.length ? bins[bins.length - 1]!.binStart - bins[0]!.binStart : 0;
    const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : selectMode({ spanMs: span, labelledBins: labelled });
    if (mode === 'markov' && (!markov || ts - markovAt >= MARKOV_RETRAIN_MS)) {
      markov = trainMarkov(bins);
      markovAt = ts;
    }
    return { mode, markov: mode === 'markov' ? markov : null };
  }

  function onBin(bin: BinRecord): void {
    const day = dayStart(bin.binStart);
    if (day !== spentDay) {
      spentDay = day;
      spent = new Map();
    }
    const t = bin.territoryId;
    if (t != null && info.get(t)?.label === 'drain') spent.set(t, (spent.get(t) ?? 0) + bin.active_s / 60);
    if (t != null && info.get(t)?.label === 'deep') lastDeep = { id: t, end: bin.binStart + BIN_MS };
    bins.push(bin);

    // The live service scores the state a moment after a bin closes; the bin's end is that moment.
    const now = bin.binStart + BIN_MS;
    if (bin.away || bin.idle) return;
    const state = binState(bin);
    const { mode, markov: m } = modeAt(now);
    const ctx: ScoreContext = {
      mode,
      markov: m,
      state,
      features: bin,
      history: bins.slice(-HISTORY_BINS).map(binState),
      territories: info,
      spentMin: spent,
    };
    const score: SpiralScore = scoreSpiral(ctx);
    scores.push({ ts: now, score: score.score, mode: score.mode, state });
    const decision = decideNudge({
      now,
      score: score.score,
      threshold,
      currentLabel: score.currentLabel,
      remainingCurrentMin: score.remainingCurrentMin,
      maxStep: settings.maxNudgeStep,
      quietHours: settings.quietHours,
      last,
    });
    if (!decision.show) return;

    const id = state;
    const copy = nudgeCopy(decision.step, {
      territory: names.get(id) ?? 'this feed',
      allowanceMin: info.get(id)?.allowanceMin ?? DEFAULT_ALLOWANCE_MIN,
      spentMin: spent.get(id) ?? 0,
      leftDeep: lastDeep ? { name: names.get(lastDeep.id) ?? 'deep work', minutesAgo: Math.round((now - lastDeep.end) / 60_000) } : null,
    });
    const payload: NudgePayload = { id: null, step: decision.step, ...copy, replay: true };
    const nudge: ReplayNudge = { ts: now, step: decision.step, score: score.score, mode: score.mode, territory: names.get(id) ?? id, response: 'ignored', payload };
    nudge.response = opts.respond?.(nudge) ?? 'ignored';
    nudges.push(nudge);
    last = { ts: now, step: decision.step, response: nudge.response };
    opts.onNudge?.(nudge);
  }

  return {
    /** Feed one event (in time order). */
    feed(ev: PipelineEvent): void {
      const outputs = pipelineStep(pipeline, ev);
      for (const o of outputs) {
        if (o.kind === 'sample') {
          const territoryId = resolveRoute(opts.routes, o.record.origin, o.record.path);
          samples.push({ ts: o.record.ts, dwellMs: 0, territoryId });
          sampleRecords.push({ ...o.record, territoryId });
        } else if (o.kind === 'dwell') {
          const s = samples[samples.length - 1];
          if (s) s.dwellMs = o.dwellMs;
        } else {
          const territoryId = binTerritories([o.record.binStart], samples).get(o.record.binStart) ?? null;
          onBin({ ...o.record, territoryId });
        }
      }
    },
    get bins() {
      return bins;
    },
    get samples() {
      return sampleRecords;
    },
    get nudges() {
      return nudges;
    },
    get scores() {
      return scores;
    },
    territoryInfo: info,
  };
}

export type ReplayEngine = ReturnType<typeof createReplayEngine>;

/** Runs all events at once (tests, evaluation, "replay this recording"). */
export function replayAll(events: PipelineEvent[], opts: ReplayOptions) {
  const engine = createReplayEngine(opts);
  for (const ev of events) engine.feed(ev);
  return { bins: engine.bins, samples: engine.samples, nudges: engine.nudges, scores: engine.scores };
}

/** Recorder JSONL (one event per line) → events, oldest first. Lines that aren't events are skipped. */
export function parseJsonl(text: string): PipelineEvent[] {
  const out: PipelineEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as PipelineEvent;
      if (ev && typeof ev.type === 'string' && typeof ev.ts === 'number') out.push(ev);
    } catch {
      /* skip */
    }
  }
  return out.map((e, i) => [e, i] as const).sort((a, b) => a[0].ts - b[0].ts || a[1] - b[1]).map(([e]) => e);
}

/**
 * Routes for a real recording: the majority territory per origin + first path segment among the
 * owner's stored samples, so a recorded day lands in the owner's real territories.
 */
export function routesFromSamples(samples: Array<Pick<SampleRecord, 'origin' | 'path' | 'territoryId'>>): Route[] {
  const counts = new Map<string, Map<string, number>>();
  for (const s of samples) {
    if (s.territoryId == null) continue;
    const seg = s.path.split('/').filter(Boolean)[0];
    const key = `${s.origin}\u0000${seg ? '/' + seg : '/'}`;
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(s.territoryId, (m.get(s.territoryId) ?? 0) + 1);
    counts.set(key, m);
  }
  const routes: Route[] = [];
  for (const [key, m] of counts) {
    const [origin, pathPrefix] = key.split('\u0000') as [string, string];
    const territoryId = [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    routes.push({ origin, pathPrefix, territoryId });
  }
  return routes;
}

