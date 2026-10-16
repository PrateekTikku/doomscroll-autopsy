import type { PersonaSite } from '@shared/types';
import { createRng } from '@/lib/ml/kmeans';
import type { PipelineEvent } from '@/lib/observer/types';
import type { ReplayEngine } from './replayer';
import { personaTerritories, segmentEvents, sortEvents, type ReplayTerritory, type Route, type Segment, personas } from './synthetic';

/**
 * Demo mode (PDD 7.7): a prepared day in which a spiral is caught on cue, for the video and for
 * showing the product without waiting for real data. It is a replay: nothing it does touches the
 * owner's stored data, and every nudge it shows carries a visible "Replay" pill.
 *
 * Script (virtual minutes from the start): 0–38 deep reading in the docs, 38–42 a Slack break,
 * 42–80 a YouTube Shorts spiral. With the default 15-minute allowance the banner is due when the
 * allowance is used up (≈ 57), and, left ignored, the blur one cooldown later (≈ 72).
 */
export const DEMO_SPEED_DEFAULT = 60;
export const DEMO_EXPECTED = { bannerAtMin: 57, blurAtMin: 72, toleranceMin: 2, lengthMin: 80 } as const;

const dev = personas.find((p) => p.id === 'developer')!;
const site = (label: 'deep' | 'shallow' | 'drain', origin: string): PersonaSite => dev.sites[label].find((s) => s.origin === origin)!;

export interface DemoDay {
  startTs: number;
  endTs: number;
  events: PipelineEvent[];
  segments: Segment[];
  territories: ReplayTerritory[];
  routes: Route[];
}

export function demoDay(startTs: number, seed = 42): DemoDay {
  const rng = createRng(seed);
  const plan: Array<[Segment['label'], PersonaSite, number]> = [
    ['deep', site('deep', 'https://developer.mozilla.org'), 38],
    ['shallow', site('shallow', 'https://app.slack.com'), 4],
    ['drain', { ...site('drain', 'https://www.youtube.com'), velocity: { itemsPerMin: [6, 9], skipRate: [0.3, 0.45], meanDwellS: [6, 10] } }, 38],
  ];
  const segments: Segment[] = [];
  let t = startTs;
  for (const [label, s, minutes] of plan) {
    segments.push({ label, site: s, startTs: t, endTs: t + minutes * 60_000, spiral: label === 'drain' });
    t += minutes * 60_000;
  }
  const events: PipelineEvent[] = [];
  segments.forEach((seg, i) => events.push(...segmentEvents(seg, rng, { first: i === 0 })));
  events.push({ type: 'tick', ts: t + 31_000 });
  const { territories, routes } = personaTerritories(dev);
  return { startTs, endTs: t, events: sortEvents(events), segments, territories, routes };
}

/** Plays events into an engine against a virtual clock. The caller advances it (a timer in the UI, a loop in tests). */
export function createPlayer(events: PipelineEvent[], engine: Pick<ReplayEngine, 'feed'>) {
  let i = 0;
  return {
    /** Feeds every event up to `virtualTs`. Returns how many were fed. */
    advanceTo(virtualTs: number): number {
      let n = 0;
      while (i < events.length && events[i]!.ts <= virtualTs) {
        engine.feed(events[i++]!);
        n++;
      }
      return n;
    },
    get finished() {
      return i >= events.length;
    },
    get progress() {
      return events.length ? i / events.length : 1;
    },
  };
}
