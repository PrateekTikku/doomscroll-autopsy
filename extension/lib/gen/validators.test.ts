import { describe, expect, it } from 'vitest';
import { checkAutopsy, strictAutopsyErrors, validateAutopsy } from '@/lib/metrics/validate';
import parity from './fixtures/validator-parity.json';
import { parseNaming } from './naming-validate';

/**
 * Parity with the Python validators: each fixture row was run through `training/validators.py`
 * (check_autopsy, parse_naming) and `training/eval/metrics.py` (strict checks) on the real eval set,
 * including mutated variants (a changed number, an outside-browser phrase, swapped states...).
 */
describe('TypeScript validators match the Python ones', () => {
  const autopsies = parity.filter((p) => p.task === 'autopsy');
  const namings = parity.filter((p) => p.task === 'naming');

  it('has the data', () => {
    expect(autopsies.length).toBeGreaterThan(30);
    expect(namings.length).toBeGreaterThan(50);
  });

  it('checkAutopsy gives the same error codes as check_autopsy', () => {
    let rows = 0;
    for (const a of autopsies) {
      for (const r of a.rows as Array<{ text: string; errors: string[]; strict: string[] }>) {
        expect(checkAutopsy(r.text, a.input as never), `${a.id}: ${r.text.slice(0, 80)}`).toEqual(r.errors);
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(200);
  });

  it('strictAutopsyErrors gives the same codes as strict_autopsy_errors', () => {
    for (const a of autopsies) {
      for (const r of a.rows as Array<{ text: string; errors: string[]; strict: string[] }>) {
        expect(strictAutopsyErrors(r.text, a.input as never), `${a.id}: ${r.text.slice(0, 80)}`).toEqual(r.strict);
      }
    }
  });

  it('parseNaming agrees with parse_naming on every variant', () => {
    let rows = 0;
    for (const n of namings) {
      for (const r of n.rows as Array<{ text: string; errors: string[]; ok: boolean }>) {
        const got = parseNaming(r.text, n.input as never);
        expect(got.errors, `${n.id}: ${r.text.slice(0, 80)}`).toEqual(r.errors);
        expect(got.output !== null).toBe(r.ok);
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(300);
  });

  it('validateAutopsy is the union of both (the length tolerance aside)', () => {
    for (const a of autopsies) {
      for (const r of a.rows as Array<{ text: string; errors: string[]; strict: string[] }>) {
        const words = r.text.trim().split(/\s+/).length;
        const expected = [...new Set([...r.errors, ...r.strict])].filter((e) => !(e === 'word_count' && words >= 110 && words <= 200)).sort();
        expect(validateAutopsy(r.text, a.input as never), a.id).toEqual(expected);
      }
    }
  });

  it('accepts a faithful text of 181-200 words and refuses shorter or longer ones (D-59)', () => {
    const a = autopsies[0]!;
    const facts = a.input as never;
    const good = (a.rows as Array<{ text: string; errors: string[] }>)[0]!;
    const filler = ' Small, steady changes in what you open next usually matter more than effort in the moment.';
    let text = good.text;
    while (text.split(/\s+/).length <= 181) text += filler;
    const n = text.split(/\s+/).length;
    expect(n).toBeGreaterThan(180);
    expect(n).toBeLessThanOrEqual(200);
    expect(checkAutopsy(text, facts)).toContain('word_count'); // the strict T1 check still says so
    expect(validateAutopsy(text, facts)).not.toContain('word_count');
    while (text.split(/\s+/).length <= 200) text += filler;
    expect(validateAutopsy(text, facts)).toContain('word_count');
    expect(validateAutopsy('Too short.', facts)).toContain('word_count');
  });
});
