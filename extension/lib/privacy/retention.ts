import { openDb, type SampleRecord } from '@/lib/db';
import { dateKey, DAY_MS } from '@/lib/metrics/time';

/** Retention (PDD 8.2, D-17): drop data older than the configured number of days. */
export interface RetentionReport {
  samples: number;
  bins: number;
  nudges: number;
  recorderEvents: number;
  reports: number;
}

export const RETENTION_CHOICES = [7, 14, 30, 60, 90] as const;

export async function applyRetention(days: number, now = Date.now()): Promise<RetentionReport> {
  const cutoff = now - Math.max(1, days) * DAY_MS;
  const db = await openDb();
  const count = async (store: 'samples' | 'nudges' | 'recorderEvents', range: IDBKeyRange) => {
    const tx = db.transaction(store, 'readwrite');
    let n = 0;
    let cur = await tx.store.index('ts').openCursor(range);
    while (cur) {
      await cur.delete();
      n++;
      cur = await cur.continue();
    }
    await tx.done;
    return n;
  };
  const before = IDBKeyRange.upperBound(cutoff, true);
  const samples = await count('samples', before);
  const nudges = await count('nudges', before);
  const recorderEvents = await count('recorderEvents', before);

  const binTx = db.transaction('bins', 'readwrite');
  let bins = 0;
  let bc = await binTx.store.openCursor(before);
  while (bc) {
    await bc.delete();
    bins++;
    bc = await bc.continue();
  }
  await binTx.done;

  const reportTx = db.transaction('reports', 'readwrite');
  const oldest = dateKey(cutoff);
  let reports = 0;
  let rc = await reportTx.store.openCursor();
  while (rc) {
    if (rc.value.date < oldest) {
      await rc.delete();
      reports++;
    }
    rc = await rc.continue();
  }
  await reportTx.done;
  return { samples, bins, nudges, recorderEvents, reports };
}

/** Removes stored titles from every sample ("store titles" turned off). Returns how many were cleared. */
export async function stripTitles(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction('samples', 'readwrite');
  let n = 0;
  let cur = await tx.store.openCursor();
  while (cur) {
    const s = cur.value as SampleRecord;
    if (s.title !== undefined) {
      const { title: _t, ...rest } = s;
      await cur.update(rest as SampleRecord);
      n++;
    }
    cur = await cur.continue();
  }
  await tx.done;
  return n;
}
