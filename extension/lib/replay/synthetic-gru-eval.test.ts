import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateSyntheticGru, gruMarkdown } from './synthetic-gru-eval';

describe('synthetic GRU evaluation', () => {
  it('trains on a persona history and reports GRU next to Markov on the held-out day', async () => {
    const rows = await evaluateSyntheticGru({ days: 4, personaIds: ['developer'], epochs: 2, maxWindows: 300 });
    expect(rows).toHaveLength(1);
    const e = rows[0]!.eval;
    expect(e.split).toBe('latest-day');
    expect(e.gru!.nNext).toBe(e.markov.nNext);
    expect(e.gru!.top3).toBeGreaterThan(0.5);
    expect(gruMarkdown(rows)).toContain('| developer |');
  }, 180_000);
});

// `npm run eval:m8` writes the showcase table (docs/showcase/M8/gru-vs-markov.{json,md}).
describe.skipIf(!process.env.M8_EVAL)('showcase export', () => {
  it('writes the six-persona table', async () => {
    const rows = await evaluateSyntheticGru({ days: 7, seed: 1, epochs: 8, maxWindows: 1500 });
    const dir = resolve(__dirname, '../../../docs/showcase/M8');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'gru-vs-markov.json'), JSON.stringify(rows, null, 1));
    writeFileSync(resolve(dir, 'gru-vs-markov.md'), gruMarkdown(rows) + '\n');
    console.log(gruMarkdown(rows));
    expect(rows.length).toBe(6);
  }, 1_800_000);
});
