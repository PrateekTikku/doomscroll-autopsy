import personaFile from '@shared/personas.json';
import type { Persona, PersonaSite, PersonaSet } from '@shared/types';
import type { Label } from '@/lib/db';
import { createRng } from '@/lib/ml/kmeans';
import type { PipelineEvent } from '@/lib/observer/types';

/**
 * Synthetic-day generator (PDD 7.7, D-35): plausible days for the Deep Worker personas in
 * `shared/personas.json`, as the same compact `PipelineEvent`s the dev-mode recorder writes, so a
 * synthetic day goes through the real pipeline exactly like a recording. Seeded, so every run with
 * the same seed gives the same day.
 *
 * A day is planned as segments (site + minutes): deep blocks split across the persona's deep sites,
 * shallow breaks, one spiral per trigger (after a deep block or a shallow break, inside the
 * trigger's hours), an away stretch around lunch, and an evening spiral for triggers late in the day.
 */
export const personas = (personaFile as unknown as PersonaSet).personas as Persona[];

export interface Segment {
  label: Label;
  site: PersonaSite;
  startTs: number;
  endTs: number;
  /** True for a segment planted by a spiral trigger. */
  spiral: boolean;
}

/** Maps pages to a territory. The longest matching `pathPrefix` of the same origin wins. */
export interface Route {
  origin: string;
  pathPrefix: string;
  territoryId: string;
}

export interface ReplayTerritory {
  id: string;
  name: string;
  label: Label;
  allowanceMin: number | null;
}

export interface SyntheticDay {
  date: string;
  persona: string;
  events: PipelineEvent[];
  segments: Segment[];
  territories: ReplayTerritory[];
  routes: Route[];
  /** Local timestamps of the away stretch, if any. */
  awayFrom: number | null;
  awayTo: number | null;
}

const TAB_ID_BASE = 100;
const WINDOW = 1;
const HEARTBEAT_MS = 15_000;
const SCROLL_MS = 5_000;
/** Mean scroll speed per item per minute: roughly one screen (≈ 800 px) per item. */
const PX_PER_S_PER_IPM = 13;

type Rng = () => number;
const range = (rng: Rng, [a, b]: [number, number]) => a + rng() * (b - a);
const int = (rng: Rng, [a, b]: [number, number]) => Math.round(range(rng, [a, b]));
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const at = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0).getTime();
};

export const territoryIdOf = (site: Pick<PersonaSite, 'origin' | 'pathPrefix'>) => `syn:${site.origin}${site.pathPrefix}`;
const hostOf = (origin: string) => origin.replace(/^https?:\/\/(www\.)?/, '');
const nameOf = (site: Pick<PersonaSite, 'origin' | 'pathPrefix'>) => `${hostOf(site.origin)} · ${site.pathPrefix.split('/').filter(Boolean)[0] ?? 'home'}`;

/** Territory table (one per persona site) with labels the "owner" has confirmed. */
export function personaTerritories(p: Persona, drainAllowanceMin = 15): { territories: ReplayTerritory[]; routes: Route[] } {
  const territories: ReplayTerritory[] = [];
  const routes: Route[] = [];
  for (const label of ['deep', 'shallow', 'drain'] as const) {
    for (const site of p.sites[label]) {
      territories.push({ id: territoryIdOf(site), name: nameOf(site), label, allowanceMin: label === 'drain' ? drainAllowanceMin : null });
      routes.push({ origin: site.origin, pathPrefix: site.pathPrefix, territoryId: territoryIdOf(site) });
    }
  }
  return { territories, routes };
}

/** Longest-prefix route lookup for a page. Null when no route covers it. */
export function resolveRoute(routes: Route[], origin: string, path: string): string | null {
  let best: Route | null = null;
  for (const r of routes) {
    if (r.origin !== origin) continue;
    const prefix = r.pathPrefix.replace(/\/$/, '');
    if (path === r.pathPrefix || path === prefix || path.startsWith(prefix + '/')) {
      if (!best || r.pathPrefix.length > best.pathPrefix.length) best = r;
    }
  }
  return best?.territoryId ?? null;
}

