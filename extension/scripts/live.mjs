/**
 * Copies the production build to a stable folder for the owner's daily Chrome profile.
 * Chrome derives an unpacked extension's ID (and so its IndexedDB) from the folder path, so the
 * owner loads extension/.live/chrome-mv3 once and keeps it there; other builds never touch it.
 * Usage: npm run live   (then click "reload" on the extension in chrome://extensions)
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, '.output/chrome-mv3');
const dest = resolve(root, '.live/chrome-mv3');
if (!existsSync(resolve(src, 'manifest.json'))) throw new Error(`No build at ${src}; run the build first`);
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Live build updated: ${dest}`);
console.log('First time: chrome://extensions → Developer mode → Load unpacked → pick that folder.');
console.log('After that: click the reload icon on Doomscroll Autopsy in chrome://extensions.');
