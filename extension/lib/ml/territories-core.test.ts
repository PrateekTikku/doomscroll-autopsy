import { describe, expect, it } from 'vitest';
import type { TerritoryRecord } from '@/lib/db';
import { fitClusters, meanUnit } from './kmeans';
import { plantedClusters } from './testutil';
import {
  applyLabel,
  assignSample,
  binTerritories,
  buildTerritories,
  carryTerritories,
  EMPTY_META,
  isReclusterDue,
  lastNightlyBoundary,
} from './territories-core';

function setup(k = 5, per = 50, seed = 7) {
  const data = plantedClusters(k, per, 256, 0.3, seed);
  const hosts = ['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example', 'https://e.example'];
  const samples = data.points.map((_, i) => ({ ts: 1000 + i, origin: hosts[data.labels[i]! % 5]!, path: `/sec${data.labels[i]}/x` }));
  let n = 0;
  const newId = () => `t-${++n}`;
  return { ...data, samples, newId };
}

describe('buildTerritories', () => {
  it('creates territories with baseline names, sizes and radius', () => {
    const { points, samples, newId } = setup();
    const fit = fitClusters(points, { seed: 1 });
    const r = buildTerritories({ fit, samples, old: [], now: 5000, newId });
    expect(r.territories).toHaveLength(5);
    expect(r.created).toBe(5);
    for (const t of r.territories) {
      expect(t.size).toBe(50);
      expect(t.name).toMatch(/example · sec\d/);
      expect(t.radius).toBeGreaterThan(0);
      expect(t.label).toBeNull();
      expect(t.labelConfirmed).toBe(false);
    }
  });

  it('keeps IDs, labels and allowances across a re-cluster of shuffled input', () => {
    const a = setup();
    const first = buildTerritories({ fit: fitClusters(a.points, { seed: 1 }), samples: a.samples, old: [], now: 5000, newId: a.newId });
    const labelled: TerritoryRecord[] = first.territories.map((t, i) =>
      i === 0 ? applyLabel(t, 'drain') : i === 1 ? applyLabel(t, 'deep') : t,
    );
    // Same data, different order and seed → same clusters in a different index order.
    const order = a.points.map((_, i) => i).reverse();
    const points2 = order.map((i) => a.points[i]!);
    const samples2 = order.map((i) => a.samples[i]!);
    const second = buildTerritories({ fit: fitClusters(points2, { seed: 42 }), samples: samples2, old: labelled, now: 9000, newId: a.newId });
    expect(second.matched).toBe(5);
    expect(second.created).toBe(0);
    expect(second.territories.map((t) => t.id).sort()).toEqual(labelled.map((t) => t.id).sort());
    const byId = new Map(second.territories.map((t) => [t.id, t]));
    expect(byId.get(labelled[0]!.id)).toMatchObject({ label: 'drain', labelConfirmed: true, allowanceMin: 15, name: labelled[0]!.name });
    expect(byId.get(labelled[1]!.id)).toMatchObject({ label: 'deep', labelConfirmed: true, allowanceMin: null });
  });

  it('keeps owner-confirmed territories dormant when k shrinks, and drops unconfirmed ones', () => {
    const a = setup();
    const first = buildTerritories({ fit: fitClusters(a.points, { seed: 1 }), samples: a.samples, old: [], now: 1, newId: a.newId });
    const old = first.territories.map((t, i) => (i === 0 ? applyLabel(t, 'shallow') : t));
    // Re-cluster only the points of 3 of the 5 planted clusters (drop clusters of old[0] and one more).
    const lost = old[0]!;
    const keepIdx = a.points.map((p, i) => i).filter((i) => assignSample(a.points[i]!, [lost]).territoryId == null);
    const fit = fitClusters(
      keepIdx.map((i) => a.points[i]!),
      { seed: 2 },
    );
    const r = buildTerritories({ fit, samples: keepIdx.map((i) => a.samples[i]!), old, now: 2, newId: a.newId });
    expect(r.territories.find((t) => t.id === lost.id)).toMatchObject({ label: 'shallow', size: 0 });
    expect(r.dormant).toBe(1);
    // unconfirmed old territories that disappeared are not kept
    expect(r.territories.length).toBe(fit.k + 1);
  });

  it('refreshes name and suggestion only for unconfirmed territories', () => {
    const a = setup();
    const fit = fitClusters(a.points, { seed: 1 });
    const first = buildTerritories({ fit, samples: a.samples, old: [], now: 1, newId: a.newId });
    const old = first.territories.map((t, i) => ({ ...t, name: `old ${i}`, labelConfirmed: i === 0 }));
    const r = buildTerritories({ fit, samples: a.samples, old, now: 2, newId: a.newId });
    const names = new Map(r.territories.map((t) => [t.id, t.name]));
    expect(names.get(old[0]!.id)).toBe('old 0');
    expect(names.get(old[1]!.id)).toMatch(/example/);
  });

  it('keeps a model-written name while the origins are unchanged, and resets it when they change', () => {
    const a = setup();
    const fit = fitClusters(a.points, { seed: 1 });
    const first = buildTerritories({ fit, samples: a.samples, old: [], now: 1, newId: a.newId });
    expect(first.territories.every((t) => t.nameSource === 'baseline' && t.nameKey && t.suggestionSource === 'rules')).toBe(true);
    const named = first.territories.map((t) => ({ ...t, name: `Model name ${t.id}`, nameSource: 'model' as const, suggestedLabel: 'deep' as const, suggestionSource: 'model' as const }));
    const same = buildTerritories({ fit, samples: a.samples, old: named, now: 2, newId: a.newId });
    for (const t of same.territories) expect(t).toMatchObject({ name: `Model name ${t.id}`, nameSource: 'model', suggestedLabel: 'deep', suggestionSource: 'model' });
    // another origin takes over one territory: its model name goes back to the baseline
    const changedKey = named.map((t, i) => (i === 0 ? { ...t, nameKey: 'https://other.example' } : t));
    const after = buildTerritories({ fit, samples: a.samples, old: changedKey, now: 3, newId: a.newId });
    const t0 = after.territories.find((t) => t.id === changedKey[0]!.id)!;
    expect(t0.name).toMatch(/example/);
    expect(t0).toMatchObject({ nameSource: 'baseline', suggestionSource: 'rules' });
  });

  it('suggests drain for a territory made of feed pages', () => {
    const { points, newId } = setup(4, 30);
    const fit = fitClusters(points, { seed: 1 });
    const samples = points.map((_, i) => ({ ts: i, origin: 'https://www.youtube.com', path: i < 30 ? '/shorts/abc' : '/watch' }));
    const r = buildTerritories({ fit, samples, old: [], now: 1, newId });
    const suggested = r.territories.filter((t) => t.suggestedLabel === 'drain');
    expect(suggested.length).toBe(1);
    expect(suggested[0]!.label).toBeNull();
  });
});

