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

  it('validateAutopsy is the union of both', () => {
    const a = autopsies[0]!;
    const row = (a.rows as Array<{ text: string; errors: string[]; strict: string[] }>)[0]!;
    expect(validateAutopsy(row.text, a.input as never)).toEqual([...new Set([...row.errors, ...row.strict])].sort());
  });
});
