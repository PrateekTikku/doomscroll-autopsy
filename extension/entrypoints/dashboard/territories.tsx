import { useEffect, useState } from 'preact/hooks';
import type { Label } from '@/lib/db';
import { send } from '@/lib/messaging';
import '@/lib/ml/territories-messages';
import '@/lib/gen/messages';
import { nameSourceLabel } from '@/lib/gen/labels';
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
  const state = t.labelConfirmed ? t.label : t.suggestedLabel;
  return (
    <tr id={`territory-${t.id}`} class={v.dormant ? 'dormant' : ''}>
      <td>
        <div class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start">
          <i class="dot" style={`margin-top:7px;flex:none;background:var(--${state ?? 'muted'}, var(--muted))`} title={state ?? 'no label yet'} />
          <div style="min-width:0">
            <strong>{t.name}</strong>
            <span class="muted small" title="Who wrote this name"> · {nameSourceLabel(t) === 'named by Gemma 3 270M (fine-tuned)' ? 'Gemma 270M' : nameSourceLabel(t)}</span>
            {v.dormant && <span class="muted small"> · dormant</span>}
            {t.topicTags?.length > 0 && (
              <div class="chip-row" title="Zero-shot topics: how close this territory is to each phrase (PDD 9.3)">
                {t.topicTags.map((x) => (
                  <span class="tag" key={x.tag}>
                    {x.tag} {x.score.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
            <div class="muted small" style="margin-top:3px">
              {v.topOrigins.length ? v.topOrigins.map((o) => `${hostOf(o.origin)} (${o.count})`).join(' · ') : 'no recent items'}
            </div>
          </div>
        </div>
      </td>
      <td class="num">
        <strong>{v.todayMin}</strong>
        <span class="muted small"> min today</span>
        <div class="muted small">{t.size} items</div>
      </td>
      <td>
        <div class="seg" role="group" aria-label={`Label for ${t.name}`}>
          {LABELS.map(({ label, text }) => (
            <button
              key={label}
              class={`label-btn ${label} ${t.label === label ? 'on' : ''} ${t.label !== label && t.suggestedLabel === label && !t.labelConfirmed ? 'suggested' : ''}`}
              aria-pressed={t.label === label}
              onClick={() => pick(label)}
            >
              {text}
            </button>
          ))}
        </div>
        <div class="muted small" style="margin-top:4px">
          {t.labelConfirmed ? (
            <>confirmed</>
          ) : t.suggestedLabel ? (
            <>suggested: {t.suggestedLabel}, click to confirm</>
          ) : (
            <>no suggestion yet</>
          )}
          {t.label === 'drain' && (
            <label style="margin-left:8px">
              · allowance{' '}
              <input
                class="allowance small"
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
          )}
          {v.dormant && (
            <button
              class="small"
              style="margin-left:6px"
              onClick={async () => {
                await deleteTerritory(t.id);
                onChange();
              }}
            >
              Delete
            </button>
          )}
        </div>
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

  const nameThem = async () => {
    setBusy(true);
    setStatus('Asking the on-device writer model…');
    try {
      const r = await send('background', 'gen-name-territories', { force: true });
      setStatus(
        r.unavailable
          ? 'The writer model could not run here, so names stay as they were.'
          : `${r.named} named by the model, ${r.fallback} kept their baseline name, ${r.skipped} skipped (${(r.ms / 1000).toFixed(1)} s).`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const counts = (rows ?? []).reduce((m, v) => m.set(v.territory.label ?? v.territory.suggestedLabel ?? 'none', (m.get(v.territory.label ?? v.territory.suggestedLabel ?? 'none') ?? 0) + 1), new Map<string, number>());
  const [all, setAll] = useState(false);
  useEffect(() => {
    const on = () => setAll(true);
    window.addEventListener('territory-select', on);
    return () => window.removeEventListener('territory-select', on);
  }, []);
  const shown = rows && !all ? rows.slice(0, 10) : rows;

  return (
    <section class="card" id="territories">
      <div class="card-head">
        <h2>Territories</h2>
        <div class="row">
          <button class="small" onClick={recluster} disabled={busy}>
            Re-cluster now
          </button>
          <button class="small primary" onClick={nameThem} disabled={busy}>
            Name territories with Gemma
          </button>
        </div>
      </div>
      <p class="muted small" style="margin-bottom:8px">
        What you look at, grouped on-device and named by the fine-tuned Gemma 3 270M. Labels are yours to set; Drain beyond its allowance triggers nudges.
        {status && <span class="pill accent" style="margin-left:8px">{status}</span>}
      </p>
      {rows && rows.length > 0 && (
        <div class="row small muted" style="margin-bottom:6px">
          <span>{rows.length} territories</span>
          {(['deep', 'shallow', 'drain'] as const).map((l) => (
            <span key={l}>
              <i class="swatch" style={`background:var(--${l})`} />
              {counts.get(l) ?? 0} {l}
            </span>
          ))}
        </div>
      )}
      {rows == null ? (
        <p class="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p class="muted">No territories yet. They appear after about 300 embedded items (roughly two hours of browsing), or press Re-cluster now once you have 60.</p>
      ) : (
        <>
          <table class="territories">
            <thead>
              <tr>
                <th>Territory</th>
                <th class="num">Time</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {shown!.map((v) => (
                <Row key={v.territory.id} v={v} onChange={refresh} />
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <div class="row" style="justify-content:center;margin-top:8px">
              <button class="small ghost" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show all ${rows.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
