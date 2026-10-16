import type { DailyFacts, TerritoryDescription } from '@shared/types';

/**
 * The student prompt (PDD 9.4, 9.8): a TypeScript port of `training/common.py::student_prompt`, which
 * T1 used to build every training example and T2 to evaluate. The fine-tuned 270M only sees prompts
 * in exactly this form, so the string must match byte for byte (pinned by a test against real
 * training examples): one fixed instruction, a blank line, then the input as compact JSON in the
 * schema's key order.
 */
export type Task = 'naming' | 'autopsy';

export const STUDENT_INSTRUCTION: Record<Task, string> = {
  naming:
    'Name this browsing territory and suggest a label. ' +
    'Reply with JSON only: {"name": "...", "suggested_label": "deep|shallow|drain", "why": "..."}.',
  autopsy:
    "Write tonight's autopsy of this browser day in the calm, factual coach voice, " +
    '120-180 words, using only numbers from the facts.',
};

/**
 * Fields the training data wrote as Python floats: a whole value is printed with ".0" (`4.0`, not `4`).
 * `deepBlocksDelta` is deliberately absent: the data prints whole deltas as integers.
 */
const FLOAT_KEYS = new Set(['itemsPerMin', 'skipRate', 'meanDwellS', 'meanMinBackToDeep', 'medianReturnMin', 'drainOverDelta', 'score']);

function write(value: unknown, key: string | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in prompt input');
    return Number.isInteger(value) && key && FLOAT_KEYS.has(key) ? `${value}.0` : String(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => write(v, key)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}:${write(v, k)}`)
      .join(',')}}`;
  }
  throw new Error(`Cannot serialise ${typeof value}`);
}

/** Canonical compact JSON: keys in insertion (schema) order, no spaces. */
export function compactJson(obj: unknown): string {
  return write(obj, null);
}

export function studentPrompt(task: 'naming', input: TerritoryDescription): string;
export function studentPrompt(task: 'autopsy', input: DailyFacts): string;
export function studentPrompt(task: Task, input: TerritoryDescription | DailyFacts): string {
  return `${STUDENT_INSTRUCTION[task]}\n\n${compactJson(input)}`;
}
