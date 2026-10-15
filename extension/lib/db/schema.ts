import type { DBSchema } from 'idb';
import type { DailyFacts, TopicTag } from '@shared/types';

/**
 * IndexedDB record types (PDD 8.1). Settings are NOT here: they live in chrome.storage.local
 * so content scripts can read them (D-52, lib/settings).
 *
 * Privacy (PDD 11): no item text, screenshots or query strings in any record.
 */

export type Label = 'deep' | 'shallow' | 'drain';
export type PredictionMode = 'rules' | 'markov' | 'gru';

export interface SampleRecord {
  id?: number;
  ts: number;
  tabId: number;
  origin: string;
  /** Path only; query string and fragment stripped. */
  path: string;
  /** Only when "store titles" is on. */
  title?: string;
  isVisual: boolean;
  dwellMs: number;
  /** 256d (768d in dev mode), unit length; null until embedded. */
  vector: Float32Array | null;
  territoryId: string | null;
  territoryDist: number | null;
}

/** Velocity features per 30-second bin (PDD 7.6). */
export interface BinFeatures {
  scroll_px_s_mean: number;
  items_per_min: number;
  mean_dwell_ms: number;
  video_skip_rate: number;
  tab_switches: number;
  away_s: number;
  idle_s: number;
}

export interface BinRecord extends BinFeatures {
  /** Epoch ms, aligned to 30 s. */
  binStart: number;
  /** Majority territory in the bin. */
  territoryId: string | null;
  /** Internal model feature only; never shown or reported (D-45). */
  away: boolean;
  idle: boolean;
  nudgeShown: boolean;
  nudgeResponse: NudgeResponse | null;
}

export interface TerritoryRecord {
  id: string;
  centroid: Float32Array;
  size: number;
  name: string;
  topicTags: TopicTag[];
  suggestedLabel: Label | null;
  label: Label | null;
  labelConfirmed: boolean;
  /** Drain only; default 15. */
  allowanceMin: number | null;
  firstSeen: number;
  lastSeen: number;
}

export type NudgeResponse = 'back' | 'snooze' | 'ignored';

export interface NudgeRecord {
  id?: number;
  ts: number;
  step: 1 | 2 | 3;
  score: number;
  mode: PredictionMode;
  response: NudgeResponse | null;
  secondsToReturn: number | null;
}

/** Markov matrix, GRU metadata (weights live in TF.js `indexeddb://`), evaluation metrics, active mode. */
export interface ModelRecord {
  name: string;
  updatedAt: number;
  data: unknown;
}

export interface ReportRecord {
  /** Local date "YYYY-MM-DD". */
  date: string;
  facts: DailyFacts;
  autopsy: string;
  /** Which source wrote the autopsy, e.g. "template" or a model id + commit. */
  modelVersion: string;
}

export interface ForgetLogRecord {
  id?: number;
  ts: number;
  /** What kind of thing was forgotten; never the content. */
  kind: 'range' | 'site' | 'capture' | 'wipe';
  range?: { from: number; to: number };
  site?: string;
}

/** Dev-mode recorder (PDD 7.7): compact observer events, never item text, DOM or screenshots. */
export interface RecorderEventRecord {
  id?: number;
  ts: number;
  tabId: number;
  event: Record<string, unknown>;
}

export interface AutopsyDB extends DBSchema {
  samples: { key: number; value: SampleRecord; indexes: { ts: number; territoryId: string; origin: string } };
  bins: { key: number; value: BinRecord };
  territories: { key: string; value: TerritoryRecord };
  nudges: { key: number; value: NudgeRecord; indexes: { ts: number } };
  models: { key: string; value: ModelRecord };
  reports: { key: string; value: ReportRecord };
  forgetLog: { key: number; value: ForgetLogRecord };
  recorderEvents: { key: number; value: RecorderEventRecord; indexes: { ts: number } };
}

export type StoreName = 'samples' | 'bins' | 'territories' | 'nudges' | 'models' | 'reports' | 'forgetLog' | 'recorderEvents';

export const STORE_NAMES: readonly StoreName[] = [
  'samples',
  'bins',
  'territories',
  'nudges',
  'models',
  'reports',
  'forgetLog',
  'recorderEvents',
];
