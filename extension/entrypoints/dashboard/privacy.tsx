import { useEffect, useState } from 'preact/hooks';
import { getAll, getByTs, type SampleRecord } from '@/lib/db';
import { send } from '@/lib/messaging';
import { pauseUntil, type PauseOption } from '@/lib/observer/pause';
import { addDomain, addKeyword, listEntries, removeEntry } from '@/lib/privacy/blocklist-edit';
import type { ForgetReport } from '@/lib/privacy/forget';
import '@/lib/privacy/messages';
import { RETENTION_CHOICES } from '@/lib/privacy/retention';
import { DEFAULT_SETTINGS, getSettings, isPaused, onSettingsChanged, updateSettings, type Settings } from '@/lib/settings';

/** Privacy controls (PDD 11): pause, forget, always skip, blocklist, retention, titles and wipe. */
const dayStartNow = () => new Date().setHours(0, 0, 0, 0);

function describe(r: ForgetReport): string {
  const bits = [`${r.samples} items`, `${r.bins} half-minute bins`];
  if (r.nudges) bits.push(`${r.nudges} nudges`);
  const tail = [`${r.territoriesUpdated} territories updated`, `${r.territoriesRemoved} removed`, `${r.reportsRegenerated} reports redone`];
  return `Forgot ${bits.join(', ')}. ${tail.join(', ')}.`;
}

