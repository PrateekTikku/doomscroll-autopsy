import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { closeDb, getAll } from '@/lib/db';
import { updateSettings } from '@/lib/settings';
import { BIN_MS } from './pipeline';
import { createObserverService, scrubEvent } from './service';
import type { PipelineEvent } from './types';

const T0 = 1_760_000_010_000 - (1_760_000_010_000 % BIN_MS);
const SECRET = 'Secret item text: my landlord dispute and a medical question';

beforeEach(async () => {
  fakeBrowser.reset();
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

async function browse(service: ReturnType<typeof createObserverService>) {
  const events: PipelineEvent[] = [
    { type: 'tab-activated', ts: T0, tabId: 3, windowId: 1 },
    { type: 'window-focus', ts: T0, windowId: 1 },
    { type: 'idle-state', ts: T0, state: 'active' },
    { type: 'heartbeat', ts: T0, tabId: 3, origin: 'https://www.youtube.com', path: '/results?search_query=secret+query#x' },
    {
      type: 'item',
      ts: T0 + 1000,
      tabId: 3,
      origin: 'https://www.youtube.com',
      path: '/watch?v=abc123&t=10#comments',
      title: 'A conference talk - YouTube',
      itemKey: 't:abc',
      isVisual: true,
      prevDwellMs: 0,
      text: SECRET,
    },
    { type: 'scroll', ts: T0 + 2000, tabId: 3, pxPerS: 800 },
    { type: 'heartbeat', ts: T0 + 15_000, tabId: 3, origin: 'https://www.youtube.com', path: '/watch?v=abc123' },
    { type: 'item', ts: T0 + 20_000, tabId: 3, origin: 'https://www.youtube.com', path: '/watch', itemKey: 't:def', isVisual: false, prevDwellMs: 19_000, text: SECRET },
    { type: 'heartbeat', ts: T0 + 30_000, tabId: 3, origin: 'https://www.youtube.com', path: '/watch' },
    { type: 'tick', ts: T0 + 65_000 },
  ];
  for (const ev of events) await service.enqueue(ev);
}

async function everything() {
  return [...(await getAll('samples')), ...(await getAll('bins')), ...(await getAll('recorderEvents'))];
}

describe('observer service', () => {
  it('stores samples and bins with no item text, query strings or fragments (acceptance)', async () => {
    await updateSettings({ devMode: true });
    const service = createObserverService({ now: () => T0 + 65_000 });
    await browse(service);

    const samples = await getAll('samples');
    const bins = await getAll('bins');
    const recorded = await getAll('recorderEvents');
    expect(samples).toHaveLength(2);
    expect(bins.length).toBeGreaterThanOrEqual(2);
    expect(recorded.length).toBeGreaterThan(5);
    expect(samples[0]).toMatchObject({ path: '/watch', title: 'A conference talk - YouTube', dwellMs: 19_000, vector: null });

    const stored = JSON.stringify(await everything());
    expect(stored).not.toContain('Secret');
    expect(stored).not.toContain('landlord');
    expect(stored).not.toContain('?');
    expect(stored).not.toContain('#');
    expect(stored).not.toContain('search_query');
    expect(stored).not.toContain('"text"');
  });

  it('drops titles when "store titles" is off', async () => {
    await updateSettings({ devMode: true, storeTitles: false });
    await browse(createObserverService({ now: () => T0 + 65_000 }));
    expect(JSON.stringify(await everything())).not.toContain('conference talk');
  });

  it('records nothing in normal mode', async () => {
    await browse(createObserverService({ now: () => T0 + 65_000 }));
    expect(await getAll('recorderEvents')).toHaveLength(0);
    expect(await getAll('samples')).toHaveLength(2);
  });

  it('stores and records nothing while paused, except the pause markers', async () => {
    await updateSettings({ devMode: true, pausedUntil: 'forever' });
    const service = createObserverService({ now: () => T0 + 65_000 });
    expect(await service.setSettings({ ...(await import('@/lib/settings').then((m) => m.getSettings())) })).toBe(true);
    await browse(service);
    expect(await getAll('samples')).toHaveLength(0);
    expect(await getAll('bins')).toHaveLength(0);
    expect((await getAll('recorderEvents')).map((r) => r.event.type)).toEqual(['pause']);
  });

  it('keeps pipeline state in storage.session across service restarts', async () => {
    const first = createObserverService({ now: () => T0 + 65_000 });
    await first.enqueue({ type: 'window-focus', ts: T0, windowId: 1 });
    const second = createObserverService({ now: () => T0 + 65_000 });
    expect(await second.hasState()).toBe(true);
  });

  it('reports live stats for today', async () => {
    const now = T0 + 65_000;
    const service = createObserverService({ now: () => now });
    await browse(service);
    const stats = await service.liveStats();
    expect(stats.samplesToday).toBe(2);
    expect(stats.activeMinToday).toBe(1); // 0:00–1:05 is active (last heartbeat at 30 s + 45 s pulse covers to 65 s)
    expect(stats.itemsPerMinNow).toBe(1); // only the item at 20 s is within the last minute
    expect(stats.pausedUntil).toBeNull();
  });

  it('scrubEvent removes text and sanitises paths without mutating the input', () => {
    const ev: PipelineEvent = { type: 'item', ts: 1, tabId: 1, origin: 'https://a.com', path: '/x?y#z', itemKey: 'k', isVisual: false, prevDwellMs: 0, text: 'hi', title: 't' };
    expect(scrubEvent(ev, { storeTitles: true })).toEqual({ type: 'item', ts: 1, tabId: 1, origin: 'https://a.com', path: '/x', itemKey: 'k', isVisual: false, prevDwellMs: 0, title: 't' });
    expect(ev).toHaveProperty('text', 'hi');
  });
});
