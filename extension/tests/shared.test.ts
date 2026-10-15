import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { generateTypes, SHARED_DIR, TYPES_PATH } from '../scripts/gen-types';

// Ajv is used in tests only: it compiles validators with `new Function`, which the MV3 CSP blocks.
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const schemaFiles = readdirSync(SHARED_DIR).filter((f) => f.endsWith('.schema.json')).sort();
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validators: Record<string, ValidateFunction> = Object.fromEntries(
  schemaFiles.map((f) => [f.replace('.schema.json', ''), ajv.compile(readJson(join(SHARED_DIR, f)))]),
);
const validator = (name: string): ValidateFunction => {
  const v = validators[name];
  if (!v) throw new Error(`No schema named ${name}`);
  return v;
};

describe('shared/ contracts', () => {
  it('has the five v1 schemas', () => {
    expect(Object.keys(validators)).toEqual([
      'daily-facts',
      'naming-output',
      'observer-event',
      'personas',
      'territory-description',
    ]);
    for (const f of schemaFiles) expect(readJson(join(SHARED_DIR, f)).$id).toMatch(/:v1$/);
  });

  it.each(readdirSync(join(SHARED_DIR, 'samples')))('samples/%s validates', (file: string) => {
    const validate = validator(file.replace('.sample.json', ''));
    const data = readJson(join(SHARED_DIR, 'samples', file));
    for (const item of Array.isArray(data) ? data : [data]) {
      expect(validate(item), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('personas.json validates and has the six personas', () => {
    const personas = readJson(join(SHARED_DIR, 'personas.json'));
    const validate = validator('personas');
    expect(validate(personas), JSON.stringify(validate.errors)).toBe(true);
    expect(personas.personas.map((p: { id: string }) => p.id)).toEqual([
      'developer',
      'writer',
      'researcher',
      'designer',
      'student',
      'freelancer',
    ]);
  });

  it('rejects invalid objects', () => {
    const facts = readJson(join(SHARED_DIR, 'samples', 'daily-facts.sample.json'));
    expect(validator('daily-facts')({ ...facts, deepBlocks: { ...facts.deepBlocks, count: -1 } })).toBe(false);
    expect(validator('naming-output')({ name: 'one two three four five six seven', suggested_label: 'deep', why: 'x' })).toBe(false);
    expect(validator('naming-output')({ name: 'Docs', suggested_label: 'neutral', why: 'x' })).toBe(false);
    expect(validator('observer-event')({ type: 'heartbeat', ts: 1, origin: 'https://a.com', path: '/p?q=secret' })).toBe(false);
  });

  it('shared/types.ts is up to date with the schemas', async () => {
    expect(await generateTypes()).toBe(readFileSync(TYPES_PATH, 'utf8'));
  });
});
