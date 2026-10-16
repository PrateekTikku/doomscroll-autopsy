import { describe, expect, it } from 'vitest';
import { createEmbedQueue, type EmbedJob } from './queue';

const job = (n: number, o: Partial<EmbedJob> = {}): EmbedJob => ({ tabId: 1, ts: n, text: `t${n}`, image: null, ...o });

describe('createEmbedQueue', () => {
  it('is FIFO', () => {
    const q = createEmbedQueue();
    q.push(job(1));
    q.push(job(2));
    expect(q.next()?.ts).toBe(1);
    expect(q.next()?.ts).toBe(2);
    expect(q.next()).toBeUndefined();
  });

  it('sub-samples above maxPerMin and recovers after a minute', () => {
    let t = 0;
    const q = createEmbedQueue({ maxPerMin: 3, now: () => t });
    const results = [1, 2, 3, 4, 5].map((n) => q.push(job(n)));
    expect(results).toEqual(['queued', 'queued', 'queued', 'skipped', 'skipped']);
    expect(q.stats().skipped).toBe(2);
    t = 60_000;
    expect(q.push(job(6))).toBe('queued');
  });

  it('drops the oldest visual images first when the queue is long', () => {
    const q = createEmbedQueue({ maxQueued: 2, maxPerMin: 100 });
    q.push(job(1, { image: 'data:a' }));
    q.push(job(2));
    q.push(job(3, { image: 'data:c' }));
    // images go first (oldest visual first); then, with none left, the oldest job is dropped
    expect(q.stats().droppedImages).toBe(2);
    expect(q.stats().droppedJobs).toBe(1);
    expect(q.size).toBe(2);
    const next = q.next()!;
    expect(next.ts).toBe(2);
    expect(q.next()?.image).toBeNull();
  });

  it('drops image-only jobs entirely, and the oldest job when none is visual', () => {
    const q = createEmbedQueue({ maxQueued: 1, maxPerMin: 100 });
    q.push(job(1, { text: null, image: 'data:a' }));
    q.push(job(2));
    expect(q.size).toBe(1);
    expect(q.next()?.ts).toBe(2);
    q.push(job(3));
    q.push(job(4));
    expect(q.size).toBe(1);
    expect(q.next()?.ts).toBe(4);
  });
});
