import type { ReportRecord, TerritoryRecord } from '@/lib/db';
import { GEN_MODEL_NAME } from './config';
import type { GenStatus } from './messages';
import { fallbackRate, type TaskStats } from './stats';

/** Short, calm wording for where text came from (shown subtly in the dashboard, PDD 9.8). */
export function autopsySourceLabel(report: Pick<ReportRecord, 'modelVersion' | 'source'>): string {
  if (report.modelVersion !== 'template') return `Written by ${GEN_MODEL_NAME}`;
  const src = report.source;
  if (src?.errors.some((e) => e.startsWith('unavailable'))) return 'Written from a template (the on-device writer model could not run)';
  if (!src || src.attempts === 0) return 'Written from a template';
  return 'Written from a template (the model\'s draft did not pass the number checks)';
}

export function nameSourceLabel(t: Pick<TerritoryRecord, 'nameSource' | 'suggestionSource' | 'labelConfirmed'>): string {
  if (t.nameSource === 'model') return `named by ${GEN_MODEL_NAME}`;
  return 'baseline name';
}

/** One line for the popup's model status. */
export function writerLine(status: GenStatus | null): string {
  if (!status || status.state === 'not-started') return 'Writer model: loads when it writes names and the nightly autopsy';
  switch (status.state) {
    case 'loading':
      return `Writer model: loading${status.percent ? `, ${Math.round(status.percent)}%` : ''}…`;
    case 'ready':
      return `Writer model: ready${status.medianTokPerS ? `, ${Math.round(status.medianTokPerS)} tokens/s` : ''}`;
    case 'unloaded':
      return 'Writer model: asleep (loads when it writes)';
    default:
      return `Writer model: unavailable, using templates. ${status.error ?? ''}`.trim();
  }
}

export function statsLine(label: string, t: TaskStats): string {
  if (t.items === 0) return `${label}: none written yet`;
  const rate = fallbackRate(t)!;
  return `${label}: ${t.model} of ${t.items} from the model, ${t.fallback} fell back (${Math.round(rate * 100)}%)${t.unavailable ? `, ${t.unavailable} because the model could not run` : ''}`;
}
