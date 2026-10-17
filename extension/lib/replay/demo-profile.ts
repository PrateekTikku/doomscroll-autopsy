import type { Persona, PersonaSite, PersonaSites, SpiralTrigger } from '@shared/types';
import type { BinRecord, Label, NudgeRecord, NudgeResponse, SampleRecord } from '@/lib/db';
import { createRng } from '@/lib/ml/kmeans';
import type { PipelineEvent } from '@/lib/observer/types';
import { createReplayEngine } from './replayer';
import { planDay, segmentEvents, sortEvents, type ReplayTerritory, type Route, type Segment } from './synthetic';
import sites from '../../scripts/demo/sites.json';

/**
 * Demo profile builder: turns a reduced browsing history (per day: time, host and a generic section of
 * each visit to a whitelisted site; see `scripts/demo/extract-history.mjs`) into a believable browser
 * history in the extension's own record shapes. History only says *when* a page was opened, so the
 * signals it lacks (scroll speed, items per minute, skips, dwell) are rebuilt from per-kind behaviour
 * profiles, and visits to feeds are expanded into scrolling sessions. Everything then goes through the
 * real observer pipeline, the real scoring and the real nudge policy, like a recording would.
 * Output records carry no titles and no text.
 */
type Range = [number, number];

export interface HistoryVisit {
  ts: number;
  host: string;
  seg: string;
  durMs: number;
}
export type HistoryDays = Record<string, HistoryVisit[]>;

interface Profile {
  items: Range;
  skip: Range;
  visual: boolean;
  minutes: Range;
  /** Feeds absorb later visits during their session; work pages end when the next visit starts. */
  absorbs: boolean;
  prefix: string;
  content: string;
}

const KIND: Record<string, Profile> = {
  code: { items: [0.8, 2], skip: [0, 0.02], visual: false, minutes: [4, 14], absorbs: false, prefix: '/pulls', content: 'build' },
  docs: { items: [0.8, 2.2], skip: [0, 0.02], visual: false, minutes: [3, 10], absorbs: false, prefix: '/docs', content: 'build' },
  read: { items: [0.5, 1.2], skip: [0, 0.02], visual: false, minutes: [3, 9], absorbs: false, prefix: '/blog', content: 'learn' },
  write: { items: [0.3, 1], skip: [0, 0.01], visual: false, minutes: [8, 25], absorbs: false, prefix: '/new', content: 'writing' },
  course: { items: [0.1, 0.4], skip: [0, 0.05], visual: true, minutes: [10, 35], absorbs: false, prefix: '/learn', content: 'learn' },
  assistant: { items: [0.5, 1.5], skip: [0, 0.01], visual: false, minutes: [5, 18], absorbs: false, prefix: '/chat', content: 'assistant' },
  search: { items: [0.6, 1.5], skip: [0, 0.02], visual: false, minutes: [1, 3], absorbs: false, prefix: '/search', content: 'web' },
  meeting: { items: [0.1, 0.3], skip: [0, 0], visual: false, minutes: [15, 45], absorbs: false, prefix: '/meetings', content: 'comms' },
  admin: { items: [0.8, 2], skip: [0, 0.02], visual: false, minutes: [2, 6], absorbs: false, prefix: '/home', content: 'web' },
  social: { items: [1, 2.5], skip: [0, 0.05], visual: false, minutes: [2, 7], absorbs: false, prefix: '/feed', content: 'comms' },
  chat: { items: [0.6, 1.5], skip: [0, 0.02], visual: false, minutes: [2, 8], absorbs: false, prefix: '/chat', content: 'comms' },
  reels: { items: [6, 10], skip: [0.35, 0.6], visual: true, minutes: [8, 28], absorbs: true, prefix: '/reels', content: 'feed' },
  stream: { items: [0.05, 0.15], skip: [0, 0.01], visual: true, minutes: [25, 80], absorbs: true, prefix: '/browse', content: 'stream' },
  threads: { items: [2.5, 5], skip: [0, 0.05], visual: false, minutes: [6, 22], absorbs: true, prefix: '/r', content: 'threads' },
  'yt-shorts': { items: [6, 10], skip: [0.35, 0.6], visual: true, minutes: [8, 30], absorbs: true, prefix: '/shorts', content: 'feed' },
  'yt-home': { items: [3, 6], skip: [0.2, 0.4], visual: true, minutes: [6, 22], absorbs: true, prefix: '', content: 'feed' },
  'yt-learn': { items: [0.1, 0.3], skip: [0, 0.02], visual: true, minutes: [15, 45], absorbs: false, prefix: '/watch', content: 'learn' },
  'yt-fun': { items: [0.15, 0.4], skip: [0, 0.05], visual: true, minutes: [6, 25], absorbs: true, prefix: '/watch', content: 'feed' },
};

