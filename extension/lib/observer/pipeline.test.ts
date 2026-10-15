import { describe, expect, it } from 'vitest';
import type { BinRecord } from '@/lib/db/schema';
import { ABSENCE_CAP_MS, BIN_MS, initialState, PULSE_MS, step, type PipelineOutput, type PipelineState } from './pipeline';
import type { PipelineEvent } from './types';

const T0 = 1_760_000_010_000 - (1_760_000_010_000 % BIN_MS); // aligned to a bin
const TAB = 7;
const WIN = 1;
const O = 'https://www.youtube.com';

function run(events: PipelineEvent[], state: PipelineState = initialState()) {
  const out: PipelineOutput[] = [];
  for (const ev of events) out.push(...step(state, ev));
  const bins = out.filter((o) => o.kind === 'bin').map((o) => (o as { record: BinRecord }).record);
  return { state, out, bins };
}

/** Focused window with TAB active, user active. */
const focused = (ts = T0): PipelineEvent[] => [
  { type: 'tab-activated', ts, tabId: TAB, windowId: WIN },
  { type: 'window-focus', ts, windowId: WIN },
  { type: 'idle-state', ts, state: 'active' },
];
const hb = (ts: number, tabId = TAB): PipelineEvent => ({ type: 'heartbeat', ts, tabId, origin: O, path: '/' });
const tick = (ts: number): PipelineEvent => ({ type: 'tick', ts });
const item = (ts: number, extra: Partial<Extract<PipelineEvent, { type: 'item' }>> = {}): PipelineEvent => ({
  type: 'item',
  ts,
  tabId: TAB,
  origin: O,
  path: '/shorts/abc',
  itemKey: `u:/shorts/${ts}`,
  isVisual: true,
  prevDwellMs: 0,
  ...extra,
});
const sum = (bins: BinRecord[], k: 'active_s' | 'idle_s' | 'away_s') => bins.reduce((s, b) => s + b[k], 0);

describe('pipeline: heartbeat merging and bins', () => {
  it('merges heartbeats within the pulse window into continuous active time, split into 30 s bins', () => {
    const { bins } = run([...focused(), hb(T0), hb(T0 + 15_000), hb(T0 + 30_000), hb(T0 + 45_000), tick(T0 + 60_000), tick(T0 + 90_000)]);
    expect(bins.map((b) => b.binStart)).toEqual([T0, T0 + BIN_MS, T0 + 2 * BIN_MS]);
    expect(bins.map((b) => b.active_s)).toEqual([30, 30, 30]);
  });

  it('stops counting a pulse window after the last heartbeat (gap, not active)', () => {
    const { bins } = run([...focused(), hb(T0), tick(T0 + 5 * 60_000)]);
    expect(sum(bins, 'active_s')).toBe(PULSE_MS / 1000);
    expect(sum(bins, 'away_s') + sum(bins, 'idle_s')).toBe(0);
  });

  it('counts nothing when the active tab never reports (blocked page, chrome://, no content script)', () => {
    const { bins } = run([...focused(), hb(T0, 99), hb(T0 + 15_000, 99), tick(T0 + 60_000)]);
    expect(bins).toEqual([]);
  });

  it('splits an interval across bin boundaries', () => {
    const { bins } = run([...focused(T0 + 20_000), hb(T0 + 20_000), hb(T0 + 40_000), tick(T0 + 70_000)]);
    expect(bins.map((b) => [b.binStart, b.active_s])).toEqual([
      [T0, 10],
      [T0 + BIN_MS, 30],
    ]);
  });
});

describe('pipeline: velocity features (PDD 7.6)', () => {
  it('aggregates scroll, items, dwell, skips and tab switches per bin', () => {
    const { bins } = run([
      ...focused(),
      hb(T0),
      { type: 'scroll', ts: T0 + 10_000, tabId: TAB, pxPerS: 1200 },
      { type: 'scroll', ts: T0 + 20_000, tabId: TAB, pxPerS: 0 },
      item(T0 + 1000),
      item(T0 + 5000, { prevDwellMs: 4000 }),
      item(T0 + 8000, { prevDwellMs: 3000 }),
      { type: 'video', ts: T0 + 9000, tabId: TAB, itemKey: 'u:/shorts/a', event: 'play', currentTime: 0, duration: 30 },
      { type: 'video', ts: T0 + 9500, tabId: TAB, itemKey: 'u:/shorts/a', event: 'skip', currentTime: 1, duration: 30 },
      { type: 'video', ts: T0 + 9600, tabId: TAB, itemKey: 'u:/shorts/b', event: 'play', currentTime: 0, duration: 30 },
      { type: 'tab-activated', ts: T0 + 25_000, tabId: 8, windowId: WIN },
      { type: 'tab-activated', ts: T0 + 26_000, tabId: TAB, windowId: WIN },
      tick(T0 + 31_000),
    ]);
    const b = bins[0]!;
    expect(b.active_s).toBe(29); // 1 s on tab 8, which never reported
    expect(b.scroll_px_s_mean).toBeCloseTo((1200 * 10) / 29, 1);
    expect(b.items_per_min).toBe(6);
    expect(b.mean_dwell_ms).toBe(3500);
    expect(b.video_skip_rate).toBe(0.5);
    expect(b.tab_switches).toBe(2);
    expect(b).toMatchObject({ away: false, idle: false, territoryId: null, nudgeShown: false, nudgeResponse: null });
  });
});

