/**
 * Copies the ONNX Runtime Web wasm files next to the extension (public/ort/), so Transformers.js
 * loads them from the extension instead of jsDelivr (privacy: the only network host is Hugging Face).
 * Runs before build and dev; the output is git-ignored.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/onnxruntime-web/dist');
const to = resolve(root, 'public/ort');
mkdirSync(to, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  if (!existsSync(resolve(from, f))) throw new Error(`Missing ${f}; run npm ci first`);
  copyFileSync(resolve(from, f), resolve(to, f));
}
