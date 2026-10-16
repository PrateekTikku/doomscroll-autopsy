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
const LEFT = 170;
const RIGHT = 12;
const LANE_H = 18;
const LANE_GAP = 3;
const TOP = 26;
const VEL_H = 56;
const COLOR: Record<Label | 'other', string> = { deep: 'var(--deep)', shallow: 'var(--shallow)', drain: 'var(--drain)', other: 'var(--muted)' };
const RESPONSE_TEXT = { back: 'went back to it', snooze: 'snoozed', ignored: 'ignored' } as const;

export function TimelineChart({ model }: { model: TimelineModel }) {
  if (!model.hasData) return <p class="muted">No browsing recorded for this day yet.</p>;
  const lanesH = model.lanes.length * (LANE_H + LANE_GAP);
  const velTop = TOP + lanesH + 22;
  const height = velTop + VEL_H + 22;
  const span = model.to - model.from;
  const x = (ts: number) => LEFT + ((ts - model.from) / span) * (W - LEFT - RIGHT);
  const laneY = (i: number) => TOP + i * (LANE_H + LANE_GAP);

  const hours: number[] = [];
  for (let t = new Date(model.from).setMinutes(0, 0, 0); t <= model.to; t += 3600_000) if (t >= model.from) hours.push(t);
  const step = hours.length > 14 ? 2 : 1;

  const vy = (v: number) => velTop + VEL_H - (model.maxVelocity ? (v / model.maxVelocity) * (VEL_H - 4) : 0);
  const path = model.velocity.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${vy(p.itemsPerMin).toFixed(1)}`).join(' ');

  return (
    <div>
      <svg class="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Timeline: ${model.lanes.length} territories, ${model.blocks.length} deep blocks, ${model.nudges.length} nudges`}>
        {hours.map((t, i) =>
          i % step === 0 ? (
            <g key={t}>
              <line class="grid" x1={x(t)} x2={x(t)} y1={TOP - 4} y2={velTop + VEL_H} />
              <text x={x(t)} y={12} text-anchor="middle">
                {clock(t)}
              </text>
            </g>
          ) : null,
        )}

        {model.lanes.map((l, i) => (
          <g key={l.key}>
            <text x={LEFT - 8} y={laneY(i) + LANE_H - 5} text-anchor="end">
              {l.name.length > 24 ? `${l.name.slice(0, 23)}…` : l.name}
              <title>{`${l.name} (${l.label})`}</title>
            </text>
            <line class="grid" x1={LEFT} x2={W - RIGHT} y1={laneY(i) + LANE_H + LANE_GAP / 2} y2={laneY(i) + LANE_H + LANE_GAP / 2} />
          </g>
        ))}
        {model.segments.map((s, i) => {
          const lane = model.lanes[s.lane]!;
          return (
            <rect key={i} x={x(s.startTs)} y={laneY(s.lane)} width={Math.max(1.5, x(s.endTs) - x(s.startTs))} height={LANE_H} rx={2} fill={COLOR[lane.label]}>
              <title>{`${lane.name} (${lane.label}) ${clock(s.startTs)}–${clock(s.endTs)}`}</title>
            </rect>
          );
        })}

        {model.blocks.map((b, i) => (
          <g key={i}>
            <rect x={x(b.startTs)} y={TOP - 3} width={Math.max(2, x(b.endTs) - x(b.startTs))} height={lanesH + 3} fill="none" stroke="var(--fg)" stroke-width={2} stroke-dasharray="5 3" rx={3}>
              <title>{`Deep block ${clock(b.startTs)}–${clock(b.endTs)}, ${b.minutes} min`}</title>
            </rect>
          </g>
        ))}

        <text x={LEFT - 8} y={velTop + 12} text-anchor="end">
          items / min
        </text>
        <text x={LEFT - 8} y={velTop + 26} text-anchor="end">
          (peak {model.maxVelocity})
        </text>
        <line class="grid" x1={LEFT} x2={W - RIGHT} y1={velTop + VEL_H} y2={velTop + VEL_H} />
        {path && <path d={path} fill="none" stroke="var(--fg)" stroke-width={1.5} />}
        {model.velocity.map((p) => (
          <circle key={p.ts} cx={x(p.ts)} cy={vy(p.itemsPerMin)} r={2} fill="var(--fg)">
            <title>{`${clock(p.ts)}: ${p.itemsPerMin} items per minute`}</title>
          </circle>
        ))}

        {model.nudges.map((n, i) => (
          <g key={i} transform={`translate(${x(n.ts)},${TOP + lanesH + 8})`}>
            <path d="M0,0 L6,11 L-6,11 Z" fill={n.response === 'back' ? 'var(--ok)' : 'var(--bad)'} stroke="var(--bg)" stroke-width={1}>
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
        <span>
          <i class="swatch" style={{ background: COLOR.other }} />
          Not labelled yet
        </span>
        <span>┅ dashed outline: deep block</span>
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
