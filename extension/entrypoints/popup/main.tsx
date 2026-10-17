import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';
import '@/lib/gen/messages';
import type { GenStatus } from '@/lib/gen/messages';
import { writerLine } from '@/lib/gen/labels';
import '@/lib/ml/messages';
import type { EmbedStatusView } from '@/lib/ml/messages';
import '@/lib/nudge/messages';
import type { SpiralStatus } from '@/lib/nudge/messages';
import '@/lib/observer/messages';
import { pauseUntil, type PauseOption } from '@/lib/observer/pause';
import type { LiveStats } from '@/lib/observer/service';
import { popupSummary, type PopupSummary } from '@/lib/metrics/service';
import { isPaused, updateSettings, type Settings } from '@/lib/settings';

const POLL_MS = 2000;
const MODEL_POLL_MS = 4000;
const SUMMARY_POLL_MS = 10_000;

/** One calm line about the on-device model (PDD 4.2 voice). */
export function modelLine(m: EmbedStatusView | null): string {
  if (!m) return 'Model: checking…';
  switch (m.state) {
    case 'downloading':
      return `Model: downloading, ${Math.round(m.percent)}% (one-time, from Hugging Face)`;
    case 'loading':
      return 'Model: starting…';
    case 'ready':
      return `Model: ready${m.medianMs != null ? `, ${Math.round(m.medianMs)} ms per item` : ''}`;
    case 'unloaded':
      return 'Model: asleep (wakes with your next item)';
    case 'error':
      return `Model: unavailable. ${m.error ?? ''}`.trim();
    default:
      return 'Model: starts with your next item';
  }
}

/** The popup's focus metrics (PDD 4.4): deep blocks, attention residue, Drain past allowance, nudges that worked. */
export function summaryLines(m: PopupSummary | null) {
  if (!m) return null;
  return {
    deepBlocks: String(m.deepBlocks),
    deepSub: m.deepBlocks ? `longest ${m.longestMin} min` : 'none yet',
    residue: String(m.switchesOutOfDeep),
    residueSub: m.meanMinBackToDeep == null ? 'switches out of Deep' : `switches · ${m.meanMinBackToDeep} min to get back`,
    drain: `${m.drainOverMin} min`,
    nudges: m.nudgesShown ? `${m.nudgesWorked} of ${m.nudgesShown}` : '–',
    nudgesSub: m.nudgesShown ? (m.medianReturnMin != null ? `back in ${m.medianReturnMin} min` : `${m.nudgesShown} shown`) : 'none shown',
  };
}

/** One line about the prediction mode and the current spiral score (PDD 4.4). */
export function spiralLine(s: SpiralStatus | null): string {
  if (!s) return 'Prediction: checking…';
  const mode = s.mode === 'gru' ? 'GRU' : s.mode === 'markov' ? 'Markov' : 'rules';
  if (s.score == null) return `Mode: ${mode} · spiral score appears while you browse`;
  return `Mode: ${mode} · spiral score ${s.score.toFixed(2)} (nudges at ${s.threshold.toFixed(2)})`;
}

const PAUSE_OPTIONS: Array<[PauseOption, string]> = [
  ['15m', '15 minutes'],
  ['1h', '1 hour'],
  ['tomorrow', 'Until tomorrow'],
  ['forever', 'Until I resume'],
];

