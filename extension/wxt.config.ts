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
