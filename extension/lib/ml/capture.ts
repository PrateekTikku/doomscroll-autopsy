/**
 * Screenshot rate limit (PDD 7.5, D-16): at most one capture every 3 s, only for the active tab of a
 * focused window. Pure decision logic; the Chrome call is in ./service.ts.
 */
export const CAPTURE_INTERVAL_MS = 3000;

export function createCaptureLimiter(intervalMs = CAPTURE_INTERVAL_MS) {
  let last = -Infinity;
  return {
    /** True (and records the attempt) if a capture is allowed now. */
    tryAcquire(now: number): boolean {
      if (now - last < intervalMs) return false;
      last = now;
      return true;
    },
  };
}