const asLocalInput = (ts: number) => {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export function Privacy() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS as Settings);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [site, setSite] = useState('');
  const [alwaysSkip, setAlwaysSkip] = useState(true);
  const [from, setFrom] = useState(asLocalInput(Date.now() - 3600_000));
  const [to, setTo] = useState(asLocalInput(Date.now()));
  const [domainInput, setDomainInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [filter, setFilter] = useState('');
  const [wipeText, setWipeText] = useState('');
  const [log, setLog] = useState<Array<{ ts: number; text: string }>>([]);
  const [recent, setRecent] = useState<SampleRecord[]>([]);

  const refreshRecent = async () => {
    const now = Date.now();
    const rows = (await getByTs('samples', now - 24 * 3600_000, now)) as SampleRecord[];
    setRecent(rows.sort((a, b) => b.ts - a.ts).slice(0, 20));
  };

  const refreshLog = async () =>
    setLog(
      (await getAll('forgetLog'))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 5)
        .map((l) => ({ ts: l.ts, text: l.kind === 'site' ? `Forgot a site (${l.site})` : l.kind === 'range' ? 'Forgot a time range' : 'Forgot a capture' })),
    );

  useEffect(() => {
    void getSettings().then(setSettings);
    void refreshLog();
    void refreshRecent();
    return onSettingsChanged(setSettings);
  }, []);

  const run = async (job: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await job());
      await refreshLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgetLast = (minutes: number | 'today', label: string) =>
    run(async () => {
      const now = Date.now();
      const start = minutes === 'today' ? dayStartNow() : now - minutes * 60_000;
      if (!confirm(`Forget everything from ${label}? This can't be undone.`)) return 'Cancelled.';
      return describe(await send('background', 'privacy-forget-range', { from: start, to: now }));
    });

  const forgetCustom = () =>
    run(async () => {
      const a = new Date(from).getTime();
      const b = new Date(to).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new Error('Pick a start that is before the end.');
      if (!confirm('Forget everything in this time range? This can\'t be undone.')) return 'Cancelled.';
      return describe(await send('background', 'privacy-forget-range', { from: a, to: b }));
    });

  const forgetSite = () =>
    run(async () => {
      if (!confirm(`Forget everything from ${site}${alwaysSkip ? ' and never observe it again' : ''}? This can't be undone.`)) return 'Cancelled.';
      const r = await send('background', 'privacy-forget-site', { site, alwaysSkip });
      setSite('');
      return describe(r) + (alwaysSkip ? ' The site is now on your blocklist.' : '');
    });

  const forgetOne = (id: number) =>
    run(async () => {
      const r = await send('background', 'privacy-forget-capture', { id });
      await refreshRecent();
      return r ? 'Forgot that item. Its territory was updated; the half-minute activity totals around it stay.' : 'That item was already gone.';
    });

  const saveBlocklist = (edits: Settings['blocklist']) => updateSettings({ blocklist: edits });
  const entries = listEntries(settings.blocklist).filter((e) => e.value.includes(filter.trim().toLowerCase()));

  const wipe = () =>
    run(async () => {
      if (wipeText !== 'WIPE') throw new Error('Type WIPE to confirm.');
      await send('background', 'privacy-wipe');
      setWipeText('');
      setTimeout(() => location.reload(), 1200);
      return 'Everything is wiped: the database, the downloaded models and your settings. Reloading…';
    });

  const paused = isPaused(settings);
  const pause = (option: PauseOption | null) => updateSettings({ pausedUntil: option ? pauseUntil(option) : null });

  return (
    <section class="card" id="privacy">
      <h2 style={{ marginTop: 0 }}>Privacy and your data</h2>
      <p class="muted">
        Nothing observed leaves this device. Item text and screenshots are never stored, and web addresses are stored without anything after the “?”. Stored vectors are not anonymous (they can be partly turned back into text), so
        use these controls freely.
      </p>
      {message && <p class="ok" role="status">{message}</p>}
      {error && <p class="bad" role="alert">{error}</p>}

      <h2>Pause</h2>
      <div class="row">
        {paused ? (
          <button onClick={() => pause(null)}>Resume observing</button>
        ) : (
          <>
            <button onClick={() => pause('15m')}>15 min</button>
            <button onClick={() => pause('1h')}>1 hour</button>
            <button onClick={() => pause('tomorrow')}>Until tomorrow</button>
            <button onClick={() => pause('forever')}>Until I resume</button>
          </>
        )}
      </div>

      <h2>Forget a time range</h2>
      <div class="row">
        <button disabled={busy} onClick={() => forgetLast(20, 'the last 20 minutes')}>Last 20 minutes</button>
        <button disabled={busy} onClick={() => forgetLast(60, 'the last hour')}>Last hour</button>
        <button disabled={busy} onClick={() => forgetLast('today', 'today')}>Today</button>
      </div>
      <div class="field">
        <label>
          From <input type="datetime-local" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        </label>
        <label>
          To <input type="datetime-local" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </label>
        <button disabled={busy} onClick={forgetCustom}>Forget this range</button>
      </div>
      <p class="muted">Removes the items and activity bins, recomputes the territories they belonged to, redoes the affected reports and retrains the prediction on what is left.</p>

      <h2>Forget a site</h2>
      <div class="field">
        <input type="text" placeholder="example.com" value={site} onInput={(e) => setSite(e.currentTarget.value)} aria-label="Site to forget" />
        <label>
          <input type="checkbox" checked={alwaysSkip} onChange={(e) => setAlwaysSkip(e.currentTarget.checked)} /> Always skip this site from now on
        </label>
        <button disabled={busy || !site.trim()} onClick={forgetSite}>Forget site</button>
      </div>

      <h2>Forget one item</h2>
      <p class="muted">The 20 most recent items from the last day. Forgetting one deletes its stored vector and details and updates its territory; the half-minute activity totals around it stay (they hold no content).</p>
      <div id="recent-items">
        {recent.length === 0 ? (
          <p class="muted">Nothing observed in the last day.</p>
        ) : (
          <table>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td class="muted">{new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style="text-align:left">
                    {r.origin.replace(/^https?:\/\/(www\.)?/, '')}
                    {r.path}
                    {r.title ? <span class="muted"> · {r.title}</span> : null}
                  </td>
                  <td>
                    <button disabled={busy} aria-label={`Forget item at ${new Date(r.ts).toLocaleTimeString()}`} onClick={() => void forgetOne(r.id!)}>
                      Forget
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button disabled={busy} onClick={() => void refreshRecent()}>
          Refresh list
        </button>
      </div>

      <h2>Blocklist</h2>
      <p class="muted">Sites that are never observed. The shipped list covers banking, health, passwords, email, government and tax sites. Changes apply to pages you open from now on.</p>
      <div class="field">
        <input type="text" placeholder="add a site, e.g. mybank.com" value={domainInput} onInput={(e) => setDomainInput(e.currentTarget.value)} aria-label="Site to block" />
        <button
          onClick={() => {
            const r = addDomain(settings.blocklist, domainInput);
            if (r.error) setError(r.error);
            else {
              setError(null);
              void saveBlocklist(r.edits);
              setDomainInput('');
            }
          }}
        >
          Add site
        </button>
        <input type="text" placeholder="add a keyword, e.g. payroll" value={keywordInput} onInput={(e) => setKeywordInput(e.currentTarget.value)} aria-label="Keyword to block" />
        <button
          onClick={() => {
            const r = addKeyword(settings.blocklist, keywordInput);
            if (r.error) setError(r.error);
            else {
              setError(null);
              void saveBlocklist(r.edits);
              setKeywordInput('');
            }
          }}
        >
          Add keyword
        </button>
      </div>
      <div class="field">
        <input type="search" placeholder="search the list" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} aria-label="Search the blocklist" />
        <span class="muted">{entries.length} entries</span>
      </div>
      <div class="entries">
        {entries.map((e) => (
          <span class="chip pill" key={`${e.kind}:${e.value}`}>
            {e.kind === 'keyword' ? `contains “${e.value}”` : e.value}
            {e.removable && (
              <button
                aria-label={`Remove ${e.value}`}
                title={e.isDefault ? 'Shipped default: removing stops it being blocked' : 'Remove'}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
                onClick={() => void saveBlocklist(removeEntry(settings.blocklist, e.kind, e.value))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      <h2>Storage</h2>
      <div class="field">
        <label>
          Keep data for{' '}
          <select value={settings.retentionDays} onChange={(e) => void updateSettings({ retentionDays: Number(e.currentTarget.value) })}>
            {[...new Set([...RETENTION_CHOICES, settings.retentionDays])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => run(async () => {
            const r = await send('background', 'privacy-retention');
            return `Removed ${r.samples} items, ${r.bins} bins and ${r.reports} reports older than ${settings.retentionDays} days.`;
          })}
        >
          Apply now
        </button>
      </div>
      <div class="field">
        <label>
          <input type="checkbox" checked={settings.storeTitles} onChange={(e) => void updateSettings({ storeTitles: e.currentTarget.checked })} /> Store page titles (used to cluster and name territories)
        </label>
        <button disabled={busy} onClick={() => run(async () => `Removed titles from ${(await send('background', 'privacy-strip-titles')).cleared} stored items.`)}>
          Remove titles already stored
        </button>
      </div>

      {log.length > 0 && (
        <>
          <h2>Recently forgotten</h2>
          <ul class="muted">
            {log.map((l) => (
              <li key={l.ts}>{new Date(l.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}: {l.text}</li>
            ))}
          </ul>
          <p class="muted">Only the kind of thing forgotten is kept, never its content.</p>
        </>
      )}

      <h2>Wipe everything</h2>
      <p class="muted">Deletes the database, the downloaded models and all settings. The models download again the next time they're needed.</p>
      <div class="field">
        <input type="text" placeholder="type WIPE" value={wipeText} onInput={(e) => setWipeText(e.currentTarget.value)} aria-label="Type WIPE to confirm" />
        <button class="danger" disabled={busy || wipeText !== 'WIPE'} onClick={wipe}>Wipe everything</button>
      </div>
    </section>
  );
}
