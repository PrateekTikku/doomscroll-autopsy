/**
 * Opens the demo profile in a normal (headed) Chrome window. Current Chrome ignores `--load-extension`, so the
 * extension is loaded once by hand from the same folder it was built from; its ID depends only on that path, so
 * it finds the demo data already in the profile.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const demo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.demo');
if (!existsSync(join(demo, 'profile'))) throw new Error('No demo profile yet: run `npm run demo:profile`.');
const idb = join(demo, 'profile/Default/IndexedDB');
const id = existsSync(idb) ? readdirSync(idb).map((n) => /^chrome-extension_([a-p]{32})_0/.exec(n)?.[1]).find(Boolean) : null;
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
spawn(chrome, [`--user-data-dir=${join(demo, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'chrome://extensions'], { detached: true, stdio: 'ignore' }).unref();
console.log(`Opened Chrome with the demo profile.
First time only: on chrome://extensions turn on "Developer mode" (top right), click "Load unpacked" and pick
  ${join(demo, 'chrome-mv3')}
The extension ID should be ${id ?? '(see the build output)'}; if it is, the demo data is already there.
Then open the dashboard: chrome-extension://${id ?? '<id>'}/dashboard.html`);
