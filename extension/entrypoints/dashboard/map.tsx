import { useEffect, useRef, useState } from 'preact/hooks';
import { getAll, getByTs, type Label, type SampleRecord, type TerritoryRecord } from '@/lib/db';
import { layoutPoints, MAP_MAX_POINTS, MAP_MIN_POINTS, nearestPoint, projectUmap, sampleForMap, territoryCentres, type MapPoint } from '@/lib/ml/map';

/** Attention map (PDD 4.4, Should): UMAP of the stored vectors, coloured by label; click a dot to select its territory. */
const DAYS = 14;
const SIZE = 640;
const COLOUR: Record<Label | 'none', string> = { deep: 'var(--deep)', shallow: 'var(--shallow)', drain: 'var(--drain)', none: 'var(--muted)' };

interface Drawn {
  points: MapPoint[];
  territories: TerritoryRecord[];
  totalVectors: number;
}

export function AttentionMap() {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const draw = async () => {
    setError(null);
    setSelected(null);
    setProgress(0);
    try {
      const now = Date.now();
      const samples = (await getByTs('samples', now - DAYS * 86_400_000, now)) as SampleRecord[];
      const territories = (await getAll('territories')) as TerritoryRecord[];
      const input = sampleForMap(samples, MAP_MAX_POINTS);
      if (input.vectors.length < MAP_MIN_POINTS) {
        setDrawn(null);
        setError(`Not enough embedded items yet (${input.vectors.length}; the map needs at least ${MAP_MIN_POINTS}).`);
        return;
      }
      const coords = await projectUmap(input.vectors, { onProgress: setProgress });
      setDrawn({ points: layoutPoints(coords, input.territoryIds, territories), territories, totalVectors: samples.filter((s) => s.vector).length });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const select = (id: string | null) => {
    setSelected(id);
    if (id) {
      // The list may be collapsed or on another tab: ask it to show the row, then scroll to it.
      window.dispatchEvent(new CustomEvent('territory-select', { detail: id }));
      setTimeout(() => {
        const row = document.getElementById(`territory-${id}`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.animate([{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }, { background: 'transparent' }], { duration: 1800 });
      }, 60);
    }
  };

  const onClick = (e: MouseEvent) => {
    if (!drawn || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const i = nearestPoint(drawn.points, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, 0.03);
    select(i >= 0 ? (drawn.points[i]!.territoryId ?? null) : null);
  };

  useEffect(() => {
    void draw(); // draws once on load when there are enough embedded items
  }, []);

  const centres = drawn ? territoryCentres(drawn.points) : null;
  const sel = drawn?.territories.find((t) => t.id === selected) ?? null;

  return (
    <section class="card" id="map" style="position:sticky;top:16px">
      <div class="card-head">
        <h2>Attention map</h2>
        <button class="small" onClick={() => void draw()} disabled={progress != null}>
          {drawn ? 'Redraw' : 'Draw map'}
        </button>
      </div>
      <p class="muted small" style="margin-bottom:8px">
        Every dot is an item from the last {DAYS} days; similar items sit close together (UMAP of the stored vectors, computed here). Click a dot to find its territory.
        {progress != null && <span class="pill accent" style="margin-left:8px">projecting {Math.round(progress * 100)}%</span>}
      </p>
      {error && <p class="warn">{error}</p>}
      {drawn && (
        <>
          <svg
            ref={svg}
            class="chart"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style="max-width:100%;cursor:pointer;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)"
            role="img"
            aria-label="Attention map of recent items, coloured by label"
            onClick={onClick as never}
          >
            {drawn.points.map((p, i) => {
              const dim = selected != null && p.territoryId !== selected;
              return (
                <circle key={i} cx={p.x * SIZE} cy={p.y * SIZE} r={selected != null && !dim ? 4 : 2.6} fill={COLOUR[p.label ?? 'none']} opacity={dim ? 0.12 : 0.75} />
              );
            })}
            {selected && centres?.get(selected) && (
              <circle cx={centres.get(selected)!.x * SIZE} cy={centres.get(selected)!.y * SIZE} r={9} fill="none" stroke="var(--fg)" stroke-width={1.5} />
            )}
          </svg>
          <div class="legend">
            {(['deep', 'shallow', 'drain', 'none'] as const).map((l) => (
              <span key={l}>
                <span class="swatch" style={`background:${COLOUR[l]}`} />
                {l === 'none' ? 'unlabelled' : l[0]!.toUpperCase() + l.slice(1)}
              </span>
            ))}
          </div>
          <p class="muted" id="map-selection">
            {sel
              ? `Selected: ${sel.name} (${sel.label ?? sel.suggestedLabel ?? 'unlabelled'}). ${drawn.points.filter((p) => p.territoryId === sel.id).length} dots.`
              : `${drawn.points.length} dots drawn${drawn.totalVectors > drawn.points.length ? ` (a sample of ${drawn.totalVectors})` : ''}.`}
          </p>
        </>
      )}
    </section>
  );
}
