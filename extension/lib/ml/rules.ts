import type { BinFeatures } from '@/lib/db';

/**
 * Rules mode (PDD 9.6): a hand-tuned logistic estimate of the share of the next 10 minutes that
 * will be Drain. It needs no training, so it drives nudges from minute one (D-14).
 *
 *   z = BIAS + W_ITEMS·items + W_SCROLL·scroll + W_SKIP·skip
 *         + W_FEED·feed + W_STAY·log1p(minutesInCurrent)·feed + W_LEFT_DEEP·leftDeep
 *   share = 1 / (1 + e^-z)
 *
 * items = items_per_min / 12 and scroll = scroll_px_s_mean / 300 (a feed scrolled at ~8 items/min averages ≈ 100 px/s over a bin), both clamped to [0, 1.5];
 * skip = video_skip_rate (0–1). `feed` is 1 when the current territory is Drain, or the current
 * item sits on a known feed origin (assets/feed-origins.json). Constants were chosen so that, with
 * feed = 1, ordinary scrolling gives ≈ 0.85 and a lull ≈ 0.6; with feed = 0 even a busy Slack
 * stays under ≈ 0.2. They are deliberately round numbers, not fitted.
 */
export const RULES = {
  BIAS: -3.2,
  W_ITEMS: 1.6,
  W_SCROLL: 0.9,
  W_SKIP: 1.4,
  W_FEED: 3.2,
  W_STAY: 0.35,
  W_LEFT_DEEP: 0.5,
  ITEMS_NORM: 12,
  SCROLL_NORM: 300,
  CLAMP: 1.5,
} as const;

export const NEXT_WINDOW_MIN = 10;

export interface RulesInput {
  features: Pick<BinFeatures, 'items_per_min' | 'scroll_px_s_mean' | 'video_skip_rate'>;
  feed: boolean;
  /** Minutes the user has been in the current territory (consecutive bins). */
  minutesInCurrent: number;
  /** Left a Deep territory in the last 5 minutes. */
  leftDeepRecently: boolean;
}

const clamp = (x: number) => Math.max(0, Math.min(RULES.CLAMP, x));

export function drainShare(input: RulesInput): number {
  const f = input.features;
  const feed = input.feed ? 1 : 0;
  const z =
    RULES.BIAS +
    RULES.W_ITEMS * clamp(f.items_per_min / RULES.ITEMS_NORM) +
    RULES.W_SCROLL * clamp(f.scroll_px_s_mean / RULES.SCROLL_NORM) +
    RULES.W_SKIP * Math.max(0, Math.min(1, f.video_skip_rate)) +
    RULES.W_FEED * feed +
    RULES.W_STAY * Math.log1p(Math.max(0, input.minutesInCurrent)) * feed +
    RULES.W_LEFT_DEEP * (input.leftDeepRecently ? 1 : 0);
  return 1 / (1 + Math.exp(-z));
}

/** Predicted Drain minutes over the next 10 minutes. */
export function rulesPredictedMinutes(input: RulesInput): number {
  return NEXT_WINDOW_MIN * drainShare(input);
}