type SiteInfo = { label: 'deep' | 'shallow' | 'drain' | 'mixed'; kind: string };
const SITE = sites as Record<string, SiteInfo>;

const range = (rng: () => number, [a, b]: Range) => a + rng() * (b - a);
const dateKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Behaviour profile for one visit. YouTube is the interesting one: /shorts and home are a feed, /watch is half learning, half entertainment. */
export function profileFor(v: Pick<HistoryVisit, 'host' | 'seg'>, rng: () => number): { profile: Profile; label: Label; kindKey: string } | null {
  const info = SITE[v.host];
  if (!info) return null;
  let kindKey = info.kind;
  let label: Label = info.label === 'mixed' ? 'drain' : info.label;
  if (info.kind === 'youtube') {
    if (v.seg === 'shorts') kindKey = 'yt-shorts';
    else if (v.seg === 'watch') {
      const learn = rng() < 0.5;
      kindKey = learn ? 'yt-learn' : 'yt-fun';
      label = learn ? 'deep' : 'shallow';
    } else kindKey = 'yt-home';
  }
  const profile = KIND[kindKey];
  return profile ? { profile, label, kindKey } : null;
}

export interface DemoSegment {
  startTs: number;
  endTs: number;
  host: string;
  /** Territory id used by the replay while it scores and nudges (the real clustering replaces it later). */
  routeId: string;
  label: Label;
  content: string;
  site: PersonaSite;
}

