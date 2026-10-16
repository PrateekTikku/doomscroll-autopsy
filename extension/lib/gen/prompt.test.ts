import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/prompts.json';
import { compactJson, studentPrompt, STUDENT_INSTRUCTION } from './prompt';

describe('student prompt', () => {
  it('reproduces every real training prompt byte for byte', () => {
    expect(fixtures.length).toBe(50);
    for (const f of fixtures) {
      const got = studentPrompt(f.task as 'naming', f.input as never);
      expect(got, f.id).toBe(f.user);
    }
  });

  it('writes whole floats with .0 only for the float fields', () => {
    expect(compactJson({ velocity: { itemsPerMin: 4, skipRate: 0, meanDwellS: 12 }, minutesToday: 30 })).toBe(
      '{"velocity":{"itemsPerMin":4.0,"skipRate":0.0,"meanDwellS":12.0},"minutesToday":30}',
    );
    expect(compactJson({ deepBlocksDelta: 2, drainOverDelta: -3, medianReturnMin: null })).toBe('{"deepBlocksDelta":2,"drainOverDelta":-3.0,"medianReturnMin":null}');
  });

  it('keeps unicode and escapes like Python with ensure_ascii=False', () => {
    expect(compactJson({ t: 'Café “x” \n' })).toBe('{"t":"Café “x” \\n"}');
  });

  it('has the two fixed instructions', () => {
    expect(STUDENT_INSTRUCTION.naming.startsWith('Name this browsing territory')).toBe(true);
    expect(STUDENT_INSTRUCTION.autopsy.endsWith('using only numbers from the facts.')).toBe(true);
  });
});
