import type { ObserverEvent } from '@shared/types';
import { hash53, itemKey, normalizeText, type MediaIdentity } from './identity';
import {
  changedFraction,
  findItemIndex,
  isSkip,
  isVisualMedia,
  VelocitySmoother,
  VIEWPORT_CHANGE_THRESHOLD,
  WatchTimer,
  type ElementLike,
} from './signals';
import { pageLocation } from './url';

/**
 * Content-script observer (PDD 7.2, 7.3): detects the item in view, measures dwell, scroll
 * velocity and video behaviour, and sends compact events to the service worker. Only runs after
 * the blocklist and pause checks have passed (entrypoints/observer.ts).
 *
 * Privacy: item text is read only to build a hashed identity and the in-memory `text` field for
 * embedding. Input listeners record *when* the user was active, never what they typed or clicked.
 */

const CHECK_THROTTLE_MS = 250;
const COMMIT_MS = 600;
const TICK_MS = 1000;
const HEARTBEAT_MS = 15_000;
const CONTINUATION_MS = 60_000;
const SCROLL_SEND_MS = 1000;
const SCROLL_QUIET_MS = 300;
const TEXT_MAX = 2000;
const TITLE_MAX = 300;
const MAX_WALK = 30;
const PERF_LOG_MS = 20_000;

export interface ObserverOptions {
  send: (ev: ObserverEvent) => void;
  devMode: () => boolean;
  storeTitles: () => boolean;
}

interface Candidate {
  key: string;
  el: Element | null;
  isVisual: boolean;
  video: HTMLVideoElement | null;
  /** Viewport mode only: hashes of the visible text blocks. */
  blocks?: string[];
  blockTexts?: string[];
}

interface Current extends Candidate {
  baseKey: string;
  continuation: number;
  lastSampleAt: number;
  visibleAcc: number;
  visibleSince: number | null;
  watch: WatchTimer | null;
  played: boolean;
  ended: boolean;
}

/** Visible part of `el` inside the viewport. */
function visibleRect(el: Element, vw: number, vh: number): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { w: Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)), h: Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) };
}

/** Largest visible <video>/<img> in (or equal to) `el`, if it's big enough to dominate. */
function dominantMedia(el: Element, vw: number, vh: number): HTMLVideoElement | HTMLImageElement | null {
  const candidates: Element[] = el.matches('video, img') ? [el] : [...el.querySelectorAll('video, img')].slice(0, 40);
  let best: HTMLVideoElement | HTMLImageElement | null = null;
  let bestArea = 0;
  for (const m of candidates) {
    const { w, h } = visibleRect(m, vw, vh);
    if (w * h > bestArea) {
      bestArea = w * h;
      best = m as HTMLVideoElement | HTMLImageElement;
    }
  }
  return bestArea >= 0.15 * vw * vh ? best : null;
}

function mediaIdentity(m: HTMLVideoElement | HTMLImageElement): MediaIdentity {
  if (m instanceof HTMLVideoElement) {
    return { currentSrc: m.currentSrc, duration: Number.isFinite(m.duration) ? m.duration : null, poster: m.poster };
  }
  return { currentSrc: m.currentSrc || m.src, duration: null, poster: '' };
}

/** Text identity ignores digits, so live counters and "3m ago" don't create new items. */
const identityText = (text: string) => normalizeText(text.slice(0, 1000).replace(/[0-9]+/g, ' ')).slice(0, 200);

/** Element text, cut early so huge subtrees stay cheap. */
const rawText = (el: Element, max = 4000) => (el.textContent ?? '').slice(0, max);

function lazyLike(el: Element, vw: number, vh: number): ElementLike {
  let height: number | undefined;
  let textLength: number | undefined;
  let hasMedia: boolean | undefined;
  return {
    get height() {
      return (height ??= el.getBoundingClientRect().height);
    },
    get textLength() {
      return (textLength ??= normalizeText(rawText(el)).length);
    },
    get hasMedia() {
      return (hasMedia ??= dominantMedia(el, vw, vh) != null);
    },
  };
}