describe('pipeline: away, idle and video (D-45, D-46)', () => {
  it('counts away time for the first 10 minutes of an absence, then leaves a gap', () => {
    const { bins, state } = run([...focused(), hb(T0), { type: 'window-focus', ts: T0 + 30_000, windowId: null }]);
    const later = run([tick(T0 + 30_000 + 60 * 60_000)], state);
    const all = [...bins, ...later.bins];
    expect(sum(all, 'away_s')).toBe(ABSENCE_CAP_MS / 1000);
    expect(all.filter((b) => b.away).length).toBe(ABSENCE_CAP_MS / BIN_MS);
    expect(all.at(-1)!.binStart).toBe(T0 + 30_000 + ABSENCE_CAP_MS - BIN_MS);
  });

  it('counts idle time as idle, but a playing video in the active tab as active', () => {
    const idle = run([...focused(), hb(T0), { type: 'idle-state', ts: T0, state: 'idle' }, hb(T0 + 15_000), tick(T0 + 30_000)]);
    expect(idle.bins[0]).toMatchObject({ active_s: 0, idle_s: 30, idle: true });

    const video = run([
      ...focused(),
      { type: 'video', ts: T0, tabId: TAB, itemKey: 'm:x', event: 'play', currentTime: 0, duration: 600 },
      { type: 'idle-state', ts: T0, state: 'idle' },
      hb(T0 + 15_000),
      tick(T0 + 30_000),
    ]);
    expect(video.bins[0]).toMatchObject({ active_s: 30, idle_s: 0 });

    const locked = run([
      ...focused(),
      { type: 'video', ts: T0, tabId: TAB, itemKey: 'm:x', event: 'play', currentTime: 0, duration: 600 },
      { type: 'idle-state', ts: T0, state: 'locked' },
      hb(T0 + 15_000),
      tick(T0 + 30_000),
    ]);
    expect(locked.bins[0]).toMatchObject({ active_s: 0, idle_s: 30 });
  });

  it('ends the absence when the user comes back', () => {
    const { state } = run([...focused(), { type: 'window-focus', ts: T0 + 1000, windowId: null }, { type: 'window-focus', ts: T0 + 5000, windowId: WIN }]);
    expect(state.absenceStart).toBeNull();
  });
});

describe('pipeline: samples and pause', () => {
  it('emits a sanitised sample per item and the previous sample\'s dwell', () => {
    const { out } = run([...focused(), item(T0 + 1000, { path: '/watch?v=1#t' }), item(T0 + 6000, { prevDwellMs: 4800 })]);
    const samples = out.filter((o) => o.kind === 'sample');
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({ record: { path: '/watch', tabId: TAB, vector: null, dwellMs: 0, territoryId: null } });
    expect(out.find((o) => o.kind === 'dwell')).toEqual({ kind: 'dwell', tabId: TAB, dwellMs: 4800 });
  });

  it('sets a provisional dwell when the tab is hidden', () => {
    const { out } = run([...focused(), item(T0 + 1000), { type: 'visibility', ts: T0 + 9000, tabId: TAB, visible: false }]);
    expect(out.filter((o) => o.kind === 'dwell')).toEqual([{ kind: 'dwell', tabId: TAB, dwellMs: 8000 }]);
  });

  it('ignores observer events and counts no time while paused', () => {
    const { out, bins } = run([
      ...focused(),
      { type: 'pause', ts: T0, paused: true },
      hb(T0 + 1000),
      item(T0 + 2000),
      hb(T0 + 15_000),
      tick(T0 + 90_000),
    ]);
    expect(out.filter((o) => o.kind === 'sample')).toHaveLength(0);
    expect(bins).toEqual([]);
  });

  it('clamps out-of-order timestamps instead of going back in time', () => {
    const { state } = run([...focused(), hb(T0 + 10_000), hb(T0 + 9000)]);
    expect(state.lastTs).toBe(T0 + 10_000);
  });
});
