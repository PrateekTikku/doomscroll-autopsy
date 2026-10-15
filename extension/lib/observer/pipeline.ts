import type { BinRecord, SampleRecord } from '@/lib/db/schema';
import type { PipelineEvent } from './types';
import { sanitizePath } from './url';

/**
 * Service-worker pipeline (PDD 7.4, 7.6): turns observer and browser events into samples and
 * 30-second bins. Deterministic and free of I/O, so the replayer (M4) can feed recorded events
 * through exactly the same code. `step` mutates `state` and returns what to persist.
 *
 * Time accounting. Each event first advances the clock from the previous event under the
 * *previous* state, classifying the elapsed time as:
 *   - active: a Chrome window is focused and its active tab's content script was heard from within
 *     the pulse window (heartbeat merging, ActivityWatch pattern), and the user isn't idle, or is
 *     idle while a video plays in that tab (D-46). Locked always counts as idle.
 *   - idle: the same, but idle or locked without a playing video.
 *   - away: no Chrome window has focus. Internal model feature only; never shown (D-45).
 *   - gap: paused, a blocked or chrome:// page, no content script, or an absence past its cap.
 *     Gaps are not counted at all.
 * Away and idle time are counted for the first 10 minutes of an absence only; consumers treat
 * missing bins as away.
 */

export const BIN_MS = 30_000;
/** Content-script events within this window merge into one span of presence. Heartbeats come every 15 s. */
export const PULSE_MS = 45_000;
export const ABSENCE_CAP_MS = 10 * 60_000;
const RECENT_ITEMS_MS = 60_000;

type Mode = 'active' | 'idle' | 'away' | 'gap';

export interface BinAcc {
  binStart: number;
  active_s: number;
  idle_s: number;
  away_s: number;
  /** ∫ scroll px/s dt over active seconds. */
  scrollIntegral: number;
  items: number;
  dwellSum: number;
  dwellN: number;
  videoKeys: string[];
  skips: number;
  tab_switches: number;
}

export interface PipelineState {
  v: 1;
  lastTs: number | null;
  paused: boolean;
  focusedWindow: number | null;
  activeTabByWindow: Record<string, number>;
  idle: 'active' | 'idle' | 'locked';
  /** When the current away/idle stretch began. */
  absenceStart: number | null;
  /** tabId → last time its content script was heard from while visible. */
  presence: Record<string, number>;
  /** tabId → a video is playing. */
  playing: Record<string, boolean>;
  /** Smoothed scroll speed of the active tab. */
  scrollPxS: number;
  /** tabId → ts of the tab's latest sample. */
  lastSampleTs: Record<string, number>;
  recentItems: number[];
  bin: BinAcc | null;
}

export type PipelineOutput =
  | { kind: 'bin'; record: BinRecord }
  | { kind: 'sample'; record: SampleRecord }
  /** Set the dwell of the tab's latest sample. */
  | { kind: 'dwell'; tabId: number; dwellMs: number };

export function initialState(): PipelineState {
  return {
    v: 1,
    lastTs: null,
    paused: false,
    focusedWindow: null,
    activeTabByWindow: {},
    idle: 'active',
    absenceStart: null,
    presence: {},
    playing: {},
    scrollPxS: 0,
    lastSampleTs: {},
    recentItems: [],
    bin: null,
  };
}