/** Hashes and texts of the text blocks at a 3×3 grid of viewport points (viewport fallback). */
function gridBlocks(vw: number, vh: number): { hashes: string[]; texts: string[] } {
  const seen = new Map<string, string>();
  for (const fx of [0.25, 0.5, 0.75]) {
    for (const fy of [1 / 6, 1 / 2, 5 / 6]) {
      let el = document.elementFromPoint(fx * vw, fy * vh);
      for (let i = 0; el && i < 4; i++, el = el.parentElement) {
        if (el.getBoundingClientRect().height >= vh) break; // ancestors are only bigger
        const text = normalizeText(rawText(el, 2000));
        if (text.length >= 20) {
          const h = hash53(identityText(text));
          if (!seen.has(h)) seen.set(h, text.slice(0, 600));
          break;
        }
      }
    }
  }
  return { hashes: [...seen.keys()], texts: [...seen.values()] };
}

const whenIdle = () =>
  new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 300 });
    else setTimeout(resolve, 1);
  });

function stats(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return `p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms n=${sorted.length}`;
}

function elementText(el: Element): string {
  const text = el instanceof HTMLElement ? el.innerText : (el.textContent ?? '');
  return normalizeText(text).slice(0, TEXT_MAX);
}

export function startObserver(opts: ObserverOptions): () => void {
  const ac = new AbortController();
  const listen = (target: EventTarget, type: string, fn: (e: Event) => void) =>
    target.addEventListener(type, fn, { capture: true, passive: true, signal: ac.signal });
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  };

  let loc = pageLocation(location.href)!;
  let current: Current | null = null;
  let pending: (Candidate & { since: number }) | null = null;
  let lastActivity = Date.now();
  let lastCheck = 0;
  let checkQueued = false;
  const smoother = new VelocitySmoother();
  const scrollPos = new WeakMap<EventTarget, number>();
  let lastScrollSend = 0;
  let scrollQuiet: ReturnType<typeof setTimeout> | null = null;
  const perfScroll: number[] = [];
  const perfCheck: number[] = [];
  const perfText: number[] = [];
  let sendChain: Promise<void> = Promise.resolve();
  const keep = (arr: number[], v: number) => {
    arr.push(v);
    if (arr.length > 2000) arr.splice(0, 1000);
  };
  let itemsSent = 0;

  const log = (...args: unknown[]) => {
    if (opts.devMode()) console.log('[doomscroll]', ...args);
  };

  const dwell = (c: Current, now: number) => c.visibleAcc + (c.visibleSince != null ? now - c.visibleSince : 0);

  function detect(): Candidate | null {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const start = document.elementFromPoint(vw / 2, vh / 2);
    if (!start) return null;
    const chain: Element[] = [];
    for (let el: Element | null = start; el && el !== document.documentElement && chain.length < MAX_WALK; el = el.parentElement) chain.push(el);
    const i = findItemIndex(chain.map((el) => lazyLike(el, vw, vh)), vh);
    const el = chain[i];
    if (el) {
      const media = dominantMedia(el, vw, vh);
      const key = itemKey({ path: loc.path, media: media ? mediaIdentity(media) : null, text: identityText(rawText(el, 1000)) });
      if (!key) return null;
      const r = media ? visibleRect(media, vw, vh) : null;
      return {
        key,
        el,
        isVisual: r != null && isVisualMedia(r.w, r.h, vw, vh),
        video: media instanceof HTMLVideoElement ? media : null,
      };
    }
    // No card structure (articles, docs, web apps): the viewport is the item.
    const { hashes, texts } = gridBlocks(vw, vh);
    // Same view as the current (or pending) sample unless ≥ 60% of the visible text blocks changed.
    const prefix = `v:${hash53(loc.path)}:`;
    const near = (c: Candidate | null, key: string | undefined) =>
      c?.blocks != null && key != null && key.startsWith(prefix) && changedFraction(c.blocks, hashes) < VIEWPORT_CHANGE_THRESHOLD;
    const key = near(current, current?.baseKey) ? current!.baseKey : near(pending, pending?.key) ? pending!.key : prefix + Date.now().toString(36);
    const centerMedia = start.closest('video') ?? (start instanceof HTMLImageElement ? start : null);
    const r = centerMedia ? visibleRect(centerMedia, vw, vh) : null;
    return {
      key,
      el: null,
      isVisual: r != null && isVisualMedia(r.w, r.h, vw, vh),
      video: centerMedia instanceof HTMLVideoElement ? centerMedia : null,
      blocks: hashes,
      blockTexts: texts,
    };
  }

  function sendVideo(c: Current, event: 'play' | 'pause' | 'ended' | 'skip', now: number) {
    const v = c.video!;
    opts.send({
      type: 'video',
      ts: now,
      itemKey: c.key,
      event,
      currentTime: Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0,
      duration: Number.isFinite(v.duration) ? v.duration : null,
    });
  }

  function leaveVideo(now: number) {
    if (!current?.video || !current.watch || !current.played || current.ended) return;
    const duration = Number.isFinite(current.video.duration) ? current.video.duration : null;
    if (isSkip(current.watch.watchedS, duration)) sendVideo(current, 'skip', now);
  }

  function commit(cand: Candidate, now: number, continuation = 0) {
    const prevDwellMs = current ? Math.round(dwell(current, now)) : 0;
    if (!continuation) leaveVideo(now);
    const key = continuation ? `${cand.key}:${continuation}`.slice(0, 200) : cand.key;
    const title = opts.storeTitles() ? document.title.trim().slice(0, TITLE_MAX) : '';
    const { origin, path } = loc;
    const { el, blockTexts, isVisual } = cand;
    // Reading innerText forces layout, so the item event is sent from an idle callback, in order.
    sendChain = sendChain.then(whenIdle).then(() => {
      if (ac.signal.aborted) return;
      const t0 = performance.now();
      const text = el ? elementText(el) : normalizeText((blockTexts ?? []).join(' ')).slice(0, TEXT_MAX);
      keep(perfText, performance.now() - t0);
      opts.send({
        type: 'item',
        ts: now,
        origin,
        path,
        ...(title ? { title } : {}),
        itemKey: key,
        isVisual,
        prevDwellMs,
        ...(text ? { text } : {}),
      });
    });
    itemsSent++;
    log('item', key.slice(0, 2), key.slice(2, 14), cand.isVisual ? 'visual' : 'text', `prevDwell=${prevDwellMs}ms`, `#${itemsSent}`);
    const keepVideo = continuation > 0 && current != null;
    current = {
      ...cand,
      key,
      baseKey: cand.key,
      continuation,
      lastSampleAt: now,
      visibleAcc: 0,
      visibleSince: now,
      watch: keepVideo ? current!.watch : cand.video ? new WatchTimer() : null,
      played: keepVideo ? current!.played : false,
      ended: keepVideo ? current!.ended : false,
    };
    if (!keepVideo && current.video && !current.video.paused) {
      current.played = true;
      sendVideo(current, 'play', now);
    }
  }

  function check() {
    if (document.hidden) return;
    const t0 = performance.now();
    const now = Date.now();
    lastCheck = now;
    const cand = detect();
    if (cand) {
      if (current && cand.key === current.baseKey) {
        pending = null;
      } else if (!pending || pending.key !== cand.key) {
        pending = { ...cand, since: now };
        later(check, COMMIT_MS + 20);
      } else if (now - pending.since >= COMMIT_MS) {
        commit(pending, now);
        pending = null;
      }
    }
    // A long stay on one item (an article, a talk) yields a sample per minute of activity.
    if (current && now - current.lastSampleAt >= CONTINUATION_MS && lastActivity > current.lastSampleAt) {
      commit({ ...current, key: current.baseKey }, now, current.continuation + 1);
    }
    keep(perfCheck, performance.now() - t0);
  }

  /** Item detection runs outside the scroll handler, at most every 250 ms. */
  function throttledCheck() {
    if (checkQueued) return;
    const wait = Math.max(0, lastCheck + CHECK_THROTTLE_MS - Date.now());
    checkQueued = true;
    later(() => {
      checkQueued = false;
      check();
    }, wait);
  }

  function onScroll(e: Event) {
    const t0 = performance.now();
    const now = Date.now();
    lastActivity = now;
    const target = e.target === document ? window : (e.target as EventTarget);
    const pos = target === window ? window.scrollY : (e.target as Element).scrollTop;
    const prev = scrollPos.get(target);
    scrollPos.set(target, pos);
    const px = smoother.update(now, prev == null ? 0 : pos - prev);
    if (now - lastScrollSend >= SCROLL_SEND_MS) {
      lastScrollSend = now;
      opts.send({ type: 'scroll', ts: now, pxPerS: Math.round(px) });
    }
    if (scrollQuiet) clearTimeout(scrollQuiet);
    scrollQuiet = setTimeout(() => {
      scrollQuiet = null;
      smoother.reset();
      opts.send({ type: 'scroll', ts: Date.now(), pxPerS: 0 });
      check();
    }, SCROLL_QUIET_MS);
    throttledCheck();
    keep(perfScroll, performance.now() - t0);
  }

  function onMedia(e: Event) {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    const now = Date.now();
    if (e.type === 'timeupdate') {
      if (current?.video === v && !v.paused) {
        current.watch?.update(v.currentTime);
        lastActivity = now;
      }
      return;
    }
    if (current?.video === v) {
      if (e.type === 'play') current.played = true;
      if (e.type === 'ended') current.ended = true;
      sendVideo(current, e.type as 'play' | 'pause' | 'ended', now);
    }
    if (e.type === 'play') throttledCheck();
  }

  function onVisibility() {
    const now = Date.now();
    const visible = !document.hidden;
    if (current) {
      if (visible) current.visibleSince ??= now;
      else if (current.visibleSince != null) {
        current.visibleAcc += now - current.visibleSince;
        current.visibleSince = null;
      }
    }
    opts.send({ type: 'visibility', ts: now, visible });
    if (visible) check();
  }

  function tick() {
    if (document.hidden) return;
    const next = pageLocation(location.href);
    if (next && next.path !== loc.path) loc = next;
    check();
  }

  const markActive = () => {
    lastActivity = Date.now();
  };

  listen(document, 'scroll', onScroll);
  for (const type of ['play', 'pause', 'ended', 'timeupdate']) listen(document, type, onMedia);
  listen(document, 'visibilitychange', onVisibility);
  for (const type of ['keydown', 'pointerdown', 'wheel', 'mousemove', 'touchstart']) listen(window, type, markActive);
  const intervals = [
    setInterval(tick, TICK_MS),
    setInterval(() => {
      if (!document.hidden) opts.send({ type: 'heartbeat', ts: Date.now(), origin: loc.origin, path: loc.path });
    }, HEARTBEAT_MS),
    setInterval(() => {
      if (opts.devMode() && perfScroll.length > 0) log(`perf: scroll handler ${stats(perfScroll)} · item detection ${stats(perfCheck)} · text (idle) ${stats(perfText)}`);
    }, PERF_LOG_MS),
  ];

  if (!document.hidden) {
    opts.send({ type: 'heartbeat', ts: Date.now(), origin: loc.origin, path: loc.path });
    check();
  }
  log('observer started');

  return () => {
    ac.abort();
    intervals.forEach(clearInterval);
    timeouts.forEach(clearTimeout);
    if (scrollQuiet) clearTimeout(scrollQuiet);
    log('observer stopped');
  };
}
