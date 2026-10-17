import { useEffect, useState } from 'preact/hooks';
import type { Label } from '@/lib/db';
import { clock } from '@/lib/metrics/time';
import { loadTimeline } from '@/lib/metrics/service';
import type { TimelineModel } from '@/lib/metrics/timeline';

/**
 * Today's timeline (PDD 4.4): one lane per territory coloured by label, the content-velocity line,
 * deep blocks outlined and nudge markers. Away time is a plain gap: nothing is drawn or labelled.
 * Plain SVG, no chart library.
 */
const W = 1000;
const LEFT = 64;
const RIGHT = 10;
const LANE_H = 26;
const LANE_GAP = 6;
const TOP = 30;
const VEL_H = 64;
const COLOR: Record<Label | 'other', string> = { deep: 'var(--deep)', shallow: 'var(--shallow)', drain: 'var(--drain)', other: 'var(--muted)' };
const RESPONSE_TEXT = { back: 'went back to it', snooze: 'snoozed', ignored: 'ignored' } as const;
const ROW_NAME: Record<Label | 'other', string> = { deep: 'Deep', shallow: 'Shallow', drain: 'Drain', other: 'Unassigned' };

/** One lane per label (Deep, Shallow, Drain; "Other" only if something is unlabelled), territories in the tooltips. */
export function TimelineChart({ model }: { model: TimelineModel }) {
  if (!model.hasData) return <p class="muted">No browsing recorded for this day yet.</p>;
  const rowsPresent = (['deep', 'shallow', 'drain', 'other'] as const).filter((l) => (l === 'other' ? model.lanes.filter((x) => x.label !== 'deep' && x.label !== 'shallow' && x.label !== 'drain').reduce((m, x) => m + x.seconds, 0) >= 600 : true));
  const lanesH = rowsPresent.length * (LANE_H + LANE_GAP);
  const velTop = TOP + lanesH + 14;
  const height = velTop + VEL_H + 22;
  const span = model.to - model.from;
  const x = (ts: number) => LEFT + ((ts - model.from) / span) * (W - LEFT - RIGHT);
  const laneY = (i: number) => TOP + i * (LANE_H + LANE_GAP);

  const hours: number[] = [];
  for (let t = new Date(model.from).setMinutes(0, 0, 0); t <= model.to; t += 3600_000) if (t >= model.from) hours.push(t);
  const step = hours.length > 14 ? 2 : 1;

  const vy = (v: number) => velTop + VEL_H - (model.maxVelocity ? (v / model.maxVelocity) * (VEL_H - 6) : 0);
  const pts = model.velocity.map((p) => `${x(p.ts).toFixed(1)},${vy(p.itemsPerMin).toFixed(1)}`);
  const line = pts.length ? `M${pts.join(' L')}` : '';
  const area = pts.length ? `${line} L${x(model.velocity[model.velocity.length - 1]!.ts).toFixed(1)},${velTop + VEL_H} L${x(model.velocity[0]!.ts).toFixed(1)},${velTop + VEL_H} Z` : '';

  return (
    <div>
      <svg class="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Timeline: ${model.lanes.length} territories, ${model.blocks.length} deep blocks, ${model.nudges.length} nudges`}>
        <defs>
          <linearGradient id="vel-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        {hours.map((t, i) =>
          i % step === 0 ? (
            <g key={t}>
              <line class="grid" x1={x(t)} x2={x(t)} y1={TOP - 6} y2={velTop + VEL_H} />
              <text x={x(t)} y={14} text-anchor="middle">
                {clock(t)}
              </text>
            </g>
          ) : null,
        )}

        {rowsPresent.map((l, i) => (
          <g key={l}>
            <rect x={LEFT} y={laneY(i)} width={W - LEFT - RIGHT} height={LANE_H} rx={6} fill="var(--surface-2)" />
            <text x={LEFT - 10} y={laneY(i) + LANE_H / 2 + 4} text-anchor="end" style="font-weight:650">
              {ROW_NAME[l]}
            </text>
          </g>
        ))}
        {model.segments.map((s, i) => {
          const lane = model.lanes[s.lane]!;
          const l = (lane.label as Label | 'other') ?? 'other';
          if (rowsPresent.indexOf(l) < 0) return null;
          return (
            <rect key={i} x={x(s.startTs)} y={laneY(rowsPresent.indexOf(l)) + 3} width={Math.max(1.5, x(s.endTs) - x(s.startTs))} height={LANE_H - 6} rx={3} fill={COLOR[l] ?? COLOR.other} opacity={0.92}>
              <title>{`${lane.name} (${ROW_NAME[l] ?? 'Other'}) ${clock(s.startTs)}–${clock(s.endTs)}`}</title>
            </rect>
          );
        })}

        {model.blocks.map((b, i) => (
          <g key={i}>
            <rect x={x(b.startTs)} y={laneY(0) - 2} width={Math.max(2, x(b.endTs) - x(b.startTs))} height={LANE_H + 4} fill="none" stroke="var(--fg)" stroke-width={1.5} stroke-dasharray="5 3" rx={7}>
              <title>{`Deep block ${clock(b.startTs)}–${clock(b.endTs)}, ${b.minutes} min`}</title>
            </rect>
          </g>
        ))}

        <text x={LEFT - 10} y={velTop + 14} text-anchor="end" style="font-weight:650">
          Pace
        </text>
        <text x={LEFT - 10} y={velTop + 28} text-anchor="end">
          items/min
        </text>
        <line class="grid" x1={LEFT} x2={W - RIGHT} y1={velTop + VEL_H} y2={velTop + VEL_H} />
        {area && <path d={area} fill="url(#vel-fill)" />}
        {line && <path d={line} fill="none" stroke="var(--accent)" stroke-width={1.8} stroke-linejoin="round" />}
        {model.velocity.map((p) => (
          <circle key={p.ts} cx={x(p.ts)} cy={vy(p.itemsPerMin)} r={1.6} fill="var(--accent)" opacity={0.0}>
            <title>{`${clock(p.ts)}: ${p.itemsPerMin} items per minute`}</title>
          </circle>
        ))}

        {model.nudges.map((n, i) => (
          <g key={i} transform={`translate(${x(n.ts)},${laneY(rowsPresent.length - 1) + LANE_H + 2})`}>
            <path d="M0,0 L6,11 L-6,11 Z" fill={n.response === 'back' ? 'var(--ok)' : 'var(--bad)'} stroke="var(--surface)" stroke-width={1}>
              <title>{`Nudge ${clock(n.ts)} (step ${n.step}): ${n.response ? RESPONSE_TEXT[n.response] : 'no answer'}`}</title>
            </path>
          </g>
        ))}
      </svg>
      <div class="legend">
        <span>
          <i class="swatch" style={{ background: COLOR.deep }} />
          Deep
        </span>
        <span>
          <i class="swatch" style={{ background: COLOR.shallow }} />
          Shallow
        </span>
        <span>
          <i class="swatch" style={{ background: COLOR.drain }} />
          Drain
        </span>
        <span>┅ deep block</span>
        <span>▲ nudge (green: went back to it)</span>
      </div>
    </div>
  );
}

export function Timeline({ date, refreshMs }: { date: string; refreshMs: number | null }) {
  const [model, setModel] = useState<TimelineModel | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void loadTimeline(date).then((m) => alive && setModel(m));
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [date, refreshMs]);
  return model ? <TimelineChart model={model} /> : <p class="muted">Loading the timeline…</p>;
}
