import { describe, expect, it } from 'vitest';
import { autopsySourceLabel, nameSourceLabel, statsLine, writerLine } from './labels';

describe('labels', () => {
  it('says where an autopsy came from', () => {
    expect(autopsySourceLabel({ modelVersion: 'doomscroll-gemma-3-270m run1', source: { kind: 'model', attempts: 1, errors: [] } })).toBe('Written by Gemma 3 270M (fine-tuned)');
    expect(autopsySourceLabel({ modelVersion: 'template' })).toBe('Written from a template');
    expect(autopsySourceLabel({ modelVersion: 'template', source: { kind: 'template', attempts: 0, errors: [] } })).toBe('Written from a template');
    expect(autopsySourceLabel({ modelVersion: 'template', source: { kind: 'template', attempts: 2, errors: ['ungrounded_number'] } })).toMatch(/did not pass/);
    expect(autopsySourceLabel({ modelVersion: 'template', source: { kind: 'template', attempts: 0, errors: ['unavailable: no model'] } })).toMatch(/could not run/);
  });

  it('labels territory names', () => {
    expect(nameSourceLabel({ nameSource: 'model', suggestionSource: 'model', labelConfirmed: false })).toBe('named by Gemma 3 270M (fine-tuned)');
    expect(nameSourceLabel({ nameSource: undefined, suggestionSource: undefined, labelConfirmed: false })).toBe('baseline name');
  });

  it('describes the writer state in one line', () => {
    const base = { percent: 0, error: null, device: 'webgpu', loadMs: 1, generations: 0, medianTokPerS: null };
    expect(writerLine(null)).toMatch(/loads when it writes/);
    expect(writerLine({ ...base, state: 'loading', percent: 40 })).toBe('Writer model: loading, 40%…');
    expect(writerLine({ ...base, state: 'ready', medianTokPerS: 116.4 })).toBe('Writer model: ready, 116 tokens/s');
    expect(writerLine({ ...base, state: 'error', error: 'no files' })).toBe('Writer model: unavailable, using templates. no files');
  });

  it('summarises counters', () => {
    expect(statsLine('Names', { items: 0, model: 0, fallback: 0, unavailable: 0, generations: 0, errors: {} })).toBe('Names: none written yet');
    expect(statsLine('Autopsies', { items: 10, model: 7, fallback: 3, unavailable: 0, generations: 14, errors: {} })).toBe('Autopsies: 7 of 10 from the model, 3 fell back (30%)');
  });
});
