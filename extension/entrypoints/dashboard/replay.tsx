import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { openDb } from '@/lib/db';
import { send } from '@/lib/messaging';
import type { GruEvalRecord } from '@/lib/ml/gru-promote';
import '@/lib/ml/gru-messages';
import type { EvalResult, ModeMetrics } from '@/lib/ml/eval';
import { evaluateOnStoredData, getStoredEval, getStoredMode, refreshPrediction, type ModeRecord } from '@/lib/ml/evaluate';
import { mountNudge, type MountedNudge } from '@/lib/nudge/ui';
import { deliverToActiveTab } from '@/lib/nudge/service';
import { createPlayer, demoDay, DEMO_EXPECTED, DEMO_SPEED_DEFAULT } from '@/lib/replay/demo';
import { createReplayEngine, parseJsonl, replayAll, routesFromSamples, type ReplayNudge } from '@/lib/replay/replayer';
import { evaluateSynthetic, evaluationMarkdown } from '@/lib/replay/synthetic-eval';
import { getSettings } from '@/lib/settings';

const pct = (x: number | null) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null) => (x == null ? 'n/a' : x.toFixed(3));
const SPLIT_TEXT: Record<EvalResult['split'], string> = {
  'latest-day': 'trained on earlier days, tested on the latest day',
  'within-day-70-30': 'only one day of data so far: trained on the first 70% of it, tested on the last 30%',
  none: 'not enough data yet (needs about 30 minutes of bins)',
};

function EvalTable({ e }: { e: EvalResult }) {
  const row = (name: string, m: ModeMetrics) => (
    <tr>
      <td>{name}</td>
      <td>{pct(m.top1)}</td>
      <td>{pct(m.top3)}</td>
      <td>{pct(m.switchTop3)}</td>
      <td>{num(m.auc)}</td>
      <td>
        {m.positives}/{m.nScore}
      </td>
    </tr>
  );
  return (
    <>
      <p class="muted">
        {new Date(e.ranAt).toLocaleString()} · {SPLIT_TEXT[e.split]} · {e.trainBins} train / {e.testBins} test bins
      </p>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Next top-1</th>
            <th>Top-3</th>
            <th>Top-3 on switches</th>
            <th>Spiral AUC</th>
            <th>Spirals</th>
          </tr>
        </thead>
        <tbody>
          {row('Rules (baseline)', e.rules)}
          {row('Markov', e.markov)}
        </tbody>
      </table>
      <p class="muted">AUC is n/a when the test part has no Drain time beyond the allowance (or only that).</p>
    </>
  );
}

const minutesText = (virtualMin: number) => `${Math.floor(virtualMin)}:${String(Math.round((virtualMin % 1) * 60)).padStart(2, '0')}`;

const pct1 = (x: number | null) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

/** The GRU's latest held-out comparison with Markov and the promotion verdict (PDD 9.6, D-20). */
function GruPanel({ onChange }: { onChange: () => void | Promise<void> }) {
  const [rec, setRec] = useState<GruEvalRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void send('background', 'gru-status').then(setRec).catch(() => undefined);
  }, []);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setRec(await send('background', 'gru-run'));
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="gru">
      <h3>GRU (nightly, promoted only if it beats Markov)</h3>
      {rec ? (
        <>
          <p>
            <strong>{rec.promoted ? 'Running' : 'Not running'}</strong> <span class="muted">· {rec.reason}</span>
          </p>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th class="num">AUC</th>
                <th class="num">Next top-1</th>
                <th class="num">Next top-3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GRU</td>
                <td class="num">{rec.gruAuc == null ? 'n/a' : rec.gruAuc.toFixed(3)}</td>
                <td class="num">{pct1(rec.gruTop1)}</td>
                <td class="num">{pct1(rec.gruTop3)}</td>
              </tr>
              <tr>
                <td>Markov</td>
                <td class="num">{rec.markovAuc == null ? 'n/a' : rec.markovAuc.toFixed(3)}</td>
                <td class="num">{pct1(rec.markovTop1)}</td>
                <td class="num">{pct1(rec.markovTop3)}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted">
            Trained on {rec.trainWindows} windows in {(rec.trainMs / 1000).toFixed(0)} s ({rec.backend}); tested on {rec.testBins} bins of the latest day.
          </p>
        </>
      ) : (
        <p class="muted">Not trained yet. It needs at least two days of history; it trains nightly and you can run it now.</p>
      )}
      <div class="row">
        <button class="small" onClick={() => void run()} disabled={busy}>
          {busy ? 'Training…' : 'Train GRU now'}
        </button>
      </div>
      {error && <p class="bad">{error}</p>}
    </div>
  );
}

