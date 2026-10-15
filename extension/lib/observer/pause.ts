/** Pause options (PDD 11.3). "Until tomorrow" resumes at the next 04:00 local time (owner, 2026-10-15). */
export type PauseOption = '15m' | '1h' | 'tomorrow' | 'forever';

export const RESUME_HOUR = 4;

export function nextResumeTime(now: number): number {
  const d = new Date(now);
  d.setHours(RESUME_HOUR, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function pauseUntil(option: PauseOption, now = Date.now()): number | 'forever' {
  switch (option) {
    case '15m':
      return now + 15 * 60_000;
    case '1h':
      return now + 60 * 60_000;
    case 'tomorrow':
      return nextResumeTime(now);
    case 'forever':
      return 'forever';
  }
}
