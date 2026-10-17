import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messaging';
import '@/lib/ml/messages';
import type { EmbedStatusView } from '@/lib/ml/messages';
import { addDomain, addKeyword, listEntries, removeEntry } from '@/lib/privacy/blocklist-edit';
import {
  downloadLine,
  getOnboardedAt,
  HONEST_PRIVACY,
  INSTALL_WARNING,
  markOnboarded,
  OBSERVED,
  REQUIREMENTS,
  STORED,
  webGpuAvailable,
} from '@/lib/onboarding';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type Sensitivity, type Settings } from '@/lib/settings';

/** First-run page (PDD 4.3): what is observed, what is stored, the install warning, the model download, the blocklist. */
const SENSITIVITIES: Array<[Sensitivity, string]> = [
  ['gentle', 'Gentle (nudge late)'],
  ['balanced', 'Balanced'],
  ['strict', 'Strict (nudge early)'],
];

function Onboarding() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS as Settings);
  const [model, setModel] = useState<EmbedStatusView | null>(null);
  const [started, setStarted] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [filter, setFilter] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean | null>(null);
  const gpu = webGpuAvailable();

  useEffect(() => {
    void getSettings().then(setSettings);
    void getOnboardedAt().then((t) => setDone(t != null));
    const poll = () => void send('background', 'embed-status').then(setModel).catch(() => undefined);
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, []);

  const saveBlocklist = async (edits: Settings['blocklist']) => setSettings(await updateSettings({ blocklist: edits }));
  const entries = listEntries(settings.blocklist).filter((e) => e.value.includes(filter.trim().toLowerCase()));
  const shown = entries.slice(0, 40);
  const busy = model?.state === 'downloading' || model?.state === 'loading';

  const start = async () => {
    setStarted(true);
    await send('background', 'embed-warm').catch(() => undefined);
  };
  const finish = async () => {
    await markOnboarded();
    window.location.href = browser.runtime.getURL('/dashboard.html' as never);
  };

  return (
    <main class="dash">
      <h1>Welcome to Doomscroll Autopsy</h1>
      <p class="muted">A calm coach for your deep work. It watches what you scroll in this browser, learns which parts pull you away, and tells you before you spiral.</p>

      <section class="card">
        <h2>What it looks at</h2>
        <ul>{OBSERVED.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2>What it keeps</h2>
        <ul>{STORED.map((t) => <li key={t}>{t}</li>)}</ul>
        <p id="privacy-claim"><strong>{HONEST_PRIVACY}</strong></p>
      </section>

      <section class="card">
        <h2>The install warning</h2>
        <p>{INSTALL_WARNING}</p>
      </section>

      <section class="card">
        <h2>Good to know</h2>
        <ul>{REQUIREMENTS.map((t) => <li key={t}>{t}</li>)}</ul>
        {!gpu && <p class="bad">This browser reports no WebGPU, so the extension will not be able to read your browsing. Try an up-to-date Chrome on a Mac or PC with a GPU.</p>}
      </section>

      <section class="card" id="model">
        <h2>The embedding model</h2>
        <p>
          EmbeddingGemma 2 turns each item into numbers on your device. It downloads once (about 255 MB) from Hugging Face, the only network traffic the extension ever makes, then works without a connection. The fine-tuned Gemma 3 270M that names territories and writes your autopsy is already inside the extension.
        </p>
        <p class={model?.state === 'error' ? 'bad' : 'muted'} id="model-status">
          {downloadLine(model?.state ?? 'not-started', model?.percent ?? 0, model?.error ?? null)}
        </p>
        {busy && <progress max={100} value={model?.percent ?? 0} style="width:100%" />}
        <button disabled={!gpu || busy || model?.state === 'ready'} onClick={() => void start()}>
          {model?.state === 'ready' ? 'Ready' : started || busy ? 'Working…' : 'Download and start now'}
        </button>{' '}
        <span class="muted">Or skip this: it also starts by itself on your first browsing.</span>
      </section>

      <section class="card" id="blocklist">
        <h2>Sites it never observes</h2>
        <p class="muted">Banking, health, password managers, email, government and similar sites are skipped by default. Review the list and add anything you want left alone.</p>
        <div class="field">
          <input placeholder="add a site, e.g. mybank.com" value={domainInput} onInput={(e) => setDomainInput(e.currentTarget.value)} aria-label="Add a site" />
          <button
            onClick={() => {
              const r = addDomain(settings.blocklist, domainInput);
              setInputError(r.error ?? null);
              if (!r.error) {
                void saveBlocklist(r.edits);
                setDomainInput('');
              }
            }}
          >
            Add site
          </button>
          <input placeholder="add a keyword, e.g. therapy" value={keywordInput} onInput={(e) => setKeywordInput(e.currentTarget.value)} aria-label="Add a keyword" />
          <button
            onClick={() => {
              const r = addKeyword(settings.blocklist, keywordInput);
              setInputError(r.error ?? null);
              if (!r.error) {
                void saveBlocklist(r.edits);
                setKeywordInput('');
              }
            }}
          >
            Add keyword
          </button>
        </div>
        {inputError && <p class="bad">{inputError}</p>}
        <input type="search" placeholder="search the list" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} aria-label="Search the blocklist" />
        <p class="muted">{entries.length} entries{entries.length > shown.length ? `, showing the first ${shown.length}` : ''}</p>
        <div class="entries">
          {shown.map((e) => (
            <span class="pill" key={e.kind + e.value}>
              {e.value}
              {e.kind === 'keyword' ? ' (keyword)' : ''}{' '}
              {e.removable && (
                <button aria-label={`Remove ${e.value}`} onClick={() => void saveBlocklist(removeEntry(settings.blocklist, e.kind, e.value))}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </section>

      <section class="card">
        <h2>How firmly should it nudge?</h2>
        <div class="row">
          {SENSITIVITIES.map(([value, label]) => (
            <button key={value} class={`label-btn${settings.sensitivity === value ? ' on' : ''}`} onClick={() => void updateSettings({ sensitivity: value }).then(setSettings)}>
              {label}
            </button>
          ))}
        </div>
        <p class="muted">You can change this, pause, forget or wipe everything later from the toolbar popup and the dashboard.</p>
      </section>

      <p>
        <button id="finish" onClick={() => void finish()}>{done ? 'Open the dashboard' : "I've read this, let's go"}</button>
      </p>
    </main>
  );
}

render(<Onboarding />, document.getElementById('app')!);