// ---- Planning ----

const siteFor = (p: Persona, label: Label, origin: string, prefix: string): PersonaSite =>
  p.sites[label].find((s) => s.origin === origin && s.pathPrefix === prefix) ??
  p.sites.drain.find((s) => s.origin === origin) ??
  p.sites[label][0];

export function planDay(p: Persona, date: Date, rng: Rng): Segment[] {
  const segs: Segment[] = [];
  let t = at(date, p.workHours.start);
  const end = at(date, p.workHours.end);
  const push = (label: Label, site: PersonaSite, minutes: number, spiral = false) => {
    const ms = Math.max(60_000, Math.round(minutes * 60_000));
    segs.push({ label, site, startTs: t, endTs: t + ms, spiral });
    t += ms;
  };
  const fired = new Set<number>();
  const fire = (afterLabel: 'deep' | 'shallow', force = false) => {
    p.spiralTriggers.forEach((tr, i) => {
      if (fired.has(i) || tr.afterLabel !== afterLabel) return;
      const hour = new Date(t).getHours();
      const inHours = tr.hours.includes(hour) || (tr.hours.length >= 2 && hour >= tr.hours[0]! && hour <= tr.hours[tr.hours.length - 1]!);
      if (!inHours && !force) return;
      if (!force && rng() > 0.85) return;
      fired.add(i);
      push('drain', siteFor(p, 'drain', tr.toOrigin, tr.toPathPrefix), range(rng, tr.spiralMinutes), true);
    });
  };

  let deepLeft = Math.max(1, int(rng, p.dayShape.deepBlocks));
  while (t < end - 20 * 60_000) {
    if (deepLeft > 0) {
      let block = Math.min(int(rng, p.dayShape.deepBlockMinutes), (end - t) / 60_000);
      while (block >= 8) {
        const part = Math.min(block, 12 + rng() * 38);
        push('deep', pick(rng, p.sites.deep), part);
        block -= part;
      }
      deepLeft--;
      fire('deep');
    }
    push('shallow', pick(rng, p.sites.shallow), 3 + rng() * 9);
    fire('shallow');
  }
  // Triggers that happen late in the day (after work hours), and at least one spiral per day.
  p.spiralTriggers.forEach((tr, i) => {
    if (fired.has(i) || Math.min(...tr.hours) < new Date(end).getHours()) return;
    t = Math.max(t, at(date, `${String(Math.min(...tr.hours)).padStart(2, '0')}:00`));
    push(tr.afterLabel, pick(rng, p.sites[tr.afterLabel]), 4 + rng() * 5);
    fired.add(i);
    push('drain', siteFor(p, 'drain', tr.toOrigin, tr.toPathPrefix), range(rng, tr.spiralMinutes), true);
  });
  if (!segs.some((s) => s.spiral)) {
    const tr = p.spiralTriggers[0];
    push('drain', siteFor(p, 'drain', tr.toOrigin, tr.toPathPrefix), range(rng, tr.spiralMinutes), true);
  }
  return segs;
}

// ---- Events ----

const idOf = (rng: Rng) => Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0');
function tabIdOf(origin: string): number {
  let h = 0;
  for (const c of origin) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAB_ID_BASE + (h % 50);
}

