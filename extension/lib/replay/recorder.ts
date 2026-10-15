import { clearStore, count, getAll, put } from '@/lib/db';
import type { PipelineEvent } from '@/lib/observer/types';

/**
 * Dev-mode recorder (PDD 7.7, D-35). Keeps the pipeline's input events in IndexedDB so they can be
 * downloaded as JSONL and replayed (M4). Never item text, DOM or screenshots: events are scrubbed
 * before they get here, and `text` is dropped again as a last line of defence.
 */
export async function recordEvent(ev: PipelineEvent): Promise<void> {
  if (ev.type === 'tick') return;
  const { text: _text, ...event } = ev as PipelineEvent & { text?: string };
  await put('recorderEvents', { ts: ev.ts, tabId: 'tabId' in ev ? ev.tabId : -1, event });
}

/** One event per line, oldest first. */
export async function exportJsonl(): Promise<string> {
  const records = await getAll('recorderEvents');
  records.sort((a, b) => a.ts - b.ts || (a.id ?? 0) - (b.id ?? 0));
  return records.map((r) => JSON.stringify(r.event)).join('\n') + (records.length ? '\n' : '');
}

export function recorderCount(): Promise<number> {
  return count('recorderEvents');
}

export function clearRecorder(): Promise<void> {
  return clearStore('recorderEvents');
}
