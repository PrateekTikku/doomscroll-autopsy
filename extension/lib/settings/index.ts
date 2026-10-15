import { browser } from 'wxt/browser';

/**
 * User settings (PDD 4.4) in chrome.storage.local (D-52), so content scripts can check pause
 * state and the blocklist as their first action without touching the extension's IndexedDB.
 */
export type Sensitivity = 'gentle' | 'balanced' | 'strict';

export interface Settings {
  sensitivity: Sensitivity;
  maxNudgeStep: 1 | 2 | 3;
  /** Local "HH:MM" range, or null for none (Could tier). */
  quietHours: { start: string; end: string } | null;
  /** User edits on top of assets/blocklist.json. */
  blocklist: { addedDomains: string[]; removedDomains: string[]; addedKeywords: string[] };
  retentionDays: number;
  storeTitles: boolean;
  devMode: boolean;
  /** Epoch ms, 'forever', or null when not paused (PDD 11.3). */
  pausedUntil: number | 'forever' | null;
}

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  sensitivity: 'balanced',
  maxNudgeStep: 2,
  quietHours: null,
  blocklist: { addedDomains: [], removedDomains: [], addedKeywords: [] },
  retentionDays: 30,
  storeTitles: true,
  devMode: false,
  pausedUntil: null,
});

/** Spiral-score thresholds per sensitivity (D-23). */
export const SENSITIVITY_THRESHOLD: Record<Sensitivity, number> = { gentle: 0.75, balanced: 0.6, strict: 0.45 };

function withDefaults(stored: Partial<Settings> | undefined): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), ...stored };
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return withDefaults(result[SETTINGS_KEY] as Partial<Settings> | undefined);
}

/** Shallow-merges `patch` into the stored settings and returns the result. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Calls `listener` with the new settings whenever they change. Returns an unsubscribe function. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      listener(withDefaults(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined));
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

export function isPaused(settings: Settings, now = Date.now()): boolean {
  return settings.pausedUntil === 'forever' || (typeof settings.pausedUntil === 'number' && settings.pausedUntil > now);
}
