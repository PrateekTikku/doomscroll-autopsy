import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';

type Status = { state: 'checking' } | { state: 'ok' } | { state: 'error'; message: string };

function Popup() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });

  useEffect(() => {
    send('background', 'ping-offscreen')
      .then((r) => setStatus(r.ok && r.offscreen ? { state: 'ok' } : { state: 'error', message: r.error ?? 'no reply' }))
      .catch((err: Error) => setStatus({ state: 'error', message: err.message }));
  }, []);

  return (
    <main style={{ width: 300 }}>
      <h1>Doomscroll Autopsy</h1>
      <p class="muted">v{browser.runtime.getManifest().version} · scaffold (M0)</p>
      <p>
        offscreen:{' '}
        {status.state === 'checking' && <span class="muted">checking…</span>}
        {status.state === 'ok' && <span class="ok">ok</span>}
        {status.state === 'error' && <span class="bad">error: {status.message}</span>}
      </p>
      <button onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') })}>
        Open dashboard
      </button>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);
