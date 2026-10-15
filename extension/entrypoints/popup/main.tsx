import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';
import '@/lib/observer/messages';
import { pauseUntil, type PauseOption } from '@/lib/observer/pause';
import type { LiveStats } from '@/lib/observer/service';
import { isPaused, updateSettings, type Settings } from '@/lib/settings';

const POLL_MS = 2000;

const PAUSE_OPTIONS: Array<[PauseOption, string]> = [
  ['15m', '15 min'],
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

function Popup() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const pause = async (option: PauseOption | null) => {
    await updateSettings({ pausedUntil: option ? pauseUntil(option) : null });
    await refresh();
  };

  const paused = stats ? isPaused({ pausedUntil: stats.pausedUntil } as Settings) : false;

  return (
    <main style={{ width: 300 }}>
      <h1>Doomscroll Autopsy</h1>
      {error && <p class="bad">Couldn't reach the extension: {error}</p>}
      <p class={paused ? 'warn' : 'ok'}>{stats ? (paused ? pausedLabel(stats.pausedUntil) : 'Observing this browser') : 'Loading…'}</p>

      <h2>Today</h2>
      <table>
        <tbody>
          <tr>
            <td>Items seen</td>
            <td>
              <strong>{stats?.samplesToday ?? '–'}</strong>
            </td>
          </tr>
          <tr>
            <td>Active minutes</td>
            <td>
              <strong>{stats?.activeMinToday ?? '–'}</strong>
            </td>
          </tr>
          <tr>
            <td>Items per minute now</td>
            <td>
              <strong>{stats?.itemsPerMinNow ?? '–'}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Pause</h2>
      {paused ? (
        <button onClick={() => pause(null)}>Resume now</button>
      ) : (
        <div class="row">
          {PAUSE_OPTIONS.map(([option, label]) => (
            <button key={option} onClick={() => pause(option)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <p>
        <button onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') })}>Open dashboard</button>
      </p>
      <p class="muted">v{browser.runtime.getManifest().version} · observer (M1)</p>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
