import type * as TF from '@tensorflow/tfjs';
import type { BinRecord } from '@/lib/db';
import {
  buildTrainingSet,
  buildVocab,
  DENSE_DIM,
  EMBED_DIM,
  HIDDEN,
  SEQ_LEN,
  velocityStats,
  type GruModel,
  type GruWeights,
} from './gru';
import type { TerritoryInfo } from './scoring';

/**
 * GRU training with TF.js (PDD 9.6). Runs in the offscreen document (or node, in tests); the
 * service worker never imports this file. TF.js is loaded lazily so the bundle for other pages stays small.
 */
export interface TrainOptions {
  epochs?: number;
  batchSize?: number;
  maxWindows?: number;
  learningRate?: number;
  /** 'webgpu' is tried first in a browser (S3), then the CPU backend. */
  backend?: 'webgpu' | 'cpu' | 'auto';
  seed?: number;
  onEpoch?: (epoch: number, loss: number) => void;
}

export const MIN_TRAIN_WINDOWS = 200;

let tfPromise: Promise<typeof TF> | null = null;
export async function loadTf(backend: TrainOptions['backend'] = 'auto'): Promise<{ tf: typeof TF; backend: string }> {
  tfPromise ??= import('@tensorflow/tfjs');
  const tf = await tfPromise;
  if ((backend === 'auto' || backend === 'webgpu') && typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      await import('@tensorflow/tfjs-backend-webgpu');
      if (await tf.setBackend('webgpu')) {
        await tf.ready();
        return { tf, backend: 'webgpu' };
      }
    } catch {
      // fall through to CPU
    }
  }
  await tf.setBackend('cpu');
  await tf.ready();
  return { tf, backend: 'cpu' };
}

/** The architecture, shared by training and the parity test. */
export function buildKerasModel(tf: typeof TF, vocab: number, seed = 7) {
  const ids = tf.input({ shape: [null as unknown as number], dtype: 'int32', name: 'ids' });
  const dense = tf.input({ shape: [null as unknown as number, DENSE_DIM], name: 'dense' });
  const emb = tf.layers.embedding({ inputDim: vocab, outputDim: EMBED_DIM, name: 'emb', embeddingsInitializer: tf.initializers.randomNormal({ stddev: 0.1, seed }) }).apply(ids) as TF.SymbolicTensor;
  const x = tf.layers.concatenate({ axis: -1 }).apply([emb, dense]) as TF.SymbolicTensor;
  const h = tf.layers
    .gru({ units: HIDDEN, recurrentActivation: 'sigmoid', returnSequences: false, name: 'gru', kernelInitializer: tf.initializers.glorotUniform({ seed }), recurrentInitializer: tf.initializers.orthogonal({ seed }) })
    .apply(x) as TF.SymbolicTensor;
  const next = tf.layers.dense({ units: vocab, activation: 'softmax', name: 'next' }).apply(h) as TF.SymbolicTensor;
  const occ = tf.layers.dense({ units: vocab, activation: 'softmax', name: 'occ' }).apply(h) as TF.SymbolicTensor;
  return tf.model({ inputs: [ids, dense], outputs: [next, occ] });
}

const flat = async (t: TF.Tensor) => Array.from(await t.data());

export async function extractWeights(tf: typeof TF, model: TF.LayersModel): Promise<GruWeights> {
  const w = (name: string) => model.getLayer(name).getWeights();
  const [embedding] = w('emb');
  const [kernel, recurrent, bias] = w('gru');
  const [nextW, nextB] = w('next');
  const [occW, occB] = w('occ');
  void tf;
  return {
    embedding: await flat(embedding!),
    kernel: await flat(kernel!),
    recurrent: await flat(recurrent!),
    bias: await flat(bias!),
    nextW: await flat(nextW!),
    nextB: await flat(nextB!),
    occW: await flat(occW!),
    occB: await flat(occB!),
  };
}

/** Trains on `bins` (sorted). Returns null when there are too few usable windows. */
export async function trainGru(bins: BinRecord[], territories: Map<string, TerritoryInfo>, opts: TrainOptions = {}): Promise<GruModel | null> {
  const vocab = buildVocab(bins);
  const stats = velocityStats(bins);
  const set = buildTrainingSet(bins, territories, vocab, stats, opts.maxWindows ?? 2500);
  if (set.ids.length < MIN_TRAIN_WINDOWS) return null;
  const { tf, backend } = await loadTf(opts.backend);
  const V = vocab.length;
  const model = buildKerasModel(tf, V, opts.seed ?? 7);
  model.compile({ optimizer: tf.train.adam(opts.learningRate ?? 0.005), loss: ['categoricalCrossentropy', 'categoricalCrossentropy'] });
  const N = set.ids.length;
  const ids = tf.tensor2d(set.ids, [N, SEQ_LEN], 'int32');
  const dense = tf.tensor3d(set.dense.flat(2), [N, SEQ_LEN, DENSE_DIM]);
  const nextY = tf.oneHot(tf.tensor1d(set.next, 'int32'), V).toFloat();
  const occY = tf.tensor2d(set.occupancy, [N, V]);
  let finalLoss: number | null = null;
  const epochs = opts.epochs ?? 8;
  try {
    const hist = await model.fit([ids, dense], [nextY, occY], {
      epochs,
      batchSize: opts.batchSize ?? 64,
      shuffle: true,
      verbose: 0,
      // The default yields with requestAnimationFrame, which never fires in a hidden or offscreen document.
      yieldEvery: 'never',
      callbacks: { onEpochEnd: (e, logs) => opts.onEpoch?.(e, (logs?.loss as number) ?? NaN) },
    });
    finalLoss = (hist.history.loss?.[epochs - 1] as number | undefined) ?? null;
    const weights = await extractWeights(tf, model);
    if (![...weights.kernel, ...weights.nextW].every(Number.isFinite)) return null;
    return {
      version: 1,
      vocab,
      stats,
      weights,
      trainedThrough: bins[bins.length - 1]?.binStart ?? null,
      trainWindows: N,
      epochs,
      finalLoss,
      backend,
    };
  } finally {
    tf.dispose([ids, dense, nextY, occY]);
    model.dispose();
  }
}
