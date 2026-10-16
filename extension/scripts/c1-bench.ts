// Spike C1: cost of choosing k + fitting on N synthetic 256d vectors. Run: npx tsx scripts/c1-bench.ts [N]
import { fitClusters } from '../lib/ml/kmeans';
import { plantedClusters } from '../lib/ml/testutil';

const N = Number(process.argv[2] ?? 6000);
const k = 14;
const { points } = plantedClusters(k, Math.round(N / k), 256, 0.9);
const t0 = performance.now();
const res = fitClusters(points);
const ms = performance.now() - t0;
console.log(JSON.stringify({ n: points.length, plantedK: k, chosenK: res.k, silhouette: +res.silhouette.toFixed(3), ms: Math.round(ms) }));
