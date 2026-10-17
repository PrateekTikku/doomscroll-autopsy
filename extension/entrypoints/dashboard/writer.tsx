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
    <div class="muted small" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:2px 16px">
      <span>
        {writerLine(o.status)} · {o.modelName}
      </span>
      <span>{statsLine('Names', o.stats.naming)}</span>
      <span>{statsLine('Autopsies', o.stats.autopsy)}</span>
    </div>
  );
}
