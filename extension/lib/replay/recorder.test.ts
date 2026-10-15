import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll } from '@/lib/db';
import type { PipelineEvent } from '@/lib/observer/types';
import { clearRecorder, exportJsonl, recordEvent, recorderCount } from './recorder';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('recorder (PDD 7.7)', () => {
  it('keeps events without text and exports them as JSONL in time order', async () => {
    await recordEvent({ type: 'heartbeat', ts: 20, tabId: 1, origin: 'https://a.com', path: '/' });
    await recordEvent({ type: 'item', ts: 10, tabId: 1, origin: 'https://a.com', path: '/', itemKey: 'k', isVisual: false, prevDwellMs: 0, text: 'never stored' } as PipelineEvent);
    await recordEvent({ type: 'window-focus', ts: 30, windowId: null });
    await recordEvent({ type: 'tick', ts: 40 });

    expect(await recorderCount()).toBe(3);
    expect(JSON.stringify(await getAll('recorderEvents'))).not.toContain('never stored');
    const lines = (await exportJsonl()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['item', 'heartbeat', 'window-focus']);
    expect(lines[2]).toEqual({ type: 'window-focus', ts: 30, windowId: null });

    await clearRecorder();
    expect(await recorderCount()).toBe(0);
    expect(await exportJsonl()).toBe('');
  });
});
