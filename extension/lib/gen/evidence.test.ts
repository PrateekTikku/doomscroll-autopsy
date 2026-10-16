import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DailyFacts } from '@shared/types';
import { renderAutopsy } from '@/lib/metrics/autopsy';
import { replayedHistory } from '@/lib/metrics/replayed';
import { validateAutopsy } from '@/lib/metrics/validate';
import { personas, territoryIdOf } from '@/lib/replay/synthetic';

/**
 * M6 evidence. `npm run eval:m6` writes the probe's seed (`.output/m6-seed/<persona>.json`): replayed
 * days with the persona's sites as UNCONFIRMED territories (baseline names, true label as the rules'
 * suggestion), samples with titles, bins and nudges. `npm run probe:m6` runs the real extension on it
 * and writes `.output/m6-probe-raw.json`; `npm run report:m6` turns that into docs/showcase/M6/.
 */
const OUT = resolve(__dirname, '../../.output');
const DOCS = resolve(__dirname, '../../../docs/showcase/M6');

describe.skipIf(!process.env.M6_EVAL)('seed for probe:m6', () => {
  it('writes one seed per persona', () => {
    mkdirSync(resolve(OUT, 'm6-seed'), { recursive: true });
    for (const p of personas) {
      const days = p.id === 'developer' ? 8 : 3;
      const h = replayedHistory(p.id, { days });
      const lastDay = Math.max(...h.bins.map((b) => b.binStart));
      const sites = [...p.sites.deep.map((s) => ({ s, label: 'deep' as const })), ...p.sites.shallow.map((s) => ({ s, label: 'shallow' as const })), ...p.sites.drain.map((s) => ({ s, label: 'drain' as const }))];
      const territories = sites.map(({ s, label }) => {
        const t = h.territories.find((x) => x.id === territoryIdOf(s))!;
        return { ...t, centroid: Array.from(t.centroid), label: null, labelConfirmed: false, suggestedLabel: label, allowanceMin: null, size: 40, truth: label };
      });
      const samples = sites.flatMap(({ s }) =>
        Array.from({ length: 40 }, (_, i) => ({
          ts: lastDay - (i + 1) * 60_000 * 7,
          tabId: 1,
          origin: s.origin,
          path: s.pathPrefix === '/' ? '/' : `${s.pathPrefix}/page`,
          title: s.sampleTitles[i % s.sampleTitles.length],
          isVisual: s.isVisual,
          dwellMs: 20_000,
          vector: null,
          territoryId: territoryIdOf(s),
          territoryDist: 0.1,
        })),
      );
      writeFileSync(resolve(OUT, 'm6-seed', `${p.id}.json`), JSON.stringify({ persona: p.id, days, territories, samples, bins: h.bins, nudges: h.nudges }));
    }
    expect(existsSync(resolve(OUT, 'm6-seed', 'developer.json'))).toBe(true);
  }, 120_000);
});

interface RawPersona {
  persona: string;
  naming: { named: number; fallback: number; unavailable: boolean; ms: number; results: Array<{ id: string; name: string; source: string; label: string | null; why?: string; errors: string[] }> };
  territories: Array<{ id: string; baseline: string; name: string; nameSource?: string; suggestedLabel: string | null; truth: string }>;
  reports: Array<{ date: string; modelVersion: string; autopsy: string; facts: DailyFacts; source?: { kind: string; attempts: number; errors: string[] } }>;
  autopsyMs: number[];
}

describe.skipIf(!process.env.M6_REPORT)('report from probe:m6', () => {
  it('writes the showcase files', () => {
    const raw = JSON.parse(readFileSync(resolve(OUT, 'm6-probe-raw.json'), 'utf8')) as { personas: RawPersona[]; g1?: unknown };
    mkdirSync(DOCS, { recursive: true });

    // Autopsy: model vs template for the same day.
    let nReports = 0;
    let nModel = 0;
    const errorCounts: Record<string, number> = {};
    const lines: string[] = ['# Model-written autopsy vs template, same facts', '', 'Every report below was produced through the real extension (service worker → offscreen document → fine-tuned Gemma 3 270M). "Source: template" means the model\'s text failed a check and the template was used.', ''];
    for (const p of raw.personas) {
      for (const r of p.reports) {
        nReports++;
        const isModel = r.modelVersion !== 'template';
        if (isModel) nModel++;
        for (const e of r.source?.errors ?? []) errorCounts[e] = (errorCounts[e] ?? 0) + 1;
        // the stored text must pass our validator either way
        expect(validateAutopsy(r.autopsy, r.facts), `${p.persona} ${r.date}`).toEqual([]);
      }
      const sample = p.reports.find((r) => r.modelVersion !== 'template') ?? p.reports[0];
      if (sample) {
        lines.push(`## ${p.persona}, ${sample.date}`, '', `**Source:** ${sample.modelVersion === 'template' ? `template (model attempts: ${sample.source?.attempts ?? 0}; ${(sample.source?.errors ?? []).join(', ') || 'no errors recorded'})` : `${sample.modelVersion} (attempts: ${sample.source?.attempts})`}`, '', '**Stored autopsy**', '', sample.autopsy, '', '**Template for the same facts**', '', renderAutopsy(sample.facts), '');
      }
    }
    writeFileSync(resolve(DOCS, 'autopsy-vs-template.md'), lines.join('\n'));

    // Naming.
    const nl: string[] = ['# Territory naming: baseline vs fine-tuned model', '', '| Persona | Baseline name | Model name | Label (model) | Ground truth | Why (model) |', '|---|---|---|---|---|---|'];
    let nNamed = 0;
    let nTerr = 0;
    let labelRight = 0;
    let labelN = 0;
    for (const p of raw.personas) {
      for (const t of p.territories) {
        nTerr++;
        const res = p.naming.results.find((r) => r.id === t.id);
        if (t.nameSource === 'model') {
          nNamed++;
          labelN++;
          if (t.suggestedLabel === t.truth) labelRight++;
        }
        nl.push(`| ${p.persona} | ${t.baseline} | ${t.nameSource === 'model' ? t.name : '(baseline name kept)'} | ${t.suggestedLabel ?? ''} | ${t.truth} | ${(res?.why ?? '').replace(/\|/g, '/')} |`);
      }
    }
    nl.push('', `Named by the model: ${nNamed} of ${nTerr}. Suggested label equals the persona's ground truth for ${labelRight} of ${labelN} model-named territories.`);
    writeFileSync(resolve(DOCS, 'naming-examples.md'), nl.join('\n') + '\n');

    const summary = {
      autopsies: { total: nReports, fromModel: nModel, fallback: nReports - nModel, fallbackRate: Math.round(((nReports - nModel) / nReports) * 1000) / 10, errorCounts },
      naming: { territories: nTerr, fromModel: nNamed, fallback: nTerr - nNamed, labelMatchesTruth: labelRight, labelN },
      autopsyMsMedian: median(raw.personas.flatMap((p) => p.autopsyMs)),
      g1: raw.g1 ?? null,
    };
    writeFileSync(resolve(DOCS, 'fallback-rate.json'), JSON.stringify(summary, null, 1) + '\n');
    console.log(JSON.stringify(summary, null, 1));
    expect(nReports).toBeGreaterThan(10);
  });
});

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1]!;
}
