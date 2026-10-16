/**
 * Copies the fine-tuned Gemma 3 270M ONNX export (T2) into public/models/doomscroll-270m/ so the
 * extension can load it from its own files (M6, D-58): the model is not on Hugging Face yet, and
 * publishing needs the owner's explicit yes. Runs before build/dev/live; the output is git-ignored.
 * Source: $DOOMSCROLL_MODEL_DIR, else ../training/data/runs/run3/onnx_final.
 * Without the source the extension still builds; the writer then reports "unavailable" and every
 * name and autopsy falls back to the baseline name / template.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(process.env.DOOMSCROLL_MODEL_DIR ?? resolve(root, '../training/data/runs/run3/onnx_final'));
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
  // Two exports can have identical file sizes, so identity is the source path + size + mtime of every file.
  const stamp = FILES.map((f) => {
    const st = statSync(resolve(from, f));
    return `${f}:${st.size}:${Math.round(st.mtimeMs)}`;
  }).join('\n') + `\n${from}`;
  const marker = resolve(to, '.source');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === stamp) {
    console.log('[copy-model] up to date: public/models/doomscroll-270m');
  } else {
    for (const f of FILES) {
      const src = resolve(from, f);
      if (!existsSync(src)) throw new Error(`Missing ${f} in ${from}`);
      copyFileSync(src, resolve(to, f));
    }
    writeFileSync(marker, stamp);
    console.log(`[copy-model] copied ${FILES.length} files from ${from} to public/models/doomscroll-270m`);
  }
}