const routeIdOf = (host: string, prefix: string) => `demo:https://${host}${prefix || '/'}`;
const hostOfOrigin = (origin: string) => origin.replace(/^https?:\/\//, '');

// ---- A Deep Worker built from the owner's own history ----

interface Weighted {
  host: string;
  weight: number;
}
export interface HostWeights {
  deep: Weighted[];
  shallow: Weighted[];
  drain: Weighted[];
}

/** How often each whitelisted host was visited overall, by role. YouTube counts as Drain (feed) and Deep (talks) alike. */
export function hostWeights(days: HistoryDays): HostWeights {
  const count = new Map<string, number>();
  for (const list of Object.values(days)) for (const v of list) count.set(v.host, (count.get(v.host) ?? 0) + 1);
  const by = (label: SiteInfo['label']): Weighted[] =>
    [...count.entries()]
      .filter(([h]) => SITE[h]?.label === label)
      .map(([host, weight]) => ({ host, weight }))
      .sort((a, b) => b.weight - a.weight);
  const yt = count.get('www.youtube.com') ?? 0;
  const drain = by('drain');
  if (yt) drain.push({ host: 'www.youtube.com', weight: yt });
  const deep = by('deep').slice(0, 12);
  if (yt) deep.push({ host: 'www.youtube.com', weight: Math.max(2, Math.round(yt / 4)) });
  return { deep, shallow: by('shallow').slice(0, 6), drain: drain.sort((a, b) => b.weight - a.weight) };
}

const pickWeighted = <T extends Weighted>(rng: () => number, xs: T[]): T => {
  const total = xs.reduce((a, x) => a + x.weight, 0);
  let r = rng() * total;
  for (const x of xs) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return xs[xs.length - 1]!;
};

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface SiteSpec {
  site: PersonaSite;
  content: string;
  label: Label;
}

/** The persona site for a host in a role: its profile gives the velocity, section and what the pages are about. */
export function siteSpec(host: string, role: Label): SiteSpec | null {
  const info = SITE[host];
  if (!info) return null;
  let kind = info.kind;
  if (kind === 'youtube') kind = role === 'drain' ? 'yt-shorts' : 'yt-learn';
  const pf = KIND[kind];
  if (!pf) return null;
  return {
    label: role,
    content: pf.content,
    site: { origin: `https://${host}`, pathPrefix: pf.prefix || '/', sampleTitles: ['page'], isVisual: pf.visual, velocity: { itemsPerMin: pf.items, skipRate: pf.skip, meanDwellS: [3, 40] } },
  };
}

/** One day's persona: the visits of the matching real day set the hours, how busy it is and where the spirals start. */
export function personaForDay(visits: HistoryVisit[], date: Date, weights: HostWeights, rng: () => number): { persona: Persona; content: Map<string, string> } {
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const n = visits.length;
  const mins = visits.map((v) => new Date(v.ts).getHours() * 60 + new Date(v.ts).getMinutes()).sort((a, b) => a - b);
  const startMin = Math.min(Math.max(8 * 60 + 30, Math.floor((mins[0] ?? 9 * 60 + 30) / 30) * 30), 11 * 60);
  const heavy = n >= 40;
  const normal = n >= 15 && n < 40;
  const minHours = heavy ? 9 : normal ? 7 : 5;
  const endMin = Math.min(23 * 60, Math.max(startMin + minHours * 60 - (weekend ? 60 : 0), (mins[mins.length - 1] ?? 0) + 45));
  const blocks: [number, number] = heavy ? [3, 4] : normal ? [2, 3] : [1, 2];
  const blockMin: [number, number] = heavy ? [30, 80] : normal ? [25, 65] : [25, 40];

  const content = new Map<string, string>();
  const make = (host: string, role: Label): PersonaSite | null => {
    const spec = siteSpec(host, role);
    if (!spec) return null;
    content.set(`${spec.site.origin}${spec.site.pathPrefix}`, spec.content);
    return spec.site;
  };
  const sites = (list: Weighted[], role: Label, k: number): PersonaSite[] => {
    const out: PersonaSite[] = [];
    const used = new Set<string>();
    for (let i = 0; i < k * 3 && out.length < k && list.length; i++) {
      const w = pickWeighted(rng, list.map((x) => ({ ...x, weight: Math.sqrt(x.weight) })));
      const site = make(w.host, role);
      if (site && !used.has(site.origin + site.pathPrefix)) {
        used.add(site.origin + site.pathPrefix);
        out.push(site);
      }
    }
    return out;
  };
  const deep = sites(weights.deep, 'deep', 5);
  const shallow = sites(weights.shallow, 'shallow', 3);
  // Feeds seen that day first; otherwise the owner's usual ones.
  const dayDrainHosts = [...new Set(visits.filter((v) => SITE[v.host]?.label === 'drain' || (SITE[v.host]?.kind === 'youtube' && v.seg !== 'watch')).map((v) => v.host))];
  const drainPool = weights.drain.map((w) => ({ ...w, weight: w.weight * (dayDrainHosts.includes(w.host) ? 6 : 1) }));
  const drain = sites(drainPool, 'drain', 3);
  if (!deep.length) deep.push(make('github.com', 'deep')!);
  if (!shallow.length) shallow.push(make('www.google.com', 'shallow')!);
  if (!drain.length) drain.push(make('www.instagram.com', 'drain')!);

  const drainHours = [...new Set(visits.filter((v) => dayDrainHosts.includes(v.host)).map((v) => new Date(v.ts).getHours()))].sort((a, b) => a - b);
  const lateHour = weekend ? 15 : 21;
  const triggerHours = (drainHours.length ? drainHours.slice(0, 3) : [lateHour, lateHour + 1]) as [number, ...number[]];
  const tr = (afterLabel: 'deep' | 'shallow', d: PersonaSite, hours: [number, ...number[]]): SpiralTrigger => ({
    afterLabel,
    toOrigin: d.origin,
    toPathPrefix: d.pathPrefix,
    hours,
    spiralMinutes: [10, 38],
    note: 'derived from the day\'s feed visits',
  });
  const persona: Persona = {
    id: 'demo',
    name: 'Deep Worker',
    description: 'A developer and writer who studies machine learning, builds, and sometimes slips into feeds.',
    workHours: { start: clock(startMin), end: clock(endMin) },
    sites: { deep: deep as PersonaSites['deep'], shallow: shallow as PersonaSites['shallow'], drain: drain as PersonaSites['drain'] },
    dayShape: { browserHours: [5, 10], deepBlocks: blocks, deepBlockMinutes: blockMin, drainMinutes: [20, 70], peakDrainHours: [13, 16, 21, 22] },
    spiralTriggers: [tr('deep', drain[0]!, triggerHours), tr('shallow', drain[drain.length - 1]!, [12, 13, 14, 15])],
  };
  return { persona, content };
}

/** An away stretch around lunch: later segments shift by its length (browser not focused, so nothing is observed). */
export function withLunch(segs: Segment[], date: Date, rng: () => number): Segment[] {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 13, 0).getTime();
  const idx = segs.findIndex((s) => s.endTs >= noon - 30 * 60_000 && s.endTs < noon + 75 * 60_000);
  if (idx < 0 || idx >= segs.length - 1) return segs;
  const gap = Math.round(range(rng, [22, 42])) * 60_000;
  return segs.map((s, i) => (i > idx ? { ...s, startTs: s.startTs + gap, endTs: s.endTs + gap } : s));
}

