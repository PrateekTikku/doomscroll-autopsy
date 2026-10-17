/**
 * Packages the build for the first user: wxt zip → ../releases/doomscroll-autopsy-<version>.zip (gitignored),
 * then prints size and sha256. Run via `npm run zip` (builds first).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse((await import('node:fs')).readFileSync(resolve(root, 'package.json'), 'utf8')).version;
execFileSync('npx', ['wxt', 'zip'], { cwd: root, stdio: 'inherit' });
const out = resolve(root, '.output');
const zip = readdirSync(out).find((f) => f.endsWith('-chrome.zip') && f.includes(version));
if (!zip) throw new Error(`wxt zip produced no *-chrome.zip for ${version} in ${out}`);
const dest = resolve(root, '..', 'releases', `doomscroll-autopsy-${version}.zip`);
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(resolve(out, zip), dest);
const hash = createHash('sha256');
for await (const chunk of createReadStream(dest)) hash.update(chunk);
console.log(`release: ${dest}\nsize: ${(statSync(dest).size / 1e6).toFixed(1)} MB\nsha256: ${hash.digest('hex')}`);
