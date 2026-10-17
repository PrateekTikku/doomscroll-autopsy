# M8.1 GRU: spike G2 and what it showed

- **G2 (cost):** in the real extension (headless Chrome, offscreen document) on the replayed persona history (8 days, 8,561 bins, 2,219 training windows): **12.7 s on the WebGPU backend, 151 s on the CPU backend** (8 epochs). Pass bar was 90 s: met with WebGPU; the CPU fallback is slower but works. In node (CPU), 1,100-1,500 windows take 80-100 s.
- **A real bug found by running it in the extension, not in node:** TF.js's `fit` yields with `requestAnimationFrame`, which never fires in an offscreen document, so training hung forever. Fixed with `yieldEvery: 'never'` (D-61).
- **Accuracy:** next-state top-1/top-3 and spiral AUC are within a point or two of Markov on synthetic personas (`gru-vs-markov.md`); across runs of the same data the GRU's AUC varied (0.91 to 0.995), which is why promotion needs a 0.005 margin and why Markov stays on duty. On these synthetic days the GRU is never promoted, and that is the honest result (K-18: the generator makes everything easy).
- Parity: the plain-TypeScript forward pass used at runtime matches the TF.js model to 4 decimals (`lib/ml/gru.test.ts`).
- Real-data question left for the owner / friend: after 2+ days of real browsing, Dashboard → Prediction and replay → GRU shows the held-out comparison and the verdict.
