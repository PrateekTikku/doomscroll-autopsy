import { browser } from 'wxt/browser';
import { get, getAll, getByTs, getRange, openDb, put, type BinRecord, type Label, type NudgeRecord, type NudgeResponse, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import type { Envelope } from '@/lib/messaging';
import { isFeedSample } from '@/lib/ml/names';
import { binState, UNASSIGNED, type MarkovModel } from '@/lib/ml/markov';
import { getStoredMode, MODEL_MARKOV, MODEL_MODE, refreshPrediction } from '@/lib/ml/evaluate';
import type { GruModel } from '@/lib/ml/gru';
import { getPromotedGru, gruPredictFromBins } from '@/lib/ml/gru-promote';
import { DEFAULT_ALLOWANCE_MIN, drainSpent, scoreSpiral, territoryInfo, type Mode, type ScoreContext, type SpiralScore } from '@/lib/ml/scoring';
import { getSettings, isPaused, SENSITIVITY_THRESHOLD, type Settings } from '@/lib/settings';
import { nudgeCopy, type NudgeFacts } from './copy';
import type { NudgePayload, SpiralStatus } from './messages';
import { decideNudge, type Decision, type LastNudge } from './policy';

/**
 * Live nudging in the service worker (PDD 9.7): every 30 s build the current state from storage,
 * score it, ask the policy, deliver to the active tab and log. The current territory comes from the
 * latest sample's online assignment, not from the one-minute bin sweep (K-16).
 */
export const BIN_RECENT_MS = 120_000;
export const RETURN_WINDOW_MS = 30 * 60_000;
const MODE_REFRESH_MS = 30 * 60_000;
const SAMPLE_LOOKBACK_MS = 5 * 60_000;
const HISTORY_BINS = 20;
const UNASSIGNED_KEY = 'unassigned-feed-spent';

export interface Snapshot {
  now: number;
  ctx: ScoreContext;
  score: SpiralScore;
  /** State key of the current item. */
  state: string;
  territoryName: string | null;
  facts: NudgeFacts | null;
  last: LastNudge | null;
}

interface UnassignedSpent {
  day: number;
  sec: number;
  lastTs: number;
}

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

async function readUnassigned(now: number): Promise<UnassignedSpent> {
  const stored = (await browser.storage.session.get(UNASSIGNED_KEY))[UNASSIGNED_KEY] as UnassignedSpent | undefined;
  return stored && stored.day === dayStart(now) ? stored : { day: dayStart(now), sec: 0, lastTs: now };
}

/** Current state key from the freshest samples: the latest assigned one, carrying past vectorless ones. */
export function currentFromSamples(samples: SampleRecord[]): { state: string; sample: SampleRecord } | null {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]!;
    if (s.territoryId != null) return { state: s.territoryId, sample: latest };
    if (s.vector != null) return { state: UNASSIGNED, sample: latest };
  }
  return { state: UNASSIGNED, sample: latest };
}

async function getPrediction(now: number): Promise<{ mode: Mode; markov: MarkovModel | null; gru: GruModel | null }> {
  const stored = await get('models', MODEL_MODE);
  if (!stored || now - stored.updatedAt > MODE_REFRESH_MS) return { ...(await refreshPrediction(now)), gru: await getPromotedGru() };
  const mode = (stored.data as { mode: Mode }).mode;
  const markov = mode === 'markov' || mode === 'gru' ? ((await get('models', MODEL_MARKOV))?.data as MarkovModel | undefined) ?? null : null;
  const gru = mode === 'gru' ? await getPromotedGru() : null;
  return { mode: gru ? mode : mode === 'gru' ? 'markov' : mode, markov, gru };
}

