import type { DailyFacts } from '@shared/types';
import type { BinRecord, Label, NudgeRecord, TerritoryRecord } from '@/lib/db';
import { dayStart } from './time';

export function territory(id: string, name: string, label: Label | null, over: Partial<TerritoryRecord> = {}): TerritoryRecord {
  return {
    id,
    centroid: new Float32Array(4),
    size: 10,
    name,
    topicTags: [],
    suggestedLabel: null,
    label,
    labelConfirmed: label != null,
    allowanceMin: label === 'drain' ? 15 : null,
    firstSeen: 0,
    lastSeen: 0,
    ...over,
  };
}

export const TERRITORIES = [
  territory('doc', 'Design doc', 'deep'),
  territory('code', 'Code review', 'deep'),
  territory('mail', 'Inbox', 'shallow'),
  territory('reels', 'Reels feed', 'drain'),
  territory('mystery', 'Mystery site', null),
];

export type Step = [minutes: number, territoryId: string | 'away' | 'idle' | 'gap'];

/** Builds 30 s bins from steps, starting at `startAt` ("HH:MM") on `date`. 'gap' leaves no bins at all. */
export function binsFrom(date: string, startAt: string, steps: Step[]): BinRecord[] {
  const [h, m] = startAt.split(':').map(Number);
  let t = dayStart(date) + (h! * 60 + m!) * 60_000;
  const bins: BinRecord[] = [];
  for (const [minutes, what] of steps) {
    const n = Math.round(minutes * 2);
    for (let i = 0; i < n; i++, t += 30_000) {
      if (what === 'gap') continue;
      bins.push({
        binStart: t,
        scroll_px_s_mean: 0,
        items_per_min: 2,
        mean_dwell_ms: 20_000,
        video_skip_rate: 0,
        tab_switches: 0,
        away_s: what === 'away' ? 30 : 0,
        idle_s: what === 'idle' ? 30 : 0,
        active_s: what === 'away' || what === 'idle' ? 0 : 30,
        territoryId: what === 'away' || what === 'idle' ? null : what,
        away: what === 'away',
        idle: what === 'idle',
        nudgeShown: false,
        nudgeResponse: null,
      });
    }
  }
  return bins;
}

export function nudge(date: string, at: string, response: NudgeRecord['response'], secondsToReturn: number | null = null): NudgeRecord {
  const [h, m] = at.split(':').map(Number);
  return { ts: dayStart(date) + (h! * 60 + m!) * 60_000, step: 1, score: 0.7, mode: 'rules', response, secondsToReturn };
}

export function emptyFacts(date: string, over: Partial<DailyFacts> = {}): DailyFacts {
  return {
    date,
    deepBlocks: { count: 0, longestMin: 0, totalMin: 0, blocks: [] },
    residue: { switchesOutOfDeep: 0, meanMinBackToDeep: null },
    totalsMin: { deep: 0, shallow: 0, drain: 0 },
    drainOverAllowance: [],
    topTriggers: [],
    strongestStretch: null,
    nudges: { shown: 0, accepted: 0, snoozed: 0, ignored: 0, medianReturnMin: null },
    vs7Day: null,
    ...over,
  };
}