function pausedLabel(until: Settings['pausedUntil']): string {
  if (until === 'forever') return 'Paused until you resume';
  const d = new Date(until as number);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Paused until ${sameDay ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`}`;
}

/** The compact state of a model for the footer: a coloured dot and a word. */
function modelDot(state: string | undefined): { cls: string; text: string } {
  switch (state) {
    case 'ready':
      return { cls: 'ok', text: 'ready' };
    case 'downloading':
    case 'loading':
      return { cls: 'warn', text: 'loading' };
    case 'error':
      return { cls: 'warn', text: 'unavailable' };
    case 'unloaded':
      return { cls: '', text: 'asleep' };
    default:
      return { cls: '', text: 'idle' };
  }
}

function Popup() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<EmbedStatusView | null>(null);
  const [spiral, setSpiral] = useState<SpiralStatus | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [summary, setSummary] = useState<PopupSummary | null>(null);
  const [writer, setWriter] = useState<GenStatus | null>(null);

  const refresh = () =>
    send('background', 'live-stats')
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () =>
      send('background', 'embed-status')
        .then(setModel)
        .catch(() => undefined);
    void poll();
    const id = setInterval(poll, MODEL_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () => {
      void send('background', 'spiral-status').then(setSpiral).catch(() => undefined);
      void browser.storage.session
        .get('replay-active')
        .then((r) => setReplaying(r['replay-active'] === true))
        .catch(() => undefined);
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () => void popupSummary().then(setSummary).catch(() => undefined);
    poll();
    const id = setInterval(poll, SUMMARY_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = () => void send('background', 'gen-overview').then((o) => setWriter(o.status)).catch(() => undefined);
    poll();
    const id = setInterval(poll, MODEL_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const pause = async (option: PauseOption | null) => {
    await updateSettings({ pausedUntil: option ? pauseUntil(option) : null });
    await refresh();
  };
  const open = (path: string) => void browser.tabs.create({ url: browser.runtime.getURL(path as never) });

  const lines = summaryLines(summary);
  const paused = stats ? isPaused({ pausedUntil: stats.pausedUntil } as Settings) : false;
  const score = spiral?.score ?? null;
  const modeName = spiral?.mode === 'gru' ? 'GRU' : spiral?.mode === 'markov' ? 'Markov' : 'Rules';
  const embed = modelDot(model?.state);
  const wr = modelDot(writer?.state);

  return (
    <main class="popup">
      <div class="popup-head">
        <div class="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h4l3-8 4 16 3-8h4" />
          </svg>
        </div>
        <div class="grow">
          <h1>Doomscroll Autopsy</h1>
          <div class="popup-status" aria-live="polite">
            <span class={`dot ${paused ? 'warn' : 'ok'}`} />
            {error ? <span class="bad">Can't reach the extension</span> : stats ? (paused ? pausedLabel(stats.pausedUntil) : 'Observing this browser') : 'Loading…'}
          </div>
        </div>
        {paused ? (
          <button class="small" onClick={() => void pause(null)}>
            Resume
          </button>
        ) : (
          <select
            class="small"
            aria-label="Pause observing"
            value=""
            onChange={(e) => {
              const v = e.currentTarget.value as PauseOption | '';
              if (v) void pause(v);
              e.currentTarget.value = '';
            }}
          >
            <option value="">Pause…</option>
            {PAUSE_OPTIONS.map(([option, label]) => (
              <option key={option} value={option}>
                {label}
              </option>
            ))}
          </select>
        )}
        <button class="primary small" onClick={() => open('/dashboard.html')}>
          Dashboard
        </button>
      </div>

      {lines ? (
        <div class="popup-metrics" aria-label="Focus today">
          <div class="mini" style="--tile-accent: var(--deep)">
            <div class="k">Deep blocks</div>
            <div class="v">{lines.deepBlocks}</div>
            <div class="s">{summary && summary.deepBlocks ? `longest ${summary.longestMin}m` : 'none yet'}</div>
          </div>
          <div class="mini" style="--tile-accent: var(--shallow)">
            <div class="k">Switches</div>
            <div class="v">{lines.residue}</div>
            <div class="s">{summary?.meanMinBackToDeep == null ? 'out of Deep' : `${summary.meanMinBackToDeep}m to return`}</div>
          </div>
          <div class="mini" style="--tile-accent: var(--drain)">
            <div class="k">Drain over</div>
            <div class="v">{lines.drain}</div>
            <div class="s">beyond limit</div>
          </div>
          <div class="mini" style="--tile-accent: var(--ok)">
            <div class="k">Nudges</div>
            <div class="v">{lines.nudges}</div>
            <div class="s">{summary?.nudgesShown ? `${summary.nudgesShown} shown` : 'none shown'}</div>
          </div>
        </div>
      ) : (
        <div class="popup-metrics" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} class="mini">
              <div class="k">…</div>
              <div class="v">–</div>
            </div>
          ))}
        </div>
      )}

      <div class="popup-row" title={spiral?.modeReason ?? undefined}>
        <span class="muted small" style="white-space:nowrap">
          Spiral score
        </span>
        <div class="scorebar" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={score ?? 0} aria-label="Spiral score">
          <div class="bar">
            <i style={`width:${Math.round((score ?? 0) * 100)}%`} />
            {spiral && <b style={`left:${Math.round(spiral.threshold * 100)}%`} title={`nudges at ${spiral.threshold.toFixed(2)}`} />}
          </div>
        </div>
        <strong>{score == null ? '–' : score.toFixed(2)}</strong>
        <span class="pill accent">{modeName}</span>
      </div>
      <p class="sr-only">{spiralLine(spiral)}</p>
      {replaying && <p class="warn small" style="margin-top:6px">Replay running: nudges come from a recorded or demo day.</p>}

      <div class="popup-foot">
        <span title={stats ? `${stats.samplesToday} items, ${stats.activeMinToday} active minutes` : undefined}>
          {stats ? `${stats.samplesToday} items · ${stats.activeMinToday} min · ${stats.itemsPerMinNow}/min` : 'no data yet'}
        </span>
        <span title={modelLine(model)}>
          <i class={`dot ${embed.cls}`} /> embedder {embed.text}
        </span>
        <span title={writerLine(writer)}>
          <i class={`dot ${wr.cls}`} /> writer {wr.text}
        </span>
        <a href="#" onClick={(e) => { e.preventDefault(); open('/onboarding.html'); }}>
          How it works
        </a>
      </div>
      <p class="sr-only">{modelLine(model)} {writerLine(writer)} v{browser.runtime.getManifest().version}</p>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
