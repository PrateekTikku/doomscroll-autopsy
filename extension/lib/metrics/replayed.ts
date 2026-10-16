import type { DailyFacts } from '@shared/types';
import type { BinRecord, NudgeRecord, TerritoryRecord } from '@/lib/db';
import type { PipelineEvent } from '@/lib/observer/types';
import { replayAll } from '@/lib/replay/replayer';
import { personaTerritories, personas, syntheticDay, type ReplayTerritory } from '@/lib/replay/synthetic';
import { renderAutopsy } from './autopsy';
import { computeFacts } from './facts';
import { dateKey } from './time';

/**
 * Facts and autopsies for replayed synthetic days (PDD 7.7): runs the persona's days through the real
 * observer pipeline, then the real metrics. Used by the evidence export, the headless probe's seed and tests.
 */
export interface ReplayedHistory {
  persona: string;
  territories: TerritoryRecord[];
  bins: BinRecord[];
  nudges: NudgeRecord[];
  days: Array<{ date: string; facts: DailyFacts; autopsy: string }>;
}

const toRecord = (t: ReplayTerritory): TerritoryRecord => ({
  id: t.id,
  centroid: new Float32Array(4),
  size: 100,
  name: t.name,
  topicTags: [],
  suggestedLabel: t.label,
  label: t.label,
  labelConfirmed: true,
  allowanceMin: t.label === 'drain' ? (t.allowanceMin ?? 15) : null,
  firstSeen: 0,
  lastSeen: 0,
});

export function replayedHistory(personaId: string, opts: { days?: number; seed?: number; start?: Date } = {}): ReplayedHistory {
  const persona = personas.find((p) => p.id === personaId);
  if (!persona) throw new Error(`Unknown persona ${personaId}`);
  const days = opts.days ?? 8;
  const seed = opts.seed ?? 1;
  const start = opts.start ?? new Date(2026, 9, 5);
  const { territories, routes } = personaTerritories(persona);
  const events: PipelineEvent[] = [];
  for (let d = 0; d < days; d++) {
    events.push(...syntheticDay(persona, new Date(start.getFullYear(), start.getMonth(), start.getDate() + d), seed).events);
  }
  const result = replayAll(events, { territories, routes, respond: (n) => (n.step === 1 && n.ts % 3 === 0 ? 'ignored' : 'back') });
  const records = territories.map(toRecord);
  const nudges: NudgeRecord[] = result.nudges.map((n) => ({ ts: n.ts, step: n.step, score: n.score, mode: n.mode, response: n.response, secondsToReturn: n.response === 'back' ? 90 + (n.ts % 300) : null }));
  const dates = [...new Set(result.bins.map((b) => dateKey(b.binStart)))].sort();
  const done: ReplayedHistory['days'] = [];
  for (const date of dates) {
    const facts = computeFacts({ date, bins: result.bins, territories: records, nudges, previous: done.map((d) => ({ date: d.date, facts: d.facts })) });
    done.push({ date, facts, autopsy: renderAutopsy(facts) });
  }
  return { persona: personaId, territories: records, bins: result.bins, nudges, days: done };
}
