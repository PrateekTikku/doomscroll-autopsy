import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, getSettings, isPaused, onSettingsChanged, SENSITIVITY_THRESHOLD, updateSettings } from './index';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('lib/settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges updates and persists them in storage.local', async () => {
    await updateSettings({ sensitivity: 'strict', devMode: true });
    const s = await getSettings();
    expect(s.sensitivity).toBe('strict');
    expect(s.devMode).toBe(true);
    expect(s.retentionDays).toBe(30);
    expect((await fakeBrowser.storage.local.get('settings')).settings).toMatchObject({ sensitivity: 'strict' });
  });

  it('does not let callers mutate the defaults', async () => {
    const s = await getSettings();
    s.blocklist.addedDomains.push('example.com');
    expect(DEFAULT_SETTINGS.blocklist.addedDomains).toEqual([]);
  });

  it('notifies listeners on change and stops after unsubscribe', async () => {
    const listener = vi.fn();
    const off = onSettingsChanged(listener);
    await updateSettings({ pausedUntil: 'forever' });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ pausedUntil: 'forever' }));
    off();
    await updateSettings({ pausedUntil: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isPaused handles forever, future, past and null', () => {
    const now = 1_000;
    expect(isPaused({ ...DEFAULT_SETTINGS, pausedUntil: 'forever' }, now)).toBe(true);
    expect(isPaused({ ...DEFAULT_SETTINGS, pausedUntil: 2_000 }, now)).toBe(true);
    expect(isPaused({ ...DEFAULT_SETTINGS, pausedUntil: 500 }, now)).toBe(false);
    expect(isPaused({ ...DEFAULT_SETTINGS, pausedUntil: null }, now)).toBe(false);
  });

  it('uses the D-23 sensitivity thresholds', () => {
    expect(SENSITIVITY_THRESHOLD).toEqual({ gentle: 0.75, balanced: 0.6, strict: 0.45 });
  });
});
