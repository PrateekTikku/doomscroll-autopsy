/**
 * Copies the fine-tuned Gemma 3 270M ONNX export (T2) into public/models/doomscroll-270m/ so the
 * extension can load it from its own files (M6, D-58): the model is not on Hugging Face yet, and
 * publishing needs the owner's explicit yes. Runs before build/dev/live; the output is git-ignored.
 * Source: $DOOMSCROLL_MODEL_DIR, else ../training/data/runs/run1/onnx_final.
 * Without the source the extension still builds; the writer then reports "unavailable" and every
 * name and autopsy falls back to the baseline name / template.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(process.env.DOOMSCROLL_MODEL_DIR ?? resolve(root, '../training/data/runs/run1/onnx_final'));
const to = resolve(root, 'public/models/doomscroll-270m');
const FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'chat_template.jinja',
  'onnx/model_fp16.onnx',
  'onnx/model_fp16.onnx_data',
];

if (!existsSync(resolve(from, 'onnx/model_fp16.onnx'))) {
  console.warn(`[copy-model] no model at ${from}: building without the writer model (templates and baseline names only)`);
} else {
  mkdirSync(resolve(to, 'onnx'), { recursive: true });
  let copied = 0;
  for (const f of FILES) {
    const src = resolve(from, f);
    const dst = resolve(to, f);
    if (!existsSync(src)) throw new Error(`Missing ${f} in ${from}`);
    if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
    copyFileSync(src, dst);
    copied++;
  }
  console.log(`[copy-model] ${copied ? `copied ${copied} file(s) to` : 'up to date:'} public/models/doomscroll-270m`);
}