/** Mode, evaluation and replay tools (M4). Replays run here, in memory, and never write to the stored data. */
export function ReplayPanel() {
  const [mode, setMode] = useState<ModeRecord | null>(null);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [synthetic, setSynthetic] = useState<string | null>(null);
  const [speed, setSpeed] = useState(DEMO_SPEED_DEFAULT);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [fileResult, setFileResult] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shown = useRef<MountedNudge | null>(null);

  const reload = async () => {
    setMode(await getStoredMode());
    setEvalResult(await getStoredEval());
  };
  useEffect(() => {
    void refreshPrediction().then(reload).catch(reload);
    return () => {
      if (timer.current) clearInterval(timer.current);
      void browser.storage.session.set({ 'replay-active': false });
    };
  }, []);

  const evaluate = async () => {
    setBusy('Evaluating…');
    try {
      await refreshPrediction(Date.now(), true);
      setEvalResult(await evaluateOnStoredData());
      setMode(await getStoredMode());
    } finally {
      setBusy(null);
    }
  };

  const runSynthetic = () => {
    setBusy('Running 6 personas × 14 days…');
    setTimeout(() => {
      setSynthetic(evaluationMarkdown(evaluateSynthetic({ days: 14 })));
      setBusy(null);
    }, 30);
  };

  const showNudge = async (n: ReplayNudge) => {
    const delivered = await deliverToActiveTab(n.payload);
    if (!delivered) {
      // The active tab can't show it (this tab, a blocklisted page): draw it here instead.
      shown.current?.close();
      shown.current = mountNudge(document, n.payload, () => (shown.current = null));
    }
  };

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    shown.current?.close();
    setRunning(false);
    await browser.storage.session.set({ 'replay-active': false });
  };

  const startDemo = async () => {
    setLog([]);
    setProgress(0);
    const v0 = Date.now() - 80 * 60_000;
    const day = demoDay(v0);
    const settings = await getSettings();
    const engine = createReplayEngine({
      territories: day.territories,
      routes: day.routes,
      settings: { sensitivity: settings.sensitivity, maxNudgeStep: settings.maxNudgeStep },
      onNudge: (n) => {
        const at = (n.ts - day.startTs) / 60_000;
        setLog((l) => [...l, `${minutesText(at)} replay time · step ${n.step} (${n.step === 1 ? 'banner' : 'blur'}) · score ${n.score.toFixed(2)} · ${n.territory}`]);
        void showNudge(n);
      },
    });
    const player = createPlayer(day.events, engine);
    const r0 = Date.now();
    await browser.storage.session.set({ 'replay-active': true });
    setRunning(true);
    timer.current = setInterval(() => {
      player.advanceTo(day.startTs + (Date.now() - r0) * speed);
      setProgress(player.progress);
      if (player.finished) void stop();
    }, 250);
  };

  const loadRecording = async (file: File) => {
    setBusy('Replaying…');
    try {
      const events = parseJsonl(await file.text());
      // Territories come from the stored samples: only origin, path and territory are read.
      const db = await openDb();
      const rows: Array<{ origin: string; path: string; territoryId: string | null }> = [];
      let cursor = await db.transaction('samples').store.openCursor();
      while (cursor) {
        const { origin, path, territoryId } = cursor.value;
        rows.push({ origin, path, territoryId });
        cursor = await cursor.continue();
      }
      const territories = (await db.getAll('territories')).map((t) => ({
        id: t.id,
        name: t.name,
        label: (t.label ?? t.suggestedLabel ?? 'shallow') as 'deep' | 'shallow' | 'drain',
        allowanceMin: t.allowanceMin,
      }));
      const s = await getSettings();
      const r = replayAll(events, { territories, routes: routesFromSamples(rows), settings: { sensitivity: s.sensitivity, maxNudgeStep: s.maxNudgeStep } });
      setFileResult(
        `${events.length} events → ${r.bins.length} bins, ${r.nudges.length} nudges` +
          (r.nudges.length ? ': ' + r.nudges.map((n) => `step ${n.step} at ${new Date(n.ts).toLocaleTimeString()} (score ${n.score.toFixed(2)})`).join('; ') : ''),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id="prediction" class="grid g2" style="align-items:start">
    <section class="card">
      <div class="card-head">
        <h2>Prediction and replay</h2>
        <span class="pill accent">{mode ? ({ markov: 'Markov', gru: 'GRU', rules: 'Rules' } as const)[mode.mode] : '…'}</span>
      </div>
      <p>
        Active mode: <strong>{mode ? ({ markov: 'Markov', gru: 'GRU', rules: 'Rules' } as const)[mode.mode] : '…'}</strong>
        {mode && <span class="muted small"> · {mode.reason}</span>}
      </p>

      <GruPanel onChange={reload} />

      <h3>Rules vs Markov on your data</h3>
      {evalResult ? <EvalTable e={evalResult} /> : <p class="muted">Not evaluated yet.</p>}
      <div class="row">
        <button class="small primary" onClick={evaluate} disabled={busy != null}>
          Evaluate on my data
        </button>
        <button class="small" onClick={runSynthetic} disabled={busy != null}>
          Synthetic evaluation (6 personas × 14 days)
        </button>
        {busy && <span class="muted">{busy}</span>}
      </div>
      {synthetic && <pre class="muted">{synthetic}</pre>}
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Demo mode</h2>
        <span class="pill">a replay, nothing stored</span>
      </div>
      <p class="muted small">
        Plays a prepared 80-minute day at {speed}× (about {Math.round(80 / speed * 60)} s): docs, a Slack break, then a Shorts spiral. A banner is due around minute {DEMO_EXPECTED.bannerAtMin}, the blur around {DEMO_EXPECTED.blurAtMin}.
        Open the page you want it on (or stay here); nudges carry a <strong>Replay</strong> label.
      </p>
      <div class="row">
        <select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))} disabled={running}>
          <option value={30}>30×</option>
          <option value={60}>60×</option>
          <option value={120}>120×</option>
        </select>
        {running ? <button onClick={stop}>Stop</button> : <button class="primary" onClick={startDemo}>Start demo</button>}
        {running && <span class="warn">Replay running · {Math.round(progress * 100)}%</span>}
      </div>
      {log.length > 0 && (
        <ul class="muted">
          {log.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <h3>Replay a recording</h3>
      <p class="muted small">Pick a JSONL recording from Developer → Download recording. Its events go through the pipeline in memory.</p>
      <input type="file" accept=".jsonl,.ndjson,application/x-ndjson,text/plain" onChange={(e) => (e.target as HTMLInputElement).files?.[0] && void loadRecording((e.target as HTMLInputElement).files![0]!)} />
      {fileResult && <p class="muted">{fileResult}</p>}
    </section>
    </div>
  );
}