/** Reads storage and builds what scoring and the policy need. Null when nothing is being observed right now. */
export async function takeSnapshot(now: number, opts: { countUnassigned?: boolean } = {}): Promise<Snapshot | null> {
  const from = Math.min(dayStart(now), now - 30 * 60_000);
  const bins = ((await getRange('bins', from, now)) as BinRecord[]).sort((a, b) => a.binStart - b.binStart);
  const lastBin = bins[bins.length - 1];
  if (!lastBin || now - lastBin.binStart > BIN_RECENT_MS || lastBin.away || lastBin.idle) return null;

  const territories = (await getAll('territories')) as TerritoryRecord[];
  const info = territoryInfo(territories);
  const names = new Map(territories.map((t) => [t.id, t.name]));
  const samples = (await getByTs('samples', now - SAMPLE_LOOKBACK_MS, now)) as SampleRecord[];
  const cur = currentFromSamples(samples);
  const state = cur?.state ?? binState(lastBin);
  const unassignedFeed = state === UNASSIGNED && cur != null && isFeedSample(cur.sample);

  const spent = drainSpent(bins.filter((b) => b.binStart >= dayStart(now)), info, dayStart(now), now);
  if (unassignedFeed) {
    const u = await readUnassigned(now);
    if (opts.countUnassigned) {
      u.sec += Math.min(60, Math.max(0, (now - u.lastTs) / 1000));
      u.lastTs = now;
      await browser.storage.session.set({ [UNASSIGNED_KEY]: u });
    }
    spent.set(UNASSIGNED, u.sec / 60);
  } else if (opts.countUnassigned) {
    const u = await readUnassigned(now);
    await browser.storage.session.set({ [UNASSIGNED_KEY]: { ...u, lastTs: now } });
  }

  const history = bins.slice(-HISTORY_BINS).map(binState);
  if (history[history.length - 1] !== state) history.push(state);
  const { mode, markov, gru } = await getPrediction(now);
  const gruPredicted = gru ? gruPredictFromBins(gru, bins, info, state) : null;
  const ctx: ScoreContext = { mode, markov, gruPredicted, state, features: lastBin, history, territories: info, spentMin: spent, unassignedFeed };
  const score = scoreSpiral(ctx);

  const territoryName = unassignedFeed ? cur!.sample.origin.replace(/^https?:\/\/(www\.)?/, '') : (names.get(state) ?? null);
  let leftDeep: NudgeFacts['leftDeep'] = null;
  for (let i = bins.length - 1; i >= 0; i--) {
    const t = bins[i]!.territoryId;
    if (t != null && info.get(t)?.label === 'deep') {
      leftDeep = { name: names.get(t) ?? 'deep work', minutesAgo: Math.round((now - (bins[i]!.binStart + 30_000)) / 60_000) };
      break;
    }
  }
  const stateInfo = unassignedFeed ? { allowanceMin: DEFAULT_ALLOWANCE_MIN } : info.get(state);
  const facts: NudgeFacts | null =
    territoryName && stateInfo
      ? { territory: territoryName, allowanceMin: stateInfo.allowanceMin, spentMin: spent.get(state) ?? 0, leftDeep }
      : null;

  const nudges = ((await getAll('nudges')) as NudgeRecord[]).sort((a, b) => b.ts - a.ts);
  const last = nudges[0] ? { ts: nudges[0].ts, step: nudges[0].step, response: nudges[0].response } : null;
  return { now, ctx, score, state, territoryName, facts, last };
}

function policyInput(snap: Snapshot, settings: Settings) {
  return {
    now: snap.now,
    score: snap.score.score,
    threshold: SENSITIVITY_THRESHOLD[settings.sensitivity],
    currentLabel: snap.score.currentLabel,
    remainingCurrentMin: snap.score.remainingCurrentMin,
    maxStep: settings.maxNudgeStep,
    quietHours: settings.quietHours,
    last: snap.last,
  };
}

