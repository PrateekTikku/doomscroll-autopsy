import { useEffect, useState } from 'preact/hooks';
import '@/lib/gen/messages';
import type { GenOverview } from '@/lib/gen/messages';
import { statsLine, writerLine } from '@/lib/gen/labels';
import { send } from '@/lib/messaging';

/** A quiet footer about the on-device writer: its state and how often its text passed the checks. */
export function Writer() {
  const [o, setO] = useState<GenOverview | null>(null);
  useEffect(() => {
    const load = () => void send('background', 'gen-overview').then(setO).catch(() => undefined);
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);
  if (!o) return null;
  return (
    <div class="muted" style={{ fontSize: 12, marginTop: 8 }}>
      <div>
        {writerLine(o.status)} · {o.modelName}
      </div>
      <div>{statsLine('Names', o.stats.naming)}</div>
      <div>{statsLine('Autopsies', o.stats.autopsy)}</div>
    </div>
  );
}