/** Events for one segment: heartbeats, scrolling and items at the site's velocity. */
export function segmentEvents(seg: Pick<Segment, 'site' | 'startTs' | 'endTs'>, rng: Rng, opts: { first?: boolean } = {}): PipelineEvent[] {
  const { site, startTs, endTs } = seg;
  const tabId = tabIdOf(site.origin);
  const out: PipelineEvent[] = [{ type: 'tab-activated', ts: startTs, tabId, windowId: WINDOW }];
  if (opts.first) out.push({ type: 'window-focus', ts: startTs, windowId: WINDOW }, { type: 'idle-state', ts: startTs, state: 'active' });
  out.push({ type: 'visibility', ts: startTs, tabId, visible: true });
  const prefix = site.pathPrefix.replace(/\/$/, '');
  for (let ts = startTs; ts < endTs; ts += HEARTBEAT_MS) out.push({ type: 'heartbeat', ts, tabId, origin: site.origin, path: site.pathPrefix });

  let ipm = range(rng, site.velocity.itemsPerMin);
  let skip = range(rng, site.velocity.skipRate);
  let nextRedraw = startTs + 120_000;
  let ts = startTs + 1000;
  let prevDwell = 0;
  while (ts < endTs) {
    if (ts >= nextRedraw) {
      ipm = range(rng, site.velocity.itemsPerMin);
      skip = range(rng, site.velocity.skipRate);
      nextRedraw += 120_000;
    }
    const key = idOf(rng);
    const path = `${prefix}/${key}`;
    const title = pick(rng, site.sampleTitles);
    out.push({ type: 'item', ts, tabId, origin: site.origin, path, title, itemKey: `u:${path}`, isVisual: site.isVisual, prevDwellMs: prevDwell });
    if (site.isVisual) {
      const skipped = rng() < skip;
      out.push({ type: 'video', ts: ts + 100, tabId, itemKey: `u:${path}`, event: 'play', currentTime: 0, duration: 30 });
      if (skipped) out.push({ type: 'video', ts: ts + 1000, tabId, itemKey: `u:${path}`, event: 'skip', currentTime: 1, duration: 30 });
    }
    const dt = (60_000 / Math.max(0.05, ipm)) * (0.6 + rng() * 0.8);
    prevDwell = Math.round(dt);
    ts += dt;
  }
  for (let s = startTs + SCROLL_MS; s < endTs; s += SCROLL_MS) {
    out.push({ type: 'scroll', ts: s, tabId, pxPerS: Math.max(0, Math.round(ipm * PX_PER_S_PER_IPM * (0.5 + rng()))) });
  }
  return out;
}

export function sortEvents(events: PipelineEvent[]): PipelineEvent[] {
  return events.map((e, i) => [e, i] as const).sort((a, b) => a[0].ts - b[0].ts || a[1] - b[1]).map(([e]) => e);
}

export function syntheticDay(persona: Persona | string, date: Date, seed = 1): SyntheticDay {
  const p = typeof persona === 'string' ? personas.find((x) => x.id === persona) : persona;
  if (!p) throw new Error(`Unknown persona "${persona}"`);
  const rng = createRng(seed * 1009 + Math.floor(date.getTime() / 86_400_000));
  const segments = planDay(p, date, rng);

  // An away stretch (browser not focused) of ~25 min around lunch, between two segments.
  const noon = at(date, '12:30');
  const gapAfter = segments.findIndex((s) => s.endTs >= noon && s.endTs < noon + 90 * 60_000);
  let awayFrom: number | null = null;
  let awayTo: number | null = null;
  if (gapAfter >= 0 && gapAfter < segments.length - 1) {
    awayFrom = segments[gapAfter]!.endTs;
    awayTo = awayFrom + Math.round(range(rng, [20, 30])) * 60_000;
    for (let i = gapAfter + 1; i < segments.length; i++) {
      segments[i] = { ...segments[i]!, startTs: segments[i]!.startTs + (awayTo - awayFrom), endTs: segments[i]!.endTs + (awayTo - awayFrom) };
    }
  }

  const events: PipelineEvent[] = [];
  segments.forEach((seg, i) => events.push(...segmentEvents(seg, rng, { first: i === 0 })));
  if (awayFrom != null && awayTo != null) {
    events.push({ type: 'window-focus', ts: awayFrom, windowId: null }, { type: 'window-focus', ts: awayTo, windowId: WINDOW });
  }
  const last = segments[segments.length - 1]!;
  events.push({ type: 'tick', ts: last.endTs + 31_000 });
  const { territories, routes } = personaTerritories(p);
  const d = new Date(date);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    persona: p.id,
    events: sortEvents(events),
    segments,
    territories,
    routes,
    awayFrom,
    awayTo,
  };
}
