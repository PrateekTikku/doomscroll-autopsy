import { useEffect, useState } from 'preact/hooks';
import type { DailyFacts } from '@shared/types';
import { send } from '@/lib/messaging';
import '@/lib/ml/territories-messages';
import { computeDayFacts, datesWithData, successMetrics, type SuccessMetrics } from '@/lib/metrics/service';
import { dateKey } from '@/lib/metrics/time';
import { Autopsy } from './autopsy';
import { Timeline } from './timeline';
import { Writer } from './writer';

const REFRESH_MS = 30_000;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (n: number | null, unit = '') => (n == null ? '–' : `${n}${unit}`);

function Tile({ title, big, unit, sub, cls }: { title: string; big: string; unit?: string; sub: string; cls: string }) {
  return (
    <div class={`tile ${cls}`}>
      <div class="muted">{title}</div>
      <div class="big">
        {big}
        {unit && <small> {unit}</small>}
      </div>
      <div class="sub">{sub}</div>
    </div>
  );
}

export function weekLine(f: DailyFacts): string | null {
  const v = f.vs7Day;
  if (!v) return null;
  const blocks = v.deepBlocksDelta === 0 ? 'the same deep blocks' : `${Math.abs(v.deepBlocksDelta)} ${v.deepBlocksDelta > 0 ? 'more' : 'fewer'} deep blocks`;
  const drain = v.drainOverDelta === 0 ? 'the same time past allowance' : `${Math.abs(v.drainOverDelta)} min ${v.drainOverDelta > 0 ? 'more' : 'less'} past allowance`;
  return `Against your 7-day average: ${blocks}, ${drain}.`;
}

export function Metrics({ facts }: { facts: DailyFacts }) {
  const over = facts.drainOverAllowance.reduce((m, d) => m + d.minutesOver, 0);
  const t = facts.totalsMin;
  const total = Math.max(1, t.deep + t.shallow + t.drain);
  const week = weekLine(facts);
  return (
    <div class="grid" style="gap:14px">
      <div class="tiles">
        <Tile
          cls="t-deep"
          title="Deep blocks"
          big={String(facts.deepBlocks.count)}
          sub={facts.deepBlocks.count ? `longest ${facts.deepBlocks.longestMin} min · ${facts.deepBlocks.totalMin} min in all` : '25+ min in Deep, detours ≤ 2 min'}
        />
        <Tile
          cls="t-shallow"
          title="Attention residue"
          big={String(facts.residue.switchesOutOfDeep)}
          unit="switches"
          sub={facts.residue.meanMinBackToDeep == null ? 'out of Deep, no return yet' : `${facts.residue.meanMinBackToDeep} min on average to get back`}
        />
        <Tile
          cls="t-drain"
          title="Drain past allowance"
          big={String(over)}
          unit="min"
          sub={facts.drainOverAllowance.length ? facts.drainOverAllowance.map((d) => `${d.territory} +${d.minutesOver}`).join(' · ') : 'within every allowance'}
        />
        <Tile
          cls="t-ok"
          title="Nudges that worked"
          big={`${facts.nudges.accepted} of ${facts.nudges.shown}`}
          sub={facts.nudges.shown === 0 ? 'none shown' : `${facts.nudges.snoozed} snoozed · ${facts.nudges.ignored} ignored${facts.nudges.medianReturnMin != null ? ` · back in ${facts.nudges.medianReturnMin} min` : ''}`}
        />
      </div>
      <div class="card" style="padding:14px 18px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <strong>Browser time</strong>
          <span class="muted small">
            <i class="swatch" style="background:var(--deep)" />
            {t.deep} min Deep
            <i class="swatch" style="background:var(--shallow);margin-left:12px" />
            {t.shallow} min Shallow
            <i class="swatch" style="background:var(--drain);margin-left:12px" />
            {t.drain} min Drain
          </span>
        </div>
        <div class="stack" role="img" aria-label={`Deep ${t.deep}, Shallow ${t.shallow}, Drain ${t.drain} minutes`}>
          <i style={`width:${(t.deep / total) * 100}%;background:var(--deep)`} />
          <i style={`width:${(t.shallow / total) * 100}%;background:var(--shallow)`} />
          <i style={`width:${(t.drain / total) * 100}%;background:var(--drain)`} />
        </div>
        <p class="muted small" style="margin:8px 0 0">
          {week ?? 'The 7-day comparison appears after a week of history.'}
        </p>
      </div>
    </div>
  );
}