/** Territory table and routes for the replay: one per host and section. */
export function demoTerritories(segs: DemoSegment[]): { territories: ReplayTerritory[]; routes: Route[] } {
  const seen = new Map<string, ReplayTerritory>();
  const routes: Route[] = [];
  for (const s of segs) {
    if (seen.has(s.routeId)) continue;
    const section = s.site.pathPrefix === '/' ? 'home' : s.site.pathPrefix.slice(1);
    seen.set(s.routeId, { id: s.routeId, name: `${s.host.replace(/^www\./, '')} · ${section}`, label: s.label, allowanceMin: s.label === 'drain' ? 15 : null });
    routes.push({ origin: s.site.origin, pathPrefix: s.site.pathPrefix, territoryId: s.routeId });
  }
  return { territories: [...seen.values()], routes };
}

export interface DemoSeed {
  generatedAt: number;
  window: { from: string; to: string; days: number };
  bins: BinRecord[];
  /** Items, without vectors: `content` picks the phrase pool to embed from. `routeLabel` is the replay's label for it. */
  samples: Array<Omit<SampleRecord, 'id' | 'vector' | 'title'> & { content: string; routeLabel: Label }>;
  nudges: NudgeRecord[];
  perDay: Array<{ date: string; source: string; segments: number; drainMin: number; deepMin: number }>;
}

export interface BuildOptions {
  days: HistoryDays;
  /** Calendar day that counts as "today"; activity after `now` is not generated. */
  now: Date;
  windowDays?: number;
  seed?: number;
  /** Source day that becomes "yesterday" (the most recent complete real day). */
  anchorSource: string;
}

/** Picks a source day for each target day: the real day at the same offset from the anchor when there is one, else a similar weekday. */
export function chooseSources(days: HistoryDays, target: Date[], anchorSource: string, rng: () => number, minVisits = 15): Array<{ source: string; real: boolean }> {
  const anchor = new Date(`${anchorSource}T12:00:00`);
  const rich = Object.keys(days).filter((k) => days[k]!.length >= minVisits).sort();
  const keys = rich.length ? rich : Object.keys(days).sort();
  const yesterday = new Date(target[target.length - 2]!.getTime());
  const out: Array<{ source: string; real: boolean }> = [];
  for (const t of target) {
    const offsetDays = Math.round((startOfDay(t) - startOfDay(yesterday)) / 86_400_000);
    const sourceDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offsetDays);
    const sk = dateKeyOf(sourceDate);
    if (offsetDays <= 0 && days[sk] && days[sk]!.length >= 3) {
      out.push({ source: sk, real: true });
      continue;
    }
    const sameWeekday = keys.filter((k) => new Date(`${k}T12:00:00`).getDay() === t.getDay() && k !== anchorSource);
    const pool = sameWeekday.length ? sameWeekday : keys;
    out.push({ source: pool[Math.floor(rng() * pool.length)]!, real: false });
  }
  return out;
}

