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

function Tile({ title, big, sub }: { title: string; big: string; sub: string }) {
  return (
    <div class="tile">
      <div class="muted">{title}</div>
      <div class="big">{big}</div>
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
  const week = weekLine(facts);
  return (
    <div>
      <div class="tiles">
        <Tile
          title="Deep blocks"
          big={String(facts.deepBlocks.count)}
          sub={facts.deepBlocks.count ? `longest ${facts.deepBlocks.longestMin} min · ${facts.deepBlocks.totalMin} min in all` : '25+ minutes in Deep, detours ≤ 2 min'}
        />
        <Tile
          title="Attention residue"
          big={`${facts.residue.switchesOutOfDeep} switches`}
          sub={facts.residue.meanMinBackToDeep == null ? 'out of Deep; no return yet' : `out of Deep · ${facts.residue.meanMinBackToDeep} min to get back`}
        />
        <Tile
          title="Drain past allowance"
          big={`${over} min`}
          sub={facts.drainOverAllowance.length ? facts.drainOverAllowance.map((d) => `${d.territory} +${d.minutesOver}`).join(' · ') : 'within every allowance'}
        />
        <Tile
          title="Nudges that worked"
          big={`${facts.nudges.accepted} of ${facts.nudges.shown}`}
          sub={facts.nudges.shown === 0 ? 'no nudges shown' : `${facts.nudges.snoozed} snoozed · ${facts.nudges.ignored} ignored${facts.nudges.medianReturnMin != null ? ` · back in ${facts.nudges.medianReturnMin} min` : ''}`}
        />
      </div>
      <p class="muted">
        Browser time: {t.deep} min Deep · {t.shallow} min Shallow · {t.drain} min Drain{week ? ` · ${week}` : ' · the 7-day comparison appears after 7 days of history'}
      </p>
    </div>
  );
}

/** Product success metrics (PDD 4.7, D-48): the last 7 days. */
export function Success({ m }: { m: SuccessMetrics }) {
  return (
    <div>
      <h2>How it's going (last {plural(m.days, 'day')} with data)</h2>
      <table>
        <tbody>
          <tr>
            <td>Deep blocks per day (want ↑)</td>
            <td>
              <strong>{num(m.avgDeepBlocks)}</strong> on average · longest {m.longestMin} min
            </td>
          </tr>
          <tr>
            <td>Switches out of Deep per day (want ↓)</td>
            <td>
              <strong>{num(m.avgSwitches)}</strong> · {num(m.avgMeanBack, ' min')} to get back
            </td>
          </tr>
          <tr>
            <td>Drain minutes past allowance per day (want ↓)</td>
            <td>
              <strong>{num(m.avgOverMin, ' min')}</strong>
            </td>
          </tr>
          <tr>
            <td>Nudges accepted</td>
            <td>
              <strong>{m.acceptanceRate == null ? '–' : `${Math.round(m.acceptanceRate * 100)}%`}</strong> ({m.nudgesAccepted} of {m.nudgesShown}) · median {num(m.medianReturnMin, ' min')} to return to Deep
            </td>
          </tr>
        </tbody>
      </table>
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
    <>
      <section class="card" id="today">
        <div class="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>{isToday ? 'Today' : 'History'}</h2>
          <label>
            Day{' '}
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
        <h2>Timeline</h2>
        <Timeline date={date} refreshMs={isToday ? REFRESH_MS : null} />
      </section>

      <section class="card" id="autopsy">
        <h2 style={{ marginTop: 0 }}>Autopsy</h2>
        <Autopsy date={date} isToday={isToday} />
        <Writer />
      </section>

      <section class="card" id="success">{success ? <Success m={success} /> : <p class="muted">Loading…</p>}</section>
    </>
  );
}