/** Product success metrics (PDD 4.7, D-48): the last 7 days. */
export function Success({ m }: { m: SuccessMetrics }) {
  const stat = (label: string, value: string, note: string) => (
    <div style="min-width:0">
      <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{label}</div>
      <div style="font-size:20px;font-weight:750;letter-spacing:-0.01em">{value}</div>
      <div class="muted small">{note}</div>
    </div>
  );
  return (
    <div>
      <div class="card-head">
        <h2>How it's going</h2>
        <span class="pill">last {plural(m.days, 'day')} with data</span>
      </div>
      <div class="grid g2" style="gap:14px">
        {stat('Deep blocks per day ↑', num(m.avgDeepBlocks), `longest ${m.longestMin} min`)}
        {stat('Switches out of Deep per day ↓', num(m.avgSwitches), `${num(m.avgMeanBack, ' min')} to get back`)}
        {stat('Drain past allowance per day ↓', num(m.avgOverMin, ' min'), 'minutes beyond your allowance')}
        {stat('Nudges accepted', m.acceptanceRate == null ? '–' : `${Math.round(m.acceptanceRate * 100)}%`, `${m.nudgesAccepted} of ${m.nudgesShown} · median ${num(m.medianReturnMin, ' min')} back to Deep`)}
      </div>
    </div>
  );
}

export function Today() {
  const today = dateKey(Date.now());
  const [date, setDate] = useState(today);
  const [dates, setDates] = useState<string[]>([today]);
  const [facts, setFacts] = useState<DailyFacts | null>(null);
  const [success, setSuccess] = useState<SuccessMetrics | null>(null);
  const isToday = date === today;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      // Bins are assigned to territories by a one-minute sweep; run it so today's numbers are current.
      if (isToday) await send('background', 'territories-sync').catch(() => undefined);
      const [f, s, ds] = await Promise.all([computeDayFacts(date), successMetrics(), datesWithData()]);
      if (!alive) return;
      setFacts(f);
      setSuccess(s);
      setDates([...new Set([today, ...ds])].sort().reverse());
    };
    void load();
    const id = isToday ? setInterval(load, REFRESH_MS) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [date]);

  return (
    <div class="grid" style="gap:18px">
      <section id="today" class="grid" style="gap:14px">
        <div class="row" style="justify-content:space-between">
          <h2 class="page-title">{isToday ? 'Today' : 'History'}</h2>
          <label class="row muted small">
            Day
            <select value={date} onChange={(e) => setDate(e.currentTarget.value)} aria-label="Pick a day">
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d === today ? `Today (${d})` : d}
                </option>
              ))}
            </select>
          </label>
        </div>
        {facts ? <Metrics facts={facts} /> : <p class="muted">Loading…</p>}
        <div class="card">
          <div class="card-head">
            <h2>Timeline</h2>
          </div>
          <Timeline date={date} refreshMs={isToday ? REFRESH_MS : null} />
        </div>
      </section>

      <div class="grid g-main" style="align-items:start">
        <section class="card" id="autopsy">
          <div class="card-head">
            <h2>Autopsy</h2>
          </div>
          <Autopsy date={date} isToday={isToday} />
          <Writer />
        </section>
        <section class="card" id="success">
          {success ? <Success m={success} /> : <p class="muted">Loading…</p>}
        </section>
      </div>
    </div>
  );
}