function newBin(binStart: number): BinAcc {
  return { binStart, active_s: 0, idle_s: 0, away_s: 0, scrollIntegral: 0, items: 0, dwellSum: 0, dwellN: 0, videoKeys: [], skips: 0, tab_switches: 0 };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function binToRecord(b: BinAcc): BinRecord {
  return {
    binStart: b.binStart,
    active_s: r1(b.active_s),
    idle_s: r1(b.idle_s),
    away_s: r1(b.away_s),
    scroll_px_s_mean: b.active_s > 0 ? r1(b.scrollIntegral / b.active_s) : 0,
    items_per_min: (b.items * 60_000) / BIN_MS,
    mean_dwell_ms: b.dwellN > 0 ? Math.round(b.dwellSum / b.dwellN) : 0,
    video_skip_rate: b.videoKeys.length > 0 ? Math.round(Math.min(1, b.skips / b.videoKeys.length) * 100) / 100 : 0,
    tab_switches: b.tab_switches,
    away: b.away_s > BIN_MS / 2000,
    idle: b.idle_s > BIN_MS / 2000,
    territoryId: null,
    nudgeShown: false,
    nudgeResponse: null,
  };
}

const binHasTime = (b: BinAcc) => b.active_s + b.idle_s + b.away_s > 0;

/** Make `binStart`'s bin current, emitting the previous one if it has any counted time. */
function useBin(state: PipelineState, binStart: number, out: PipelineOutput[]): BinAcc {
  if (state.bin && state.bin.binStart < binStart) {
    if (binHasTime(state.bin)) out.push({ kind: 'bin', record: binToRecord(state.bin) });
    state.bin = null;
  }
  state.bin ??= newBin(binStart);
  return state.bin;
}

const binOf = (ts: number) => Math.floor(ts / BIN_MS) * BIN_MS;

function activeTab(state: PipelineState): number | null {
  if (state.focusedWindow == null) return null;
  return state.activeTabByWindow[state.focusedWindow] ?? null;
}

/** Splits [from, to) into classified segments under the current state. */
function segments(state: PipelineState, from: number, to: number): Array<[Mode, number, number]> {
  if (state.paused) return [['gap', from, to]];
  const capped = (mode: Mode, end: number): Array<[Mode, number, number]> => {
    const capEnd = state.absenceStart == null ? end : Math.min(end, state.absenceStart + ABSENCE_CAP_MS);
    const segs: Array<[Mode, number, number]> = [];
    if (capEnd > from) segs.push([mode, from, capEnd]);
    if (end > Math.max(from, capEnd)) segs.push(['gap', Math.max(from, capEnd), end]);
    return segs;
  };
  if (state.focusedWindow == null) return capped('away', to);
  const tab = activeTab(state);
  const seen = tab == null ? undefined : state.presence[tab];
  if (seen == null || seen + PULSE_MS <= from) return [['gap', from, to]];
  const presentEnd = Math.min(to, seen + PULSE_MS);
  const videoActive = state.idle === 'idle' && tab != null && state.playing[tab] === true;
  const segs: Array<[Mode, number, number]> =
    state.idle === 'active' || videoActive ? [['active', from, presentEnd]] : capped('idle', presentEnd);
  if (to > presentEnd) segs.push(['gap', presentEnd, to]);
  return segs;
}

function addTime(state: PipelineState, mode: Mode, start: number, end: number, out: PipelineOutput[]): void {
  while (start < end) {
    const bin = useBin(state, binOf(start), out);
    const chunkEnd = Math.min(end, bin.binStart + BIN_MS);
    const secs = (chunkEnd - start) / 1000;
    if (mode === 'active') {
      bin.active_s += secs;
      bin.scrollIntegral += state.scrollPxS * secs;
    } else if (mode === 'idle') bin.idle_s += secs;
    else if (mode === 'away') bin.away_s += secs;
    start = chunkEnd;
  }
}

function advance(state: PipelineState, to: number, out: PipelineOutput[]): void {
  if (state.lastTs != null && to > state.lastTs) {
    for (const [mode, s, e] of segments(state, state.lastTs, to)) addTime(state, mode, s, e, out);
  }
  state.lastTs = Math.max(state.lastTs ?? to, to);
  useBin(state, binOf(state.lastTs), out);
}

function endAbsenceIfBack(state: PipelineState): void {
  if (state.focusedWindow != null && state.idle === 'active') state.absenceStart = null;
}

/** Applies one event. Returns the samples, dwell updates and closed bins to persist. */
export function step(state: PipelineState, ev: PipelineEvent): PipelineOutput[] {
  const out: PipelineOutput[] = [];
  const ts = Math.max(ev.ts, state.lastTs ?? ev.ts);
  advance(state, ts, out);
  const bin = state.bin!;

  switch (ev.type) {
    case 'tick':
      break;
    case 'pause':
      state.paused = ev.paused;
      state.scrollPxS = 0;
      state.presence = {};
      break;
    case 'tab-activated': {
      const key = String(ev.windowId);
      if (ev.windowId === state.focusedWindow && state.activeTabByWindow[key] !== ev.tabId) bin.tab_switches++;
      state.activeTabByWindow[key] = ev.tabId;
      if (ev.windowId === state.focusedWindow) state.scrollPxS = 0;
      break;
    }
    case 'window-focus':
      if (ev.windowId !== state.focusedWindow) {
        if (ev.windowId != null && state.focusedWindow != null) bin.tab_switches++;
        state.scrollPxS = 0;
      }
      state.focusedWindow = ev.windowId;
      if (ev.windowId == null) state.absenceStart ??= ts;
      endAbsenceIfBack(state);
      break;
    case 'idle-state':
      state.idle = ev.state;
      if (ev.state !== 'active') state.absenceStart ??= ts;
      endAbsenceIfBack(state);
      break;
    case 'tab-removed': {
      const key = String(ev.tabId);
      if (state.presence[key] != null && state.lastSampleTs[key] != null) {
        out.push({ kind: 'dwell', tabId: ev.tabId, dwellMs: Math.round(ts - state.lastSampleTs[key]) });
      }
      delete state.presence[key];
      delete state.playing[key];
      delete state.lastSampleTs[key];
      break;
    }
    default: {
      // Observer events from a content script.
      if (state.paused) break;
      const key = String(ev.tabId);
      const isActiveTab = activeTab(state) === ev.tabId;
      if (ev.type === 'visibility') {
        if (ev.visible) state.presence[key] = ts;
        else {
          if (state.presence[key] != null && state.lastSampleTs[key] != null) {
            out.push({ kind: 'dwell', tabId: ev.tabId, dwellMs: Math.round(ts - state.lastSampleTs[key]) });
          }
          delete state.presence[key];
          if (isActiveTab) state.scrollPxS = 0;
        }
        break;
      }
      state.presence[key] = ts;
      if (ev.type === 'scroll') {
        if (isActiveTab) state.scrollPxS = ev.pxPerS;
      } else if (ev.type === 'video') {
        if (!bin.videoKeys.includes(ev.itemKey)) bin.videoKeys.push(ev.itemKey);
        if (ev.event === 'skip') bin.skips++;
        state.playing[key] = ev.event === 'play';
      } else if (ev.type === 'item') {
        bin.items++;
        if (state.lastSampleTs[key] != null && ev.prevDwellMs > 0) {
          bin.dwellSum += ev.prevDwellMs;
          bin.dwellN++;
          out.push({ kind: 'dwell', tabId: ev.tabId, dwellMs: ev.prevDwellMs });
        }
        const record: SampleRecord = {
          ts,
          tabId: ev.tabId,
          origin: ev.origin,
          path: sanitizePath(ev.path),
          isVisual: ev.isVisual,
          dwellMs: 0,
          vector: null,
          territoryId: null,
          territoryDist: null,
        };
        if (ev.title) record.title = ev.title;
        out.push({ kind: 'sample', record });
        state.lastSampleTs[key] = ts;
        state.recentItems = [...state.recentItems.filter((t) => t > ts - RECENT_ITEMS_MS), ts];
      }
    }
  }
  return out;
}

/** Whether the periodic tick is still useful (it isn't while paused or past the absence cap). */
export function needsTick(state: PipelineState, now: number): boolean {
  if (state.paused) return false;
  return state.absenceStart == null || now - state.absenceStart < ABSENCE_CAP_MS + BIN_MS;
}

export function liveStats(state: PipelineState, now: number): { openBinActiveS: number; itemsPerMinNow: number } {
  return {
    openBinActiveS: state.bin?.active_s ?? 0,
    itemsPerMinNow: state.recentItems.filter((t) => t > now - RECENT_ITEMS_MS).length,
  };
}
