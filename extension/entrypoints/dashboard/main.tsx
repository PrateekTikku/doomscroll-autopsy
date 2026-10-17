import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { count, DB_NAME, DB_VERSION, openDb } from '@/lib/db';
import { clearRecorder, exportJsonl, recorderCount } from '@/lib/replay/recorder';
import { getSettings, onSettingsChanged, updateSettings } from '@/lib/settings';
import { Evidence } from './evidence';
import { ReplayPanel } from './replay';
import { Privacy } from './privacy';
import { Territories } from './territories';
import { Today } from './today';

/** Dev-mode recorder controls (PDD 7.7). The full dashboard arrives in M3 and M5. */
function Developer() {
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<{ samples: number; bins: number; recorder: number } | null>(null);

  const refresh = async () =>
    setCounts({ samples: await count('samples'), bins: await count('bins'), recorder: await recorderCount() });

  useEffect(() => {
    void getSettings().then((s) => setDevMode(s.devMode));
    void refresh();
    const id = setInterval(refresh, 5000);
    const off = onSettingsChanged((s) => setDevMode(s.devMode));
    return () => {
      clearInterval(id);
      off();
    };
  }, []);

  const download = async () => {
    const blob = new Blob([await exportJsonl()], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doomscroll-recording-${new Date().toISOString().slice(0, 16).replace(':', '')}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clear = async () => {
    if (confirm('Delete all recorded events? Samples and bins are kept.')) {
      await clearRecorder();
      await refresh();
    }
  };

  return (
    <section class="card" id="developer">
      <h2>Developer</h2>
      <label>
        <input
          type="checkbox"
          checked={devMode ?? false}
          disabled={devMode == null}
          onChange={(e) => updateSettings({ devMode: e.currentTarget.checked })}
        />{' '}
        Dev mode: record observer events (never page text or screenshots)
      </label>
      <p class="muted">
        {counts
          ? `${counts.samples} samples · ${counts.bins} bins · ${counts.recorder} recorded events`
          : 'Counting…'}
      </p>
      <div class="row">
        <button onClick={download} disabled={!counts?.recorder}>
          Download recording (JSONL)
        </button>
        <button onClick={clear} disabled={!counts?.recorder}>
          Clear recording
        </button>
      </div>
    </section>
  );
}

function Dashboard() {
  const [stores, setStores] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dev, setDev] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => setDev(s.devMode));
    const off = onSettingsChanged((s) => setDev(s.devMode));
    openDb()
      .then((db) => setStores([...db.objectStoreNames]))
      .catch((err: Error) => setError(err.message));
    return off;
  }, []);

  return (
    <main class="dash">
      <h1>Doomscroll Autopsy</h1>
      <nav class="nav" aria-label="Sections">
        <a href="#today">Today</a>
        <a href="#autopsy">Autopsy</a>
        <a href="#success">How it's going</a>
        <a href="#territories">Territories</a>
        <a href="#privacy">Privacy</a>
        <a href="#prediction">Prediction and replay</a>
        <a href="#developer">Developer</a>
        <a href="onboarding.html">How it works</a>
      </nav>
      <Today />
      <Territories />
      <Privacy />
      <ReplayPanel />
      {dev && <Evidence />}
      <Developer />
      <p class="muted">
        IndexedDB <code>{DB_NAME}</code> v{DB_VERSION}:{' '}
        {error ? <span class="bad">{error}</span> : stores ? stores.join(', ') : <span class="muted">opening…</span>}
      </p>
    </main>
  );
}

render(<Dashboard />, document.getElementById('app')!);
