/**
 * Dev-only harness for spikes S2 (EmbeddingGemma 2 text + vision) and S3 (TF.js WebGPU next to
 * Transformers.js). Built only with `npm run build:spike`; driven by scripts/s2-probe.mjs, which reads
 * `window.__result`. Query: ?dtype=q4f16&device=webgpu&vision=1&s3=1&texts=40&images=10
 */
import { loadEmbedder, type Dtype, type Device } from '@/lib/ml/embedder';
import { truncateAndNormalize } from '@/lib/ml/truncate';

const q = new URLSearchParams(location.search);
const dtype = (q.get('dtype') ?? 'q4f16') as Dtype;
const device = (q.get('device') ?? 'webgpu') as Device;
const vision = q.get('vision') !== '0';
const nTexts = Number(q.get('texts') ?? 40);
const nImages = Number(q.get('images') ?? 10);

const out = document.getElementById('out')!;
const result: Record<string, unknown> = { dtype, device, vision, ua: navigator.userAgent };
(window as unknown as { __result: unknown }).__result = result;
const log = (k: string, v: unknown) => {
  result[k] = v;
  out.textContent = JSON.stringify(result, null, 2);
};

const TOPICS = [
  'How to write a rust async runtime from scratch, part 3: wakers and executors',
  'Quarterly planning doc: roadmap, risks and staffing for the platform team',
  'Cute cat compilation 2026 try not to laugh #shorts',
  'Breaking: markets react to the latest central bank statement',
  'MDN: Array.prototype.reduce() - JavaScript reference',
  'r/AskReddit: What is the most unhinged thing you have seen at work?',
  'Figma: design system tokens and components review',
  'Thread: why I quit my job to build in public, and what I learned in 90 days',
  'Gmail: Re: invoice for September, please confirm the amount',
  'Slack: #eng-oncall incident 4821 postmortem draft',
];
const text = (i: number) => `${TOPICS[i % TOPICS.length]} ${'lorem ipsum dolor sit amet '.repeat(1 + (i % 12))}`;

function makeImage(i: number): string {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 1280;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 720, 1280);
  grad.addColorStop(0, `hsl(${(i * 53) % 360} 70% 50%)`);
  grad.addColorStop(1, `hsl(${(i * 97 + 120) % 360} 60% 30%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 720, 1280);
  g.fillStyle = 'white';
  g.font = 'bold 64px sans-serif';
  g.fillText(TOPICS[i % TOPICS.length]!.slice(0, 22), 40, 640);
  return c.toDataURL('image/jpeg', 0.6);
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: s[Math.floor(s.length / 2)] ?? null, p95: s[Math.floor(s.length * 0.95)] ?? null, max: s.at(-1) ?? null };
};
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

async function main() {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features?: Set<string> } | null> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  log('webgpu', { available: !!gpu, adapter: !!adapter, shaderF16: adapter?.features?.has('shader-f16') ?? false });

  let t0 = performance.now();
  let lastPct = 0;
  const embedder = await loadEmbedder({ device, dtype, vision, onProgress: (p) => (lastPct = p.percent) });
  log('loadMs', Math.round(performance.now() - t0));
  log('downloadPercentSeen', Math.round(lastPct));

  // Text
  const textMs: number[] = [];
  const textVecs: Float32Array[] = [];
  let nonFinite = 0;
  await embedder.embed({ text: 'warm-up' });
  for (let i = 0; i < nTexts; i++) {
    t0 = performance.now();
    const v = await embedder.embed({ text: text(i) });
    textMs.push(performance.now() - t0);
    if (!v) nonFinite++;
    else textVecs.push(v);
  }
  log('text', { ...stats(textMs), nonFinite, dim: textVecs[0]?.length });

  // Sanity: same topic closer than different topic (256d, as stored)
  const a = truncateAndNormalize(textVecs[0]!, 256)!;
  const same = truncateAndNormalize(textVecs[TOPICS.length]!, 256)!; // same topic, longer filler
  const other = truncateAndNormalize(textVecs[2]!, 256)!;
  log('semantic', { sameTopic: dot(a, same), otherTopic: dot(a, other) });

  if (vision) {
    const imgMs: number[] = [];
    const mixMs: number[] = [];
    let imgNonFinite = 0;
    const imgs = Array.from({ length: nImages }, (_, i) => makeImage(i));
    try {
      await embedder.embed({ image: imgs[0] });
      for (const img of imgs) {
        t0 = performance.now();
        const v = await embedder.embed({ image: img });
        imgMs.push(performance.now() - t0);
        if (!v) imgNonFinite++;
      }
      let mixNonFinite = 0;
      for (let i = 0; i < nImages; i++) {
        t0 = performance.now();
        const v = await embedder.embed({ text: text(i), image: imgs[i] });
        mixMs.push(performance.now() - t0);
        if (!v) mixNonFinite++;
      }
      log('image', { ...stats(imgMs), nonFinite: imgNonFinite });
      log('interleaved', { ...stats(mixMs), nonFinite: mixNonFinite });
    } catch (err) {
      log('visionError', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }

  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  log('jsHeapMB', mem ? Math.round(mem.usedJSHeapSize / 1e6) : null);

  if (q.get('s3') === '1') {
    try {
      t0 = performance.now();
      const tf = await import('@tensorflow/tfjs');
      await import('@tensorflow/tfjs-backend-webgpu');
      await tf.setBackend('webgpu');
      await tf.ready();
      const model = tf.sequential({
        layers: [tf.layers.dense({ inputShape: [8], units: 16, activation: 'relu' }), tf.layers.dense({ units: 1, activation: 'sigmoid' })],
      });
      model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' });
      const xs = tf.randomNormal([256, 8]);
      const ys = tf.cast(tf.greater(tf.sum(xs, 1, true), 0), 'float32');
      const hist = await model.fit(xs, ys, { epochs: 10, verbose: 0 });
      const losses = hist.history.loss as number[];
      // Transformers.js must still work after TF.js took its own device.
      const v = await embedder.embed({ text: 'after tf.js' });
      log('s3', { backend: tf.getBackend(), ms: Math.round(performance.now() - t0), firstLoss: losses[0], lastLoss: losses.at(-1), embedAfterOk: !!v });
    } catch (err) {
      log('s3', { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
  log('done', true);
}

main().catch((err) => log('error', err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err)));