export function buildDemoSeed(opts: BuildOptions): DemoSeed {
  const windowDays = opts.windowDays ?? 14;
  const rng = createRng(opts.seed ?? 7);
  const today = new Date(opts.now.getFullYear(), opts.now.getMonth(), opts.now.getDate());
  const targets = Array.from({ length: windowDays }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (windowDays - 1 - i)));
  const sources = chooseSources(opts.days, targets, opts.anchorSource, rng);

  const weights = hostWeights(opts.days);
  const all: DemoSegment[] = [];
  const perDay: DemoSeed['perDay'] = [];
  targets.forEach((target, i) => {
    const isToday = i === targets.length - 1;
    const src = sources[i]!;
    const cutoff = isToday ? opts.now.getTime() : Infinity;
    const { persona, content } = personaForDay(opts.days[src.source]!, target, weights, rng);
    const planned = withLunch(planDay(persona, target, rng), target, rng).filter((s) => s.startTs < cutoff);
    const segs: DemoSegment[] = planned.map((s) => ({
      startTs: s.startTs,
      endTs: Math.min(s.endTs, cutoff),
      host: hostOfOrigin(s.site.origin),
      routeId: routeIdOf(hostOfOrigin(s.site.origin), s.site.pathPrefix === '/' ? '' : s.site.pathPrefix),
      label: s.label,
      content: content.get(`${s.site.origin}${s.site.pathPrefix}`) ?? 'web',
      site: s.site,
    }));
    all.push(...segs.filter((s) => s.endTs - s.startTs >= 60_000));
    const min = (l: Label) => Math.round(segs.filter((s) => s.label === l).reduce((a, s) => a + (s.endTs - s.startTs), 0) / 60_000);
    perDay.push({ date: dateKeyOf(target), source: src.real ? src.source : `${src.source} (template)`, segments: segs.length, drainMin: min('drain'), deepMin: min('deep') });
  });

  const { territories, routes } = demoTerritories(all);
  const events: PipelineEvent[] = [];
  const evRng = createRng((opts.seed ?? 7) * 31 + 5);
  const byDay = new Map<string, DemoSegment[]>();
  for (const s of all) (byDay.get(dateKeyOf(new Date(s.startTs))) ?? byDay.set(dateKeyOf(new Date(s.startTs)), []).get(dateKeyOf(new Date(s.startTs)))!).push(s);
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startTs - b.startTs);
    list.forEach((s, i) => events.push(...segmentEvents(s, evRng, { first: i === 0 })));
    const last = list[list.length - 1]!;
    events.push({ type: 'tick', ts: last.endTs + 31_000 });
  }

  const respRng = createRng((opts.seed ?? 7) * 17 + 3);
  const respond = (): NudgeResponse => {
    const r = respRng();
    return r < 0.3 ? 'back' : r < 0.55 ? 'snooze' : 'ignored';
  };
  const engine = createReplayEngine({ territories, routes, respond });
  for (const ev of sortEvents(events)) engine.feed(ev);

  const labelOf = new Map(territories.map((t) => [t.id, t.label]));
  const sortedSegs = [...all].sort((a, b) => a.startTs - b.startTs);
  const segAt = (ts: number) => {
    let lo = 0;
    let hi = sortedSegs.length - 1;
    let best: DemoSegment | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedSegs[mid]!.startTs <= ts) {
        best = sortedSegs[mid]!;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best;
  };
  const samples: DemoSeed['samples'] = engine.samples.map((s) => {
    const seg = segAt(s.ts);
    return {
      ts: s.ts,
      tabId: s.tabId,
      origin: s.origin,
      path: s.path,
      isVisual: s.isVisual,
      dwellMs: s.dwellMs,
      territoryId: null,
      territoryDist: null,
      content: seg?.content ?? 'web',
      routeLabel: (s.territoryId && labelOf.get(s.territoryId)) || seg?.label || 'shallow',
    };
  });

  const bins = engine.bins.map((b) => ({ ...b, territoryId: null }));
  const deepAt = engine.bins.filter((b) => b.territoryId && labelOf.get(b.territoryId) === 'deep' && !b.away).map((b) => b.binStart).sort((a, b) => a - b);
  const nudges: NudgeRecord[] = engine.nudges.map((n) => {
    const back = deepAt.find((t) => t >= n.ts);
    return {
      ts: n.ts,
      step: n.step,
      score: Math.round(n.score * 100) / 100,
      mode: n.mode,
      response: n.response,
      secondsToReturn: back != null && back - n.ts <= 30 * 60_000 ? Math.round((back - n.ts) / 1000) : null,
    };
  });
  // The bins carry the nudge flags the live service sets.
  for (const n of nudges) {
    const b = bins.find((x) => x.binStart === Math.floor(n.ts / 30_000) * 30_000);
    if (b) {
      b.nudgeShown = true;
      b.nudgeResponse = n.response;
    }
  }
  return { generatedAt: opts.now.getTime(), window: { from: dateKeyOf(targets[0]!), to: dateKeyOf(today), days: windowDays }, bins, samples, nudges, perDay };
}
