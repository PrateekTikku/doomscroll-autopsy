import { describe, expect, it } from 'vitest';
import type { Embedder } from './embedder';
import { createModelHost, percentile } from './host';

const fakeEmbedder = (vec: Float32Array | null): Embedder => ({
  device: 'webgpu',
  dtype: 'q4f16',
  vision: true,
  embed: async () => vec,
  dispose: async () => undefined,
});

describe('model host', () => {
  it('loads lazily, reports ready and latency stats', async () => {
    let loads = 0;
    const host = createModelHost(
      async () => {
        loads++;
        return fakeEmbedder(new Float32Array([1, 2, 3]));
      },
      async () => 'webgpu',
    );
    expect(host.status().state).toBe('idle');
    expect(loads).toBe(0);
    const r = await host.embed({ text: 'x', image: null });
    expect(r.vector).toEqual([1, 2, 3]);
    await host.embed({ text: 'y', image: null });
    expect(loads).toBe(1);
    const s = host.status();
    expect(s).toMatchObject({ state: 'ready', device: 'webgpu', embeds: 2, failed: 0 });
    expect(s.medianMs).not.toBeNull();
  });

  it('counts a non-finite result as failed and unloads on request', async () => {
    const host = createModelHost(async () => fakeEmbedder(null), async () => 'webgpu');
    expect((await host.embed({ text: 'x', image: null })).vector).toBeNull();
    expect(host.status().failed).toBe(1);
    expect((await host.unload()).state).toBe('unloaded');
  });

  it('warm() loads without an item and reports a failure in status instead of throwing', async () => {
    let loads = 0;
    const ok = createModelHost(async () => (loads++, fakeEmbedder(null)), async () => 'webgpu');
    expect((await ok.warm()).state).toBe('ready');
    expect(loads).toBe(1);
    const bad = createModelHost(async () => fakeEmbedder(null), async () => {
      throw new Error('WebGPU is not available');
    });
    expect(await bad.warm()).toMatchObject({ state: 'error', error: expect.stringContaining('WebGPU') });
  });

  it('reports an error when WebGPU is missing, without loading', async () => {
    let loads = 0;
    const host = createModelHost(
      async () => {
        loads++;
        return fakeEmbedder(null);
      },
      async () => {
        throw new Error('WebGPU is not available');
      },
    );
    await expect(host.embed({ text: 'x', image: null })).rejects.toThrow('WebGPU');
    expect(loads).toBe(0);
    expect(host.status()).toMatchObject({ state: 'error', error: expect.stringContaining('WebGPU') });
  });
});

describe('percentile', () => {
  it('handles empty and small arrays', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(3);
  });
});
