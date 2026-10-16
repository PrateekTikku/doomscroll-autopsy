import { describe, expect, it } from 'vitest';
import type { TerritoryRecord } from '@/lib/db';
import { buildEvidence, nmi } from './evidence';
import { plantedClusters } from './testutil';

const terr = (id: string, name: string, suggestedLabel: TerritoryRecord['suggestedLabel'] = null, label: TerritoryRecord['label'] = null): TerritoryRecord => ({
  id, name, centroid: new Float32Array(2), size: 0, topicTags: [], suggestedLabel, label, labelConfirmed: label != null, allowanceMin: null, firstSeen: 0, lastSeen: 0,
});

describe('nmi', () => {
  it('is 1 for identical labelings up to renaming, 0 for independent ones', () => {
    expect(nmi(['a', 'a', 'b', 'b'], ['x', 'x', 'y', 'y'])).toBeCloseTo(1, 6);
    expect(nmi(['a', 'a', 'b', 'b'], ['x', 'y', 'x', 'y'])).toBeCloseTo(0, 6);
  });
  it('is 0 when one side is constant, null when empty', () => {
    expect(nmi(['a', 'a'], ['x', 'y'])).toBe(0);
    expect(nmi([], [])).toBeNull();
  });
});

describe('buildEvidence', () => {
  // YouTube: tutorials (/watch) vs shorts, in different embedding regions; Docs: one region.
  const { points, labels } = plantedClusters(3, 40, 256, 0.3, 21);
  const samples = points.map((vec, i) => {
    const l = labels[i]!;
    return {
      vec,
      territoryId: `t${l}`,
      origin: l === 2 ? 'https://docs.example' : 'https://www.youtube.com',
      path: l === 0 ? '/watch' : l === 1 ? '/shorts/abc' : '/guide',
    };
  });
  const territories = [terr('t0', 'youtube.com · watch', null, 'deep'), terr('t1', 'youtube.com · shorts', 'drain'), terr('t2', 'docs.example · guide')];

  it('finds the domain that splits and its Deep/Drain labels', () => {
    const r = buildEvidence(samples, territories, 0);
    expect(r.originsSplit).toBe(1);
    const ex = r.examples[0]!;
    expect(ex.origin).toBe('https://www.youtube.com');
    expect(ex.territories.map((t) => t.name)).toEqual(['youtube.com · watch', 'youtube.com · shorts']);
    expect(ex.labelsDiffer).toBe(true);
    expect(ex.pathAgreementNmi).toBeCloseTo(1, 6);
    expect(ex.territories[0]!.topPaths[0]).toEqual({ segment: 'watch', count: 40 });
    expect(r.hiddenByDomainShare).toBeCloseTo(0.5, 6);
  });

  it('shows territories separating the vectors better than the domains do', () => {
    const r = buildEvidence(samples, territories, 0);
    expect(r.silhouetteByTerritory!).toBeGreaterThan(0.5);
    expect(r.silhouetteByDomain!).toBeLessThan(r.silhouetteByTerritory!);
  });

  it('contains only counts and names (no text, titles or queries)', () => {
    const json = JSON.stringify(buildEvidence(samples, territories, 0));
    expect(json).not.toMatch(/\?|#|"text"|"title"/);
  });

  it('ignores tiny slices when deciding a domain is split', () => {
    const few = samples.filter((s) => s.territoryId !== 't1').concat(samples.filter((s) => s.territoryId === 't1').slice(0, 2));
    expect(buildEvidence(few, territories, 0).originsSplit).toBe(0);
  });
});
