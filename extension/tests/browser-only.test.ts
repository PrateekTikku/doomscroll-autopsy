import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nudgeCopy } from '../lib/nudge/copy';
import { OUTSIDE_BROWSER } from '../lib/metrics/validate';

/**
 * D-45: the product never shows, counts or describes time outside the browser. This scans every
 * user-facing source file (comments stripped) and the generated nudge copy for phrases about it.
 */
const ROOT = join(__dirname, '..');
const UI_DIRS = ['entrypoints/dashboard', 'entrypoints/popup', 'entrypoints/onboarding', 'lib/metrics', 'lib/privacy', 'lib/nudge'];

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel);
    return /\.(tsx?|html)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'validate.ts' ? [rel] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('browser time only (D-45)', () => {
  const files = UI_DIRS.flatMap(sources);

  it('finds the files it is supposed to scan', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)('%s has no phrase about time outside the browser', (file) => {
    const text = stripComments(readFileSync(join(ROOT, file), 'utf8'));
    const hit = text.match(OUTSIDE_BROWSER);
    expect(hit?.[0] ?? null, `${file} mentions "${hit?.[0]}"`).toBeNull();
  });

  it('keeps the away state out of every label shown to the user', () => {
    for (const file of files.filter((f) => /entrypoints\//.test(f))) {
      const text = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      // JSX text and string literals that name away/idle time as something the user sees
      expect(text, file).not.toMatch(/['">`]\s*(away time|time away|idle time|away minutes)\b/i);
    }
  });

  it('nudge copy never mentions it either', () => {
    for (const step of [1, 2, 3] as const) {
      const c = nudgeCopy(step, { territory: 'Reels', allowanceMin: 15, spentMin: 31, leftDeep: { name: 'Design doc', minutesAgo: 4 } });
      expect(Object.values(c).join(' ')).not.toMatch(OUTSIDE_BROWSER);
    }
  });
});
