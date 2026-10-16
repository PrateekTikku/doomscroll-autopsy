import type { TerritoryDescription } from '@shared/types';
import type { BinRecord, Label, SampleRecord } from '@/lib/db';
import { dateKey } from '@/lib/metrics/time';
import { pathSegment } from '@/lib/ml/names';
import type { GenerateFn } from './client';
import { MAX_NEW_TOKENS } from './config';
import { parseNaming } from './naming-validate';
import { studentPrompt } from './prompt';

/**
 * Territory naming (PDD 9.4): builds the `territory-description` input from stored metadata, asks the
 * fine-tuned model for `{name, suggested_label, why}`, validates, retries once (sampled), and reports
 * a fallback otherwise. The caller keeps the baseline name and the rule-based label on fallback.
 */
const MAX_TITLES = 5;
const MAX_ORIGINS = 5;
/** Naming needs at least this many bins of activity to say anything about velocity. */
export const MIN_BINS = 2;

const round1 = (v: number) => Math.round(v * 10) / 10;

export interface DescribeInput {
  samples: Array<Pick<SampleRecord, 'origin' | 'path' | 'title' | 'ts'>>;
  /** Browsing bins of this territory (last 7 days). */
  bins: BinRecord[];
  storeTitles: boolean;
}

/** "/segment" (first path segment, never an ID) or "/". */
export function pathPrefixOf(path: string): string {
  const seg = pathSegment(path);
  return seg ? `/${seg}` : '/';
}

/** The model's input for one territory, or null when there isn't enough activity to describe it. */
export function describeTerritory(input: DescribeInput): TerritoryDescription | null {
  const bins = input.bins.filter((b) => !b.away && b.active_s > 0);
  if (input.samples.length === 0 || bins.length < MIN_BINS) return null;

  const counts = new Map<string, { origin: string; pathPrefix: string; count: number }>();
  for (const s of input.samples) {
    const pathPrefix = pathPrefixOf(s.path);
    const key = `${s.origin}${pathPrefix}`;
    const e = counts.get(key) ?? { origin: s.origin, pathPrefix, count: 0 };
    e.count++;
    counts.set(key, e);
  }
  const origins = [...counts.values()].sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin)).slice(0, MAX_ORIGINS);

  const titles: string[] = [];
  if (input.storeTitles) {
    for (const s of [...input.samples].sort((a, b) => b.ts - a.ts)) {
      const t = s.title?.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (t && !titles.includes(t)) titles.push(t);
      if (titles.length >= MAX_TITLES) break;
    }
  }

  const mean = (f: (b: BinRecord) => number) => bins.reduce((m, b) => m + f(b), 0) / bins.length;
  // Minutes on the latest day this territory was used.
  const byDay = new Map<string, number>();
  for (const b of bins) byDay.set(dateKey(b.binStart), (byDay.get(dateKey(b.binStart)) ?? 0) + b.active_s);
  const latest = [...byDay.keys()].sort().pop()!;

  return {
    origins: origins as TerritoryDescription['origins'],
    sampleTitles: titles as TerritoryDescription['sampleTitles'],
    topicTags: [],
    velocity: {
      itemsPerMin: round1(mean((b) => b.items_per_min)),
      skipRate: Math.min(1, Math.max(0, Math.round(mean((b) => b.video_skip_rate) * 100) / 100)),
      meanDwellS: round1(mean((b) => b.mean_dwell_ms) / 1000),
    },
    minutesToday: Math.round((byDay.get(latest) ?? 0) / 60),
  };
}

export type NamingResult =
  | { kind: 'model'; name: string; label: Label; why: string; attempts: number; errors: string[] }
  | { kind: 'fallback'; attempts: number; errors: string[]; unavailable: boolean };

export const NAMING_ATTEMPTS = 2;

export async function nameWithModel(desc: TerritoryDescription, generate: GenerateFn): Promise<NamingResult> {
  const prompt = studentPrompt('naming', desc);
  const errors: string[] = [];
  for (let attempt = 1; attempt <= NAMING_ATTEMPTS; attempt++) {
    let text: string;
    try {
      text = (await generate({ prompt, maxNewTokens: MAX_NEW_TOKENS.naming, sample: attempt > 1 })).text;
    } catch (e) {
      return { kind: 'fallback', attempts: attempt - 1, errors: [...errors, `unavailable: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)], unavailable: true };
    }
    const parsed = parseNaming(text, desc);
    if (parsed.output) return { kind: 'model', name: parsed.output.name, label: parsed.output.suggested_label, why: parsed.output.why, attempts: attempt, errors };
    errors.push(...parsed.errors);
  }
  return { kind: 'fallback', attempts: NAMING_ATTEMPTS, errors, unavailable: false };
}
