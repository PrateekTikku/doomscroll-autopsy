import { useEffect, useState } from 'preact/hooks';
import type { DailyFacts } from '@shared/types';
import type { ReportRecord } from '@/lib/db';
import { autopsySourceLabel } from '@/lib/gen/labels';
import { send } from '@/lib/messaging';
import { renderAutopsy } from '@/lib/metrics/autopsy';
import { computeDayFacts, getReport } from '@/lib/metrics/service';
import '@/lib/metrics/messages';

/** The autopsy for a day (PDD 4.6): the stored one, or a live preview of today's, with a button to write it now. */
export function Autopsy({ date, isToday }: { date: string; isToday: boolean }) {
  const [report, setReport] = useState<ReportRecord | null | undefined>(undefined);
  const [preview, setPreview] = useState<{ facts: DailyFacts; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const stored = await getReport(date);
    setReport(stored ?? null);
    if (!stored) {
      const facts = await computeDayFacts(date);
      setPreview({ facts, text: renderAutopsy(facts) });
    } else setPreview(null);
  };

  useEffect(() => {
    setReport(undefined);
    void load();
  }, [date]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await send('background', 'report-generate', { date });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const text = report?.autopsy ?? preview?.text ?? '';
  const facts = report?.facts ?? preview?.facts;
  const source = report ? autopsySourceLabel(report) : 'Preview, not saved yet';

  return (
    <div class="autopsy">
      {report === undefined ? (
        <p class="muted">Loading…</p>
      ) : !facts || (facts.totalsMin.deep + facts.totalsMin.shallow + facts.totalsMin.drain === 0 && facts.deepBlocks.count === 0 && !report) ? (
        <p class="muted">Nothing to write about for this day yet. Browse for a while and come back.</p>
      ) : (
        <>
          {text.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p class="muted">
            <span class="pill">{source}</span>{' '}
            {report?.generatedAt ? `· ${new Date(report.generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
          </p>
        </>
      )}
      <div class="row">
        <button onClick={generate} disabled={busy}>
          {busy ? 'Writing…' : report ? 'Write it again' : isToday ? "Write today's autopsy now" : 'Write this autopsy'}
        </button>
      </div>
      {error && <p class="bad">{error}</p>}
      {facts && (
        <details>
          <summary class="muted">The numbers behind it</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(facts, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
