/**
 * Small pure building blocks of the content observer (PDD 7.2, 7.3), kept free of the DOM so
 * they can be unit-tested directly.
 */

// ---------- Item detection (PDD 7.3) ----------

/** Lazily measured view of an element; the DOM adapter computes these on demand. */
export interface ElementLike {
  readonly height: number;
  readonly textLength: number;
  readonly hasMedia: boolean;
}

export const ITEM_MIN_HEIGHT = 0.3;
export const ITEM_MAX_HEIGHT = 1.0;
export const ITEM_MIN_TEXT = 40;

/**
 * Walks `chain` (the element at the viewport centre, then its ancestors) and returns the index of
 * the first element 30–100% of the viewport high that has ≥ 40 characters of text or dominant
 * media. -1 means "no card structure": the caller falls back to treating the viewport as the item.
 */
export function findItemIndex(chain: readonly ElementLike[], viewportHeight: number): number {
  const min = ITEM_MIN_HEIGHT * viewportHeight;
  const max = ITEM_MAX_HEIGHT * viewportHeight + 1;
  for (const [i, el] of chain.entries()) {
    const h = el.height;
    if (h < min || h > max) continue;
    if (el.textLength >= ITEM_MIN_TEXT || el.hasMedia) return i;
  }
  return -1;
}

/**
 * Whether visible media makes the item "visual" (PDD 7.2: dominant media covers ≥ 50% of the
 * viewport). A portrait video (Shorts, Reels) on a landscape desktop screen never covers half
 * the viewport, so media that fills ≥ 60% of the viewport height and ≥ 15% of its area also counts.
 */
export function isVisualMedia(visibleWidth: number, visibleHeight: number, vw: number, vh: number): boolean {
  if (vw <= 0 || vh <= 0) return false;
  const area = (visibleWidth * visibleHeight) / (vw * vh);
  return area >= 0.5 || (visibleHeight >= 0.6 * vh && area >= 0.15);
}

// ---------- Viewport fallback (PDD 7.3) ----------

/** Share of the current visible text blocks that weren't visible at the last sample (0–1). */
export function changedFraction(previous: readonly string[], current: readonly string[]): number {
  if (current.length === 0) return 0;
  const prev = new Set(previous);
  return current.filter((h) => !prev.has(h)).length / current.length;
}

export const VIEWPORT_CHANGE_THRESHOLD = 0.6;

// ---------- Scroll velocity (PDD 7.2) ----------

/** Exponentially smoothed scroll speed in px/s (time constant `tauMs`). */
export class VelocitySmoother {
  private value = 0;
  private lastTs: number | null = null;

  constructor(private readonly tauMs = 1000) {}

  /** Feed one scroll step of `deltaPx` pixels at time `ts`; returns the smoothed px/s. */
  update(ts: number, deltaPx: number): number {
    if (this.lastTs == null) {
      this.lastTs = ts;
      return this.value;
    }
    const dt = Math.max(ts - this.lastTs, 16);
    this.lastTs = ts;
    const instant = (Math.abs(deltaPx) / dt) * 1000;
    const alpha = 1 - Math.exp(-dt / this.tauMs);
    this.value += alpha * (instant - this.value);
    return this.value;
  }

  /** Scrolling stopped. */
  reset(): void {
    this.value = 0;
    this.lastTs = null;
  }

  get pxPerS(): number {
    return this.value;
  }
}

// ---------- Video (PDD 7.2) ----------

/** A video was skipped if it was left before 2 s or before 25% of it was watched. */
export function isSkip(watchedS: number, durationS: number | null): boolean {
  if (watchedS < 2) return true;
  return durationS != null && Number.isFinite(durationS) && durationS > 0 && watchedS / durationS < 0.25;
}

/** Accumulates watched seconds from `timeupdate` positions; robust to loops and seeks. */
export class WatchTimer {
  private last: number | null = null;
  watchedS = 0;

  update(currentTime: number): void {
    if (this.last != null) {
      const d = currentTime - this.last;
      if (d > 0 && d < 1.5) this.watchedS += d;
    }
    this.last = currentTime;
  }
}
