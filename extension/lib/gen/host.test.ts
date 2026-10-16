import { describe, expect, it } from 'vitest';
import { createGenHost } from './host';
import type { Generator } from './generator';

function fake(over: Partial<Generator> = {}) {
  const calls: Array<{ prompt: string; sample: boolean }> = [];
  let disposed = 0;
  const g: Generator = {
    device: 'webgpu',
    async generate(o) {
      calls.push({ prompt: o.prompt, sample: o.sample });
      return { text: `out:${o.prompt}`, newTokens: 100, ms: 1000 };
    },
    async dispose() {
      disposed++;
    },
    ...over,
  };
  return { g, calls, disposed: () => disposed };
}

function timers() {
  const pending: Array<() => void> = [];
  return { setTimer: (fn: () => void) => pending.push(fn), clearTimer: () => undefined, fire: () => pending.splice(0).forEach((f) => f()) };
}

describe('writer model host', () => {
  it('loads on the first request only and reports status', async () => {
    const f = fake();
    let loads = 0;
    const host = createGenHost({ load: async () => (loads++, f.g), ...timers() });
    expect(host.status().state).toBe('not-started');
    const [a, b] = await Promise.all([host.generate({ prompt: 'a', maxNewTokens: 5, sample: false }), host.generate({ prompt: 'b', maxNewTokens: 5, sample: true })]);
    expect([a.text, b.text]).toEqual(['out:a', 'out:b']);
    expect(loads).toBe(1);
    expect(host.status()).toMatchObject({ state: 'ready', generations: 2, device: 'webgpu', medianTokPerS: 100 });
    expect(f.calls.map((c) => c.prompt)).toEqual(['a', 'b']); // one at a time, in order
  });

  it('runs requests one at a time', async () => {
    let running = 0;
    let max = 0;
    const f = fake({
      async generate() {
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return { text: 'x', newTokens: 1, ms: 5 };
      },
    });
    const host = createGenHost({ load: async () => f.g, ...timers() });
    await Promise.all([1, 2, 3, 4].map(() => host.generate({ prompt: 'p', maxNewTokens: 1, sample: false })));
    expect(max).toBe(1);
  });

  it('unloads when idle, and reloads on the next request', async () => {
    const f = fake();
    const t = timers();
    let loads = 0;
    const host = createGenHost({ load: async () => (loads++, f.g), ...t });
    await host.generate({ prompt: 'a', maxNewTokens: 5, sample: false });
    t.fire();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.status().state).toBe('unloaded');
    expect(f.disposed()).toBe(1);
    await host.generate({ prompt: 'b', maxNewTokens: 5, sample: false });
    expect(loads).toBe(2);
  });

  it('records a load failure, rejects the request and tries again next time', async () => {
    let n = 0;
    const f = fake();
    const host = createGenHost({
      load: async () => {
        if (n++ === 0) throw new Error('no model files');
        return f.g;
      },
      ...timers(),
    });
    await expect(host.generate({ prompt: 'a', maxNewTokens: 5, sample: false })).rejects.toThrow('no model files');
    expect(host.status()).toMatchObject({ state: 'error', error: 'no model files' });
    expect((await host.generate({ prompt: 'b', maxNewTokens: 5, sample: false })).text).toBe('out:b');
    expect(host.status().state).toBe('ready');
  });

  it('unload on demand is safe when nothing is loaded', async () => {
    const host = createGenHost({ load: async () => fake().g, ...timers() });
    expect((await host.unload()).state).toBe('not-started');
  });
});
