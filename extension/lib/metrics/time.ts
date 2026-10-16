/** Local-time helpers for daily metrics. Everything is local time (the schema says so). */
export const DAY_MS = 86_400_000;
export const BIN_MS = 30_000;

export function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight at the start of `date` ("YYYY-MM-DD"). */
export function dayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}

/** Local midnight that ends `date` (DST-safe: next calendar day's midnight). */
export function dayEnd(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d! + 1).getTime();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return dateKey(new Date(y!, m! - 1, d! + n).getTime());
}

/** "HH:MM" 24-hour local clock. */
export function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;