/** Records how long after a nudge the user got back to a Deep territory, and flags the nudge's bin. */
export async function trackNudgeOutcomes(now: number): Promise<void> {
  const nudges = ((await getAll('nudges')) as NudgeRecord[]).filter((n) => now - n.ts <= RETURN_WINDOW_MS);
  if (nudges.length === 0) return;
  const territories = territoryInfo((await getAll('territories')) as TerritoryRecord[]);
  const bins = ((await getRange('bins', Math.min(...nudges.map((n) => n.ts)) - 30_000, now)) as BinRecord[]).sort((a, b) => a.binStart - b.binStart);
  const db = await openDb();
  for (const n of nudges) {
    if (n.secondsToReturn == null) {
      const back = bins.find((b) => b.binStart >= n.ts && !b.away && b.territoryId != null && territories.get(b.territoryId)?.label === 'deep');
      if (back) await put('nudges', { ...n, secondsToReturn: Math.max(0, Math.round((back.binStart - n.ts) / 1000)) });
    }
    const start = Math.floor(n.ts / 30_000) * 30_000;
    const tx = db.transaction('bins', 'readwrite');
    const bin = await tx.store.get(start);
    if (bin && (!bin.nudgeShown || bin.nudgeResponse !== n.response)) await tx.store.put({ ...bin, nudgeShown: true, nudgeResponse: n.response });
    await tx.done;
  }
}

export interface NudgeServiceDeps {
  now?: () => number;
  /** Sends the nudge to the active tab. True if a page showed it. */
  deliver: (payload: NudgePayload) => Promise<boolean>;
}

export type TickResult =
  | { acted: false; reason: 'paused' | 'not-observing' | Extract<Decision, { show: false }>['reason'] }
  | { acted: true; step: 1 | 2 | 3; delivered: boolean; score: number };

export function createNudgeService(deps: NudgeServiceDeps) {
  const now = deps.now ?? Date.now;
  return {
    async tick(): Promise<TickResult> {
      const t = now();
      const settings = await getSettings();
      if (isPaused(settings, t)) return { acted: false, reason: 'paused' };
      await trackNudgeOutcomes(t);
      const snap = await takeSnapshot(t, { countUnassigned: true });
      if (!snap) return { acted: false, reason: 'not-observing' };
      const decision = decideNudge(policyInput(snap, settings));
      if (!decision.show) return { acted: false, reason: decision.reason };
      if (!snap.facts) return { acted: false, reason: 'not-drain' };

      const copy = nudgeCopy(decision.step, snap.facts);
      const id = (await put('nudges', { ts: t, step: decision.step, score: snap.score.score, mode: snap.score.mode, response: null, secondsToReturn: null })) as number;
      const delivered = await deps.deliver({ id, step: decision.step, ...copy, offerBreath: settings.maxNudgeStep >= 3, replay: false });
      // Nothing is logged when no page could show it.
      if (!delivered) await (await openDb()).delete('nudges', id);
      return { acted: true, step: decision.step, delivered, score: snap.score.score };
    },

    async respond(id: number, response: NudgeResponse): Promise<void> {
      const n = await get('nudges', id);
      if (n) await put('nudges', { ...n, response });
    },

    async status(): Promise<SpiralStatus> {
      const t = now();
      const settings = await getSettings();
      const threshold = SENSITIVITY_THRESHOLD[settings.sensitivity];
      const stored = await getStoredMode();
      const snap = isPaused(settings, t) ? null : await takeSnapshot(t);
      const label: Label | null = snap?.score.currentLabel ?? null;
      return {
        mode: snap?.score.mode ?? stored?.mode ?? 'rules',
        modeReason: stored?.reason ?? null,
        score: snap ? snap.score.score : null,
        threshold,
        currentLabel: label,
        replay: false,
      };
    },
  };
}

/** Delivers to the active tab of the focused window, if it has a nudge listener (observed, http/https). */
export async function deliverToActiveTab(payload: NudgePayload): Promise<boolean> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id == null || !/^https?:/.test(tab.url ?? '')) return false;
  try {
    const envelope: Envelope<'nudge-show'> = { target: 'content', type: 'nudge-show', payload };
    const reply = (await browser.tabs.sendMessage(tab.id, envelope)) as { ok: boolean; data?: { shown: boolean } } | undefined;
    return reply?.ok === true && reply.data?.shown === true;
  } catch {
    return false; // no content script in that tab (blocklisted, restricted, or not loaded yet)
  }
}
