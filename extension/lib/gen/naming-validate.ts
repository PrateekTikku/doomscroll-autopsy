import type { NamingOutput, TerritoryDescription } from '@shared/types';
import { BANNED_TONE, normNum, numbersIn, OUTSIDE_BROWSER } from '@/lib/metrics/validate';

/**
 * Naming-output validator (PDD 9.4): a TypeScript port of `training/validators.py::parse_naming`.
 * Parses the model's reply, checks it against `naming-output.schema.json` by hand (Ajv can't run
 * under the MV3 CSP, K-01) and applies the same grounding and tone checks T1 filtered the data with.
 */
const LABELS = ['deep', 'shallow', 'drain'] as const;
const NUMBER = /\d+(?:\.\d+)?/g;

export function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1]!.trim() : t;
}

export interface ParsedNaming {
  output: NamingOutput | null;
  errors: string[];
}

export function parseNaming(text: string, description: TerritoryDescription): ParsedNaming {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return { output: null, errors: ['bad_json'] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { output: null, errors: ['bad_json'] };
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  const schemaOk =
    keys.length === 3 &&
    ['name', 'suggested_label', 'why'].every((k) => k in o) &&
    typeof o.name === 'string' &&
    o.name.length >= 1 &&
    o.name.length <= 60 &&
    /^\S+( \S+){0,5}$/.test(o.name) &&
    typeof o.why === 'string' &&
    o.why.length >= 1 &&
    o.why.length <= 200 &&
    LABELS.includes(o.suggested_label as never);
  if (!schemaOk) return { output: null, errors: ['schema'] };
  const output: NamingOutput = { name: o.name as string, suggested_label: o.suggested_label as NamingOutput['suggested_label'], why: o.why as string };

  const errors: string[] = [];
  const allowed = numbersIn(description);
  for (const field of [output.name, output.why]) {
    if ((field.match(NUMBER) ?? []).some((n) => !allowed.has(normNum(n)))) {
      errors.push('ungrounded_number');
      break;
    }
  }
  if (/:\/\/|\//.test(output.name)) errors.push('name_is_url');
  if (/ground[- ]?truth|i was told|hint|as instructed|provided label/i.test(output.why)) errors.push('hint_leak');
  const both = `${output.name} ${output.why}`;
  if (OUTSIDE_BROWSER.test(both)) errors.push('outside_browser');
  if (BANNED_TONE.test(both)) errors.push('tone');
  return { output: errors.length ? null : output, errors };
}