describe('unique names', () => {
  it('suffixes duplicate baseline names by size and leaves confirmed names alone', () => {
    const a = setup(4, 30);
    const fit = fitClusters(a.points, { seed: 1 });
    const same = a.points.map((_, i) => ({ ts: i, origin: 'https://www.youtube.com', path: '/shorts/x' }));
    const r = buildTerritories({ fit, samples: same, old: [], now: 1, newId: a.newId });
    const names = r.territories.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('youtube.com · shorts');
    expect(names).toContain('youtube.com · shorts 2');
    // a confirmed territory keeps its name and others avoid it
    const kept = r.territories.map((t, i) => (i === 0 ? { ...applyLabel(t, 'drain'), name: 'youtube.com · shorts' } : t));
    const again = buildTerritories({ fit, samples: same, old: kept, now: 2, newId: a.newId });
    expect(again.territories.find((t) => t.id === kept[0]!.id)!.name).toBe('youtube.com · shorts');
    expect(new Set(again.territories.map((t) => t.name)).size).toBe(again.territories.length);
  });
});

describe('assignSample', () => {
  const mk = (id: string, c: number[], radius?: number): TerritoryRecord => ({
    id, centroid: Float32Array.from(c), size: 1, name: id, topicTags: [], suggestedLabel: null, label: null, labelConfirmed: false, allowanceMin: null, firstSeen: 0, lastSeen: 0, radius,
  });
  it('assigns the nearest centroid within the radius', () => {
    const r = assignSample(Float32Array.from([0.9, 0.1]).map((x) => x / Math.hypot(0.9, 0.1)), [mk('a', [1, 0], 0.1), mk('b', [0, 1], 0.1)]);
    expect(r.territoryId).toBe('a');
    expect(r.territoryDist).toBeLessThan(0.1);
  });
  it('marks a far sample unassigned but keeps its distance', () => {
    const r = assignSample(Float32Array.from([Math.SQRT1_2, Math.SQRT1_2]), [mk('a', [1, 0], 0.1), mk('b', [0, 1], 0.1)]);
    expect(r.territoryId).toBeNull();
    expect(r.territoryDist).toBeCloseTo(1 - Math.SQRT1_2, 4);
  });
  it('ignores territories of a different dimension (768d dev rows vs 256d)', () => {
    expect(assignSample(Float32Array.from([1, 0, 0]), [mk('a', [1, 0])]).territoryId).toBeNull();
  });
});

