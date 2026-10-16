import type { BinRecord, Label, NudgeRecord, NudgeResponse, TerritoryRecord } from '@/lib/db';
import { BIN_MS, dayEnd, dayStart } from './time';
import { detectDeepBlocks, lookupTerritories, toSlots } from './facts';

/**
 * Pure model for the dashboard timeline (PDD 4.4): territory lanes through the day, the
 * content-velocity line, deep blocks outlined and nudge markers. Away, idle and unobserved time is
 * simply absent: no segment, no label, no count (D-45).
 */
export const MAX_LANES = 8;
export const VELOCITY_BUCKET_MS = 5 * 60_000;
/** Bins closer together than this are drawn as one segment. */
const MERGE_GAP_MS = 60_000;
const LABEL_ORDER: Record<Label | 'other', number> = { deep: 0, shallow: 1, drain: 2, other: 3 };

export interface Lane {
  key: string;
  name: string;
  label: Label | 'other';
  seconds: number;
}

export interface Segment {
  lane: number;
  startTs: number;
  endTs: number;
}

export interface VelocityPoint {
  ts: number;
  itemsPerMin: number;
}

export interface TimelineModel {
  from: number;
  to: number;
  lanes: Lane[];
  segments: Segment[];
  velocity: VelocityPoint[];
  maxVelocity: number;
  blocks: Array<{ startTs: number; endTs: number; minutes: number }>;
  nudges: Array<{ ts: number; step: 1 | 2 | 3; response: NudgeResponse | null }>;
  /** False when the day has no browsing at all. */
  hasData: boolean;
}

const HOUR = 3600_000;

/** Local whole hours (not epoch hours: some time zones are offset by 30 or 45 minutes). */
const floorHour = (ts: number) => new Date(ts).setMinutes(0, 0, 0);
const ceilHour = (ts: number) => (floorHour(ts) === ts ? ts : floorHour(ts) + HOUR);

export function buildTimeline(input: { date: string; bins: BinRecord[]; territories: TerritoryRecord[]; nudges: NudgeRecord[] }): TimelineModel {
  const dayFrom = dayStart(input.date);
  const dayTo = dayEnd(input.date);
  const lookup = lookupTerritories(input.territories);
  const allSlots = toSlots(input.bins, lookup);
  const slots = allSlots.filter((s) => s.start >= dayFrom && s.start < dayTo);
  const nudges = input.nudges.filter((n) => n.ts >= dayFrom && n.ts < dayTo);

  if (slots.length === 0) {
    const from = dayFrom + 8 * HOUR;
    return { from, to: from + 10 * HOUR, lanes: [], segments: [], velocity: [], maxVelocity: 0, blocks: [], nudges: nudges.map((n) => ({ ts: n.ts, step: n.step, response: n.response })), hasData: false };
  }

  // Lanes: one per territory seen today (biggest first within label order), the tail merged.
  const secondsBy = new Map<string, number>();
  for (const s of slots) secondsBy.set(s.territoryId ?? '', (secondsBy.get(s.territoryId ?? '') ?? 0) + s.sec);
  const keys = [...secondsBy.keys()];
  const labelOf = (k: string): Label | 'other' => (k ? (lookup.get(k)?.label ?? 'other') : 'other');
  keys.sort((a, b) => LABEL_ORDER[labelOf(a)] - LABEL_ORDER[labelOf(b)] || secondsBy.get(b)! - secondsBy.get(a)!);
  const shown = keys.length > MAX_LANES ? keys.slice(0, MAX_LANES - 1) : keys;
  const lanes: Lane[] = shown.map((k) => ({ key: k, name: k ? (lookup.get(k)?.name ?? 'Unnamed') : 'Unassigned', label: labelOf(k), seconds: secondsBy.get(k)! }));
  const hidden = keys.slice(shown.length);
  if (hidden.length) lanes.push({ key: '*other*', name: `${hidden.length} smaller territories`, label: 'other', seconds: hidden.reduce((m, k) => m + secondsBy.get(k)!, 0) });
  const laneOf = new Map<string, number>();
  shown.forEach((k, i) => laneOf.set(k, i));
  hidden.forEach((k) => laneOf.set(k, lanes.length - 1));

  const segments: Segment[] = [];
  const openByLane = new Map<number, Segment>();
  for (const s of slots) {
    const lane = laneOf.get(s.territoryId ?? '')!;
    const open = openByLane.get(lane);
    if (open && s.start - open.endTs <= MERGE_GAP_MS) open.endTs = s.start + BIN_MS;
    else {
      const seg = { lane, startTs: s.start, endTs: s.start + BIN_MS };
      segments.push(seg);
      openByLane.set(lane, seg);
    }
  }

  // Velocity: mean items per minute over each 5-minute bucket of browsing bins.
  const bucketSums = new Map<number, { sum: number; n: number }>();
  const bins = input.bins.filter((b) => !b.away && b.active_s > 0 && b.binStart >= dayFrom && b.binStart < dayTo);
  for (const b of bins) {
    const key = Math.floor(b.binStart / VELOCITY_BUCKET_MS) * VELOCITY_BUCKET_MS;
    const acc = bucketSums.get(key) ?? { sum: 0, n: 0 };
    acc.sum += b.items_per_min;
    acc.n++;
    bucketSums.set(key, acc);
  }
  const velocity = [...bucketSums.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, v]) => ({ ts: ts + VELOCITY_BUCKET_MS / 2, itemsPerMin: Math.round((v.sum / v.n) * 10) / 10 }));

  const first = slots[0]!.start;
  const last = slots[slots.length - 1]!.start + BIN_MS;
  const from = Math.max(dayFrom, floorHour(first));
  const to = Math.min(dayTo, Math.max(ceilHour(last), from + 2 * HOUR));

  return {
    from,
    to,
    lanes,
    segments,
    velocity,
    maxVelocity: velocity.reduce((m, v) => Math.max(m, v.itemsPerMin), 0),
    blocks: detectDeepBlocks(allSlots)
      .filter((b) => b.startTs >= dayFrom && b.startTs < dayTo)
      .map((b) => ({ startTs: b.startTs, endTs: b.endTs, minutes: Math.round(b.seconds / 60) })),
    nudges: nudges.map((n) => ({ ts: n.ts, step: n.step, response: n.response })),
    hasData: true,
  };
}
