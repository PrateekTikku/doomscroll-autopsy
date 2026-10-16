import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv/dist/2020';
import schema from '@shared/daily-facts.schema.json';
import { describe, expect, it } from 'vitest';
import { personas } from '@/lib/replay/synthetic';
import { replayedHistory } from './replayed';
import { checkAutopsy } from './validate';

const validate = new Ajv({ strict: false }).compile(schema);

describe('metrics on replayed synthetic days', () => {
  const h = replayedHistory('developer', { days: 8 });

  it('produces plausible facts that validate and an autopsy that passes the validator', () => {
    expect(h.days).toHaveLength(8);
    for (const d of h.days) {
      expect(validate(d.facts), JSON.stringify(validate.errors)).toBe(true);
      expect(checkAutopsy(d.autopsy, d.facts), d.autopsy).toEqual([]);
    }
    const day = h.days[3]!.facts;
    expect(day.deepBlocks.count).toBeGreaterThan(0);
    expect(day.totalsMin.deep).toBeGreaterThan(30);
    expect(day.residue.switchesOutOfDeep).toBeGreaterThan(0);
  });

  it('gives the 8th day a 7-day comparison and the first days none', () => {
    expect(h.days[0]!.facts.vs7Day).toBeNull();
    expect(h.days[7]!.facts.vs7Day).not.toBeNull();
  });

  it('works for every persona', () => {
    for (const p of personas) {
      const r = replayedHistory(p.id, { days: 2 });
      expect(r.days.length).toBe(2);
      for (const d of r.days) expect(checkAutopsy(d.autopsy, d.facts), `${p.id} ${d.date}`).toEqual([]);
    }
  });
});

// `npm run eval:m5` writes the showcase material (docs/showcase/M5/).
describe.skipIf(!process.env.M5_EVAL)('showcase export', () => {
  it('writes facts and template autopsies for the six personas, plus the (untracked) seed for `npm run probe:m5`', () => {
    const dir = resolve(__dirname, '../../../docs/showcase/M5');
    mkdirSync(dir, { recursive: true });
    const rows: string[] = ['| Persona | Deep blocks | Longest (min) | Switches out of Deep | Mean min back | Deep / Shallow / Drain (min) | Over allowance (min) | Nudges (accepted of shown) |', '|---|---|---|---|---|---|---|---|'];
    for (const p of personas) {
      const r = replayedHistory(p.id, { days: 8 });
      const last = r.days[r.days.length - 1]!;
      writeFileSync(resolve(dir, `facts-${p.id}.json`), JSON.stringify(last.facts, null, 1) + '\n');
      writeFileSync(resolve(dir, `autopsy-${p.id}.md`), `# ${p.id}, ${last.date} (template autopsy)\n\n${last.autopsy}\n`);
      const f = last.facts;
      rows.push(`| ${p.id} | ${f.deepBlocks.count} | ${f.deepBlocks.longestMin} | ${f.residue.switchesOutOfDeep} | ${f.residue.meanMinBackToDeep ?? '–'} | ${f.totalsMin.deep} / ${f.totalsMin.shallow} / ${f.totalsMin.drain} | ${f.drainOverAllowance.reduce((m, d) => m + d.minutesOver, 0)} | ${f.nudges.accepted} of ${f.nudges.shown} |`);
      if (p.id === 'developer') {
        const seed = {
          territories: r.territories.map((t) => ({ ...t, centroid: Array.from(t.centroid) })),
          bins: r.bins,
          nudges: r.nudges,
        };
        const out = resolve(__dirname, '../../.output');
        mkdirSync(out, { recursive: true });
        writeFileSync(resolve(out, 'probe-seed.json'), JSON.stringify(seed)); // large; not part of the showcase files
      }
    }
    writeFileSync(resolve(dir, 'persona-days.md'), `# Last replayed day per persona (8-day synthetic history, seed 1)\n\n${rows.join('\n')}\n`);
    expect(rows.length).toBe(8);
  }, 120_000);
});
