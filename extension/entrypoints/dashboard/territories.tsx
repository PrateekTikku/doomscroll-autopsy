import { useEffect, useState } from 'preact/hooks';
import type { Label } from '@/lib/db';
import { send } from '@/lib/messaging';
import '@/lib/ml/territories-messages';
import { hostOf } from '@/lib/ml/names';
import { deleteTerritory, loadTerritoryView, setTerritoryAllowance, setTerritoryLabel, type TerritoryView } from '@/lib/ml/territories';

const LABELS: Array<{ label: Label; text: string }> = [
  { label: 'deep', text: 'Deep' },
  { label: 'shallow', text: 'Shallow' },
  { label: 'drain', text: 'Drain' },
];

function Row({ v, onChange }: { v: TerritoryView; onChange: () => void }) {
  const t = v.territory;
  const [allowance, setAllowance] = useState(String(t.allowanceMin ?? 15));
  useEffect(() => setAllowance(String(t.allowanceMin ?? 15)), [t.allowanceMin]);
  const pick = async (label: Label) => {
    await setTerritoryLabel(t.id, label);
    onChange();
  };
  const commit = async () => {
    const n = Number(allowance);
    if (Number.isFinite(n)) await setTerritoryAllowance(t.id, n);
    onChange();
  };
  return (
    <tr class={v.dormant ? 'dormant' : ''}>
      <td>
        <strong>{t.name}</strong>
        {v.dormant && <span class="muted"> · dormant (confirmed earlier, no members now)</span>}
        <div class="muted">
          {v.topOrigins.length ? v.topOrigins.map((o) => `${hostOf(o.origin)} (${o.count})`).join(', ') : 'no recent items'}
        </div>
      </td>
      <td class="num">{t.size}</td>
      <td class="num">{v.todayMin}</td>
      <td>
        <div class="row">
          {LABELS.map(({ label, text }) => (
            <button
              key={label}
              class={`label-btn ${t.label === label ? 'on' : ''} ${t.label !== label && t.suggestedLabel === label && !t.labelConfirmed ? 'suggested' : ''}`}
              aria-pressed={t.label === label}
              onClick={() => pick(label)}
            >
              {text}
            </button>
          ))}
        </div>
        <div class="muted">
          {t.labelConfirmed
            ? 'confirmed'
            : t.suggestedLabel
              ? `suggested: ${t.suggestedLabel} (rule-based). Click to confirm.`
              : 'no suggestion yet'}
        </div>
      </td>
      <td>
        {t.label === 'drain' ? (
          <label>
            <input
              class="allowance"
              type="number"
              min={0}
              max={1440}
              value={allowance}
              onInput={(e) => setAllowance(e.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />{' '}
            min/day
          </label>
        ) : (
          <span class="muted">-</span>
        )}
        {v.dormant && (
          <button
            onClick={async () => {
              await deleteTerritory(t.id);
              onChange();
            }}
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

/** Territory list and labeling (PDD 4.4, milestone M3 task 6). */
export function Territories() {
  const [rows, setRows] = useState<TerritoryView[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => setRows(await loadTerritoryView());

  useEffect(() => {
    void send('background', 'territories-sync').catch(() => undefined).then(refresh);
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const recluster = async () => {
    setBusy(true);
    setStatus('Clustering…');
    try {
      const r = await send('background', 'territories-recluster', { force: true });
      setStatus(
        r.ok
          ? `${r.k} clusters from ${r.samples} items in ${((r.ms ?? 0) / 1000).toFixed(1)} s (${r.matched} kept${r.similarities?.length ? `, weakest match ${Math.min(...r.similarities).toFixed(2)}` : ''}, ${r.created} new${r.dormant ? `, ${r.dormant} dormant` : ''}).`
          : `Not yet: ${r.reason}.`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Territories</h2>
      <p class="muted">
        Groups of what you look at, found by the on-device model. Names are placeholders until the fine-tuned model arrives.
        Suggested labels are rules, not judgements: you decide. Drain time beyond its allowance is what triggers nudges later.
      </p>
      <div class="row">
        <button onClick={recluster} disabled={busy}>
          Re-cluster now
        </button>
        <span class="muted">{status}</span>
      </div>
      {rows == null ? (
        <p class="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p class="muted">
          No territories yet. They appear after about 300 embedded items (roughly two hours of browsing), or press
          Re-cluster now once you have 60.
        </p>
      ) : (
        <table class="territories">
          <thead>
            <tr>
              <th>Territory</th>
              <th class="num">Items</th>
              <th class="num">Today (min)</th>
              <th>Label</th>
              <th>Allowance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <Row key={v.territory.id} v={v} onChange={refresh} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