describe('carryTerritories', () => {
  it('gives vectorless samples the previous sample territory', () => {
    const rows = [
      { vector: {}, territoryId: 'a' as string | null },
      { vector: null, territoryId: null as string | null },
      { vector: null, territoryId: null as string | null },
      { vector: {}, territoryId: 'b' as string | null },
      { vector: null, territoryId: null as string | null },
    ];
    expect(carryTerritories(rows).map((r) => r.territoryId)).toEqual(['a', 'a', 'a', 'b', 'b']);
  });
  it('carries null across unassigned samples and uses the initial value', () => {
    const rows = [{ vector: null, territoryId: null as string | null }, { vector: {}, territoryId: null as string | null }, { vector: null, territoryId: 'x' as string | null }];
    expect(carryTerritories(rows, 'z').map((r) => r.territoryId)).toEqual(['z', null, null]);
  });
});

describe('binTerritories', () => {
  const B = 30_000;
  it('takes the territory covering most of the bin', () => {
    const samples = [
      { ts: 0, dwellMs: 10_000, territoryId: 'a' },
      { ts: 10_000, dwellMs: 20_000, territoryId: 'b' },
    ];
    expect(binTerritories([0], samples, B).get(0)).toBe('b');
  });
  it('uses the next sample when dwell is unknown and carries across a quiet bin', () => {
    const samples = [{ ts: 0, dwellMs: 0, territoryId: 'a' }];
    const m = binTerritories([0, B, 2 * B], samples, B);
    expect(m.get(0)).toBe('a');
    expect(m.get(B)).toBe('a');
    expect(m.get(2 * B)).toBe('a');
  });
  it('does not carry past 5 minutes', () => {
    const samples = [{ ts: 0, dwellMs: 1000, territoryId: 'a' }];
    expect(binTerritories([10 * 60_000], samples, B).get(10 * 60_000)).toBeNull();
  });
  it('is null without samples', () => {
    expect(binTerritories([0], [], B).get(0)).toBeNull();
  });
});

describe('isReclusterDue', () => {
  const H = 3600_000;
  const at = (h: number, day = 10) => new Date(2026, 9, day, h, 0, 0).getTime();
  it('waits for 300 vectors before the first run', () => {
    expect(isReclusterDue(EMPTY_META, 299, at(12))).toBe(false);
    expect(isReclusterDue(EMPTY_META, 300, at(12))).toBe(true);
  });
  it('re-runs every 2 h during day 1', () => {
    const meta = { ...EMPTY_META, firstRunAt: at(10), lastRunAt: at(10) };
    expect(isReclusterDue(meta, 999, at(10) + 1.9 * H)).toBe(false);
    expect(isReclusterDue(meta, 999, at(10) + 2 * H)).toBe(true);
  });
  it('then runs once per night after 03:00 local', () => {
    const meta = { ...EMPTY_META, firstRunAt: at(10, 8), lastRunAt: at(21, 10) };
    expect(isReclusterDue(meta, 999, at(23, 10))).toBe(false);
    expect(isReclusterDue(meta, 999, at(2, 11))).toBe(false);
    expect(isReclusterDue(meta, 999, at(3, 11))).toBe(true);
    expect(isReclusterDue({ ...meta, lastRunAt: at(3, 11) + 1 }, 999, at(15, 11))).toBe(false);
  });
  it('lastNightlyBoundary is 03:00 today or yesterday', () => {
    expect(lastNightlyBoundary(at(12, 10))).toBe(at(3, 10));
    expect(lastNightlyBoundary(at(1, 10))).toBe(at(3, 9));
  });
});

describe('applyLabel', () => {
  it('confirms and gives Drain the default allowance, clears it otherwise', () => {
    const t = { id: 'a', allowanceMin: null, label: null, labelConfirmed: false } as unknown as TerritoryRecord;
    const d = applyLabel(t, 'drain');
    expect(d).toMatchObject({ label: 'drain', labelConfirmed: true, allowanceMin: 15 });
    expect(applyLabel({ ...d, allowanceMin: 30 }, 'drain').allowanceMin).toBe(30);
    expect(applyLabel(d, 'deep').allowanceMin).toBeNull();
  });
});

it('meanUnit is exported for centroid maths', () => expect(meanUnit).toBeTypeOf('function'));
