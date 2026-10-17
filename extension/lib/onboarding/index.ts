import { browser } from 'wxt/browser';

/** Onboarding (PDD 4.3): copy that must stay honest (PDD 11.1) and the "done" flag. Own storage key, so `Settings` is unchanged. */
export const ONBOARDED_KEY = 'onboardedAt';

export async function getOnboardedAt(): Promise<number | null> {
  const r = await browser.storage.local.get(ONBOARDED_KEY);
  return typeof r[ONBOARDED_KEY] === 'number' ? (r[ONBOARDED_KEY] as number) : null;
}

export async function markOnboarded(now = Date.now()): Promise<void> {
  await browser.storage.local.set({ [ONBOARDED_KEY]: now });
}

export const ONBOARDING_URL_PATH = '/onboarding.html';

/** What the extension looks at, and what it keeps. Rendered as lists on the page; tested for wording. */
export const OBSERVED = [
  'Which site and page path you are on (never the part of a URL after "?"), and how long you stay on each item.',
  'How fast you scroll, and whether videos play, pause or get skipped.',
  'Item text and thumbnails, only in memory, only long enough for the on-device model to turn them into numbers. They are then discarded.',
];

export const STORED = [
  'A vector (a list of numbers) for each item, plus the site, path, timestamps and dwell time. Kept for 30 days by default, and you can shorten that.',
  'Page titles, only if you leave "store titles" on. You can turn it off and remove titles already stored.',
  'Territory names and labels, your daily reports, and how you respond to nudges.',
  'Never stored: item text, screenshots, query strings, or anything about time outside the browser.',
];

export const HONEST_PRIVACY =
  'Your data never leaves your device. The only network traffic is the one-time model download from Hugging Face. There is no account, no analytics and no telemetry. Stored vectors are not anonymous: published research can partly turn embeddings back into text, so we do not call them anonymous. We simply never send them anywhere, and you can pause, forget or wipe everything at any time.';

export const INSTALL_WARNING =
  'Chrome says this extension can "read and change all your data on all websites". It needs that to see what you scroll on any site. It does not send anything anywhere, and sites on your blocklist (banking, health, passwords, email, government and more) are never observed. You can pause it from the toolbar at any time.';

export const REQUIREMENTS = [
  'Chrome (or another Chromium browser) on a computer with WebGPU. Without WebGPU the extension cannot read your browsing and says so.',
  'About 1.5 GB of free memory while the models run, and about 600 MB of disk (the writer model ships inside the extension; the embedding model downloads once, about 255 MB).',
  'It only knows about this browser. Nothing outside it is ever counted or shown.',
  'The nightly autopsy is written the first time Chrome is open after 3 am, or when you press "Write today\'s autopsy now".',
  'Territories appear after about two hours of browsing; until then, nudges use simple rules.',
];

/** Plain-language state of the one-time embedding model download. */
export function downloadLine(state: string, percent: number, error: string | null): string {
  switch (state) {
    case 'downloading':
      return `Downloading, ${Math.round(percent)}%`;
    case 'loading':
      return 'Starting the model…';
    case 'ready':
      return 'Ready. No connection needed from now on.';
    case 'unloaded':
      return 'Downloaded (asleep until your next item).';
    case 'error':
      return `Could not start: ${error ?? 'unknown error'}`;
    default:
      return 'Not downloaded yet.';
  }
}

export const webGpuAvailable = (nav: { gpu?: unknown } = navigator as never): boolean => !!nav.gpu;
