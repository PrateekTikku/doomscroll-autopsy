import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { count, DB_NAME, DB_VERSION, openDb } from '@/lib/db';
import { clearRecorder, exportJsonl, recorderCount } from '@/lib/replay/recorder';
import { getSettings, onSettingsChanged, updateSettings } from '@/lib/settings';
import { Evidence } from './evidence';
import { ReplayPanel } from './replay';
import { AttentionMap } from './map';
import { NudgeSettings } from './nudge-settings';
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
      <div class="card-head"><h2>Developer</h2></div>
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

const TABS = [
  { id: 'overview', label: 'Overview', sections: ['today', 'autopsy', 'success'] },
  { id: 'territories', label: 'Territories', sections: ['territories', 'map'] },
  { id: 'prediction', label: 'Prediction', sections: ['prediction', 'nudges', 'gru'] },
  { id: 'privacy', label: 'Privacy', sections: ['privacy'] },
  { id: 'developer', label: 'Developer', sections: ['developer', 'evidence'] },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** `#territories` opens the Territories tab; `#privacy`, `#map`, `#gru`... open the tab that holds that section; `#all` shows every tab (probes, printing). */
function tabFromHash(hash: string): TabId | 'all' {
  const h = hash.replace(/^#/, '');
  if (h === 'all') return 'all';
  const hit = TABS.find((t) => t.id === h || (t.sections as readonly string[]).includes(h));
  return hit?.id ?? 'overview';
}

function Dashboard() {
  const [stores, setStores] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const [tab, setTab] = useState<TabId | 'all'>(() => tabFromHash(location.hash));

  useEffect(() => {
    void getSettings().then((s) => setDev(s.devMode));
    const off = onSettingsChanged((s) => setDev(s.devMode));
    openDb()
      .then((db) => setStores([...db.objectStoreNames]))
      .catch((err: Error) => setError(err.message));
    const onHash = () => setTab(tabFromHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => {
      off();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const go = (id: TabId) => {
    history.replaceState(null, '', `#${id}`);
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  const show = (id: TabId) => tab === 'all' || tab === id;

  return (
    <main class="dash">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12h4l3-8 4 16 3-8h4" />
            </svg>
          </div>
          <div>
            <h1>Doomscroll Autopsy</h1>
            <div class="tagline">Protect your deep work from the feed</div>
          </div>
        </div>
        <div class="spacer" />
        <a class="pill" href="onboarding.html">How it works</a>
      </header>

      <nav class="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div class="panel" id="panel-overview" hidden={!show('overview')}>
        <Today />
      </div>

      <div class="panel" id="panel-territories" hidden={!show('territories')}>
        <div class="grid g-main" style="align-items:start">
          <Territories />
          <AttentionMap />
        </div>
      </div>

      <div class="panel" id="panel-prediction" hidden={!show('prediction')}>
        <div class="grid">
          <ReplayPanel />
          <NudgeSettings />
        </div>
      </div>

      <div class="panel" id="panel-privacy" hidden={!show('privacy')}>
        <Privacy />
      </div>

      <div class="panel" id="panel-developer" hidden={!show('developer')}>
        <div class="grid">
          {dev && <Evidence />}
          <Developer />
          <p class="muted">
            IndexedDB <code>{DB_NAME}</code> v{DB_VERSION}: {error ? <span class="bad">{error}</span> : stores ? stores.join(', ') : 'opening…'}
          </p>
        </div>
      </div>
    </main>
  );
}

render(<Dashboard />, document.getElementById('app')!);
