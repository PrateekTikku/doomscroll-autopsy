import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateSynthetic, evaluationMarkdown } from './synthetic-eval';

describe('synthetic evaluation harness', () => {
  it('runs end to end on two personas and reports both modes on the held-out day', () => {
    const e = evaluateSynthetic({ days: 4, personaIds: ['developer', 'student'] });
    expect(e.perPersona).toHaveLength(2);
    for (const r of e.perPersona) {
      expect(r.eval.split).toBe('latest-day');
      expect(r.eval.markov.nNext).toBeGreaterThan(200);
      expect(r.eval.rules.nScore).toBe(r.eval.markov.nScore);
      expect(r.nudges.total).toBeGreaterThan(0);
    }
    expect(evaluationMarkdown(e)).toContain('| developer |');
  });
});

// `npm run eval:m4` writes the showcase numbers (docs/showcase/M4/synthetic-eval.{json,md}).
describe.skipIf(!process.env.M4_EVAL)('showcase export', () => {
  it('writes the 14-day, six-persona table', () => {
    const t0 = performance.now();
    const e = evaluateSynthetic({ days: 14, seed: 1 });
    const dir = resolve(__dirname, '../../../docs/showcase/M4');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'synthetic-eval.json'), JSON.stringify({ ...e, ms: Math.round(performance.now() - t0) }, null, 1));
    writeFileSync(resolve(dir, 'synthetic-eval.md'), evaluationMarkdown(e) + '\n');
    console.log(evaluationMarkdown(e), `\n${Math.round(performance.now() - t0)} ms`);
    expect(e.perPersona).toHaveLength(6);
  }, 120_000);
});
