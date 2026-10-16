import { get, getAll, getRange, openDb, put, type BinRecord, type Label, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { baselineName, descriptionKey, suggestLabel } from '@/lib/ml/names';
import { uniqueNames } from '@/lib/ml/territories-core';
import { getSettings } from '@/lib/settings';
import type { GenerateFn } from './client';
import { describeTerritory, nameWithModel } from './naming';
import { recordGen } from './stats';

/**
 * Names the unconfirmed territories with the fine-tuned model (PDD 9.4, 6.3 step 4). Confirmed
 * territories are never renamed. On a failed validation the baseline name and the rule-based label
 * stay. A Drain suggestion from the rules (a known feed) is kept even if the model says otherwise:
 * a wrongly relaxed feed would silence nudges, a wrongly strict one only asks for a confirmation.
 */
const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 7;

export interface NamingReport {
  considered: number;
  named: number;
  fallback: number;
  skipped: number;
  /** The writer could not run; remaining territories were left alone. */
  unavailable: boolean;
  /** Model labels overridden by a rule-based Drain. */
  labelKeptByRules: number;
  results: Array<{ id: string; name: string; source: 'model' | 'baseline'; label: Label | null; why?: string; errors: string[] }>;
  ms: number;
}

export async function nameTerritories(generate: GenerateFn, opts: { force?: boolean; now?: number } = {}): Promise<NamingReport> {
  const t0 = performance.now();
  const now = opts.now ?? Date.now();
  const report: NamingReport = { considered: 0, named: 0, fallback: 0, skipped: 0, unavailable: false, labelKeptByRules: 0, results: [], ms: 0 };
  const settings = await getSettings();
  const territories = ((await getAll('territories')) as TerritoryRecord[]).filter((t) => !t.labelConfirmed && t.size > 0);
  if (territories.length === 0) return report;

  const db = await openDb();
  const since = now - LOOKBACK_DAYS * DAY_MS;
  const bySample = new Map<string, SampleRecord[]>();
  for (const t of territories) bySample.set(t.id, []);
  let cur = await db.transaction('samples').store.index('ts').openCursor(IDBKeyRange.lowerBound(since));
  while (cur) {
    const s = cur.value;
    if (s.territoryId && bySample.has(s.territoryId)) bySample.get(s.territoryId)!.push(s);
    cur = await cur.continue();
  }
  const bins = (await getRange('bins', since, now)) as BinRecord[];
  const binsBy = new Map<string, BinRecord[]>();
  for (const b of bins) if (b.territoryId && bySample.has(b.territoryId)) (binsBy.get(b.territoryId) ?? binsBy.set(b.territoryId, []).get(b.territoryId)!).push(b);

  for (const t of territories.sort((a, b) => b.size - a.size)) {
    if (report.unavailable) break;
    const samples = bySample.get(t.id) ?? [];
    const key = descriptionKey(samples);
    // Up to date: a model name for the same origins.
    if (!opts.force && t.nameSource === 'model' && t.nameKey === key) {
      report.skipped++;
      continue;
    }
    report.considered++;
    const desc = describeTerritory({ samples, bins: binsBy.get(t.id) ?? [], storeTitles: settings.storeTitles });
    if (!desc) {
      report.skipped++;
      continue;
    }
    const res = await nameWithModel(desc, generate);
    // The owner may have confirmed this territory while the model was running: then it is theirs.
    const fresh = await get('territories', t.id);
    if (!fresh || fresh.labelConfirmed) {
      report.skipped++;
      continue;
    }
    const rules = suggestLabel(samples);
    if (res.kind === 'model') {
      const keepDrain = rules === 'drain' && res.label !== 'drain';
      if (keepDrain) report.labelKeptByRules++;
      const label: Label = keepDrain ? 'drain' : res.label;
      await put('territories', { ...fresh, name: res.name, nameSource: 'model', nameKey: key, suggestedLabel: label, suggestionSource: keepDrain ? 'rules' : 'model' });
      report.named++;
      report.results.push({ id: t.id, name: res.name, source: 'model', label, why: res.why, errors: res.errors });
      await recordGen('naming', { model: true, generations: res.attempts, errors: res.errors });
    } else {
      // Baseline name and rule-based suggestion stay; remember the key so we don't retry every night.
      const name = baselineName(samples);
      await put('territories', { ...fresh, name: fresh.nameSource === 'model' ? name : fresh.name, nameSource: 'baseline', nameKey: key, suggestedLabel: rules ?? fresh.suggestedLabel, suggestionSource: 'rules' });
      report.fallback++;
      report.unavailable = res.unavailable;
      report.results.push({ id: t.id, name: t.name, source: 'baseline', label: rules ?? fresh.suggestedLabel, errors: res.errors });
      await recordGen('naming', { unavailable: res.unavailable, generations: res.attempts, errors: res.errors });
    }
  }

  // Names stay unique among the unconfirmed territories.
  const all = (await getAll('territories')) as TerritoryRecord[];
  uniqueNames(all);
  for (const t of all) await put('territories', t);
  report.ms = Math.round(performance.now() - t0);
  return report;
}
