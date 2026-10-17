import type { NudgeResponse } from '@/lib/db';
import { breathLabel, breathState } from './breathe';
import { BREATH_BUTTON } from './copy';
import type { NudgePayload } from './messages';

/**
 * In-page nudge (PDD 4.5): a banner (step 1) and a blurred layer (step 2), drawn in a closed shadow
 * DOM so the page's own styles and scripts can't touch it and it never edits the page. The blur is a
 * fixed full-viewport `backdrop-filter` layer, not a filter on the page's DOM.
 *
 * Styles use a constructable stylesheet, which strict page CSPs don't block; if the browser lacks
 * it, a <style> element is the fallback. Colours are fixed (not themed) so the nudge reads on any site.
 */
export const HOST_ID = 'doomscroll-autopsy-nudge';
export const BANNER_AUTO_HIDE_MS = 60_000;

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.banner { position: fixed; top: 16px; right: 16px; width: 340px; max-width: calc(100vw - 32px); background: #14202b; color: #f2f5f7;
  border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 28px rgba(0,0,0,.35); font-size: 14px; line-height: 1.4; z-index: 2147483647; }
.veil { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  background: rgba(10,18,26,.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.card { width: 380px; max-width: calc(100vw - 32px); background: #14202b; color: #f2f5f7; border-radius: 14px; padding: 20px 22px;
  box-shadow: 0 12px 40px rgba(0,0,0,.4); font-size: 15px; line-height: 1.45; }
h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; letter-spacing: .02em; color: #9fd3c7; }
p { margin: 0 0 12px; }
.row { display: flex; gap: 8px; align-items: center; }
button { font: inherit; font-size: 13px; padding: 7px 12px; border-radius: 8px; border: 1px solid #3b4b59; background: transparent; color: #f2f5f7; cursor: pointer; }
button.primary { background: #2f9e86; border-color: #2f9e86; color: #04130f; font-weight: 600; }
button:hover { filter: brightness(1.12); }
.breath { display: flex; flex-direction: column; align-items: center; gap: 6px; margin: 4px 0 14px; }
.orb { width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #6fd0bb, #2f9e86); opacity: .85; transform: scale(.55); }
.count { font-size: 15px; font-weight: 600; letter-spacing: .02em; }
.sub { font-size: 12px; color: #9fb3c0; }
.pill { margin-left: auto; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #d97706; color: #1a0f00; font-weight: 700; letter-spacing: .04em; }
`;

export interface MountedNudge {
  host: HTMLElement;
  /** Remove the nudge without reporting a response. */
  close(): void;
}

function applyStyles(shadow: ShadowRoot, doc: Document): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
  }
}

/** Shows `nudge`; `onResponse` is called once, when the user answers or the banner times out. */
export function mountNudge(doc: Document, nudge: NudgePayload, onResponse: (r: NudgeResponse) => void): MountedNudge {
  doc.getElementById(HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  applyStyles(shadow, doc);

  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    clearTimeout(timer);
    clearInterval(breathTimer);
    doc.removeEventListener('keydown', onKey, true);
    host.remove();
  };
  const answer = (r: NudgeResponse) => {
    if (done) return;
    done = true;
    close();
    onResponse(r);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') answer('snooze');
  };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const buttons = () => {
    const row = el('div', 'row');
    const primary = el('button', 'primary', nudge.primary);
    const secondary = el('button', undefined, nudge.secondary);
    primary.addEventListener('click', () => answer('back'));
    secondary.addEventListener('click', () => answer('snooze'));
    row.append(primary, secondary);
    if (nudge.replay) row.append(el('span', 'pill', 'Replay'));
    return row;
  };

  const breathView = (card: HTMLElement) => {
    card.replaceChildren();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrap = el('div', 'breath');
    const orb = el('div', 'orb');
    const count = el('div', 'count', 'Breathe in');
    const sub = el('div', 'sub');
    wrap.append(orb, count, sub);
    const row = el('div', 'row');
    const skip = el('button', undefined, 'Skip');
    skip.addEventListener('click', () => answer('snooze'));
    row.append(skip);
    if (nudge.replay) row.append(el('span', 'pill', 'Replay'));
    card.append(el('h2', undefined, 'Take a breath'), wrap, row);
    const started = Date.now();
    const tick = () => {
      const st = breathState(Date.now() - started);
      if (st.done) {
        clearInterval(breathTimer);
        card.replaceChildren(el('h2', undefined, 'Take a breath'), el('p', undefined, 'Done. Now decide: back to deep work, or carry on?'), buttons());
        return;
      }
      count.textContent = `${breathLabel(st)} · ${st.phaseSecondsLeft}`;
      sub.textContent = `${st.totalSecondsLeft} s left`;
      orb.style.transform = reduced ? 'scale(.8)' : `scale(${0.55 + 0.45 * st.fullness})`;
      orb.style.transition = reduced ? 'none' : 'transform 0.2s linear';
    };
    breathTimer = setInterval(tick, 200);
    tick();
  };
  let breathTimer: ReturnType<typeof setInterval> | undefined;

  if (nudge.step === 1) {
    const banner = el('div', 'banner');
    banner.setAttribute('role', 'status');
    banner.append(el('h2', undefined, nudge.title), el('p', undefined, nudge.body), buttons());
    shadow.append(banner);
    timer = setTimeout(() => answer('ignored'), BANNER_AUTO_HIDE_MS);
  } else {
    const veil = el('div', 'veil');
    veil.setAttribute('role', 'alertdialog');
    const card = el('div', 'card');
    if (nudge.step === 3) {
      breathView(card);
    } else {
      const row = buttons();
      if (nudge.offerBreath) {
        const breath = el('button', undefined, BREATH_BUTTON);
        breath.addEventListener('click', () => breathView(card));
        row.insertBefore(breath, row.querySelector('.pill'));
      }
      card.append(el('h2', undefined, nudge.title), el('p', undefined, nudge.body), row);
    }
    veil.append(card);
    shadow.append(veil);
  }
  doc.documentElement.append(host);
  doc.addEventListener('keydown', onKey, true);
  return { host, close };
}
