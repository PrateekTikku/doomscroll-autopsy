import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// See PDD 11.5 (permissions) and 12.2 (MV3 platform details).
export default defineConfig({
  alias: {
    '@shared': resolve(__dirname, '../shared'),
  },
  vite: () => ({
    plugins: [preact()],
    // shared/ lives outside the extension root; let the dev server read it.
    server: { fs: { allow: [resolve(__dirname, '..')] } },
  }),
  hooks: {
    // Transformers.js' bundle also emits its own copy of the ORT wasm (26 MB); we point it at
    // /ort/ explicitly (scripts/copy-ort.mjs), so drop the unused duplicate.
    'build:done': async (wxt) => {
      const { readdir, rm } = await import('node:fs/promises');
      const dir = resolve(wxt.config.outDir, 'assets');
      for (const f of await readdir(dir).catch(() => [] as string[])) if (/^ort-wasm.*\.wasm$/.test(f)) await rm(resolve(dir, f));
    },
    // The S2/S3 spike harness is built only with `npm run build:spike` (SPIKE=1).
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (process.env.SPIKE) return;
      for (let i = entrypoints.length - 1; i >= 0; i--) if (entrypoints[i]!.name === 'spike') entrypoints.splice(i, 1);
    },
  },
  manifest: {
    name: 'Doomscroll Autopsy',
    description: 'Protect your deep work from the feed. Runs Gemma models in your browser; nothing you browse leaves your device.',
    // `commands` is a manifest key, not a permission; it is added with the shortcut (Could tier).
    permissions: ['storage', 'unlimitedStorage', 'offscreen', 'tabs', 'alarms', 'idle', 'scripting'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      // ONNX Runtime Web and TF.js need WebAssembly compilation.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
