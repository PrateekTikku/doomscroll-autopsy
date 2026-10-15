import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DB_NAME, DB_VERSION, openDb } from '@/lib/db';

function Dashboard() {
  const [stores, setStores] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then((db) => setStores([...db.objectStoreNames]))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>Doomscroll Autopsy dashboard</h1>
      <p class="muted">Scaffold (M0). The timeline, territories and autopsy arrive in later milestones.</p>
      <p>
        IndexedDB <code>{DB_NAME}</code> v{DB_VERSION}:{' '}
        {error ? <span class="bad">{error}</span> : stores ? stores.join(', ') : <span class="muted">opening…</span>}
      </p>
    </main>
  );
}

render(<Dashboard />, document.getElementById('app')!);
