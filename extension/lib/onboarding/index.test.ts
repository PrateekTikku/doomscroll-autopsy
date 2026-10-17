import { describe, expect, it } from 'vitest';
import { downloadLine, HONEST_PRIVACY, INSTALL_WARNING, OBSERVED, REQUIREMENTS, STORED, webGpuAvailable } from './index';

describe('onboarding copy', () => {
  it('uses the honest wording of PDD 11.1', () => {
    expect(HONEST_PRIVACY).toMatch(/never leaves your device/);
    expect(HONEST_PRIVACY).toMatch(/not anonymous/);
    expect(HONEST_PRIVACY).not.toMatch(/we only store anonymous/i);
  });
  it('explains the install warning and the storage promises', () => {
    expect(INSTALL_WARNING).toMatch(/all your data on all websites/);
    expect(STORED.join(' ')).toMatch(/Never stored: item text, screenshots, query strings/);
    expect(OBSERVED.join(' ')).toMatch(/discarded/);
  });
  it('keeps the browser-only promise in the limits', () => {
    expect(REQUIREMENTS.join(' ')).toMatch(/Nothing outside it is ever counted or shown/);
  });
});

describe('download line and WebGPU check', () => {
  it('covers each state', () => {
    expect(downloadLine('downloading', 41.6, null)).toBe('Downloading, 42%');
    expect(downloadLine('ready', 100, null)).toMatch(/No connection needed/);
    expect(downloadLine('error', 0, 'boom')).toBe('Could not start: boom');
    expect(downloadLine('not-started', 0, null)).toBe('Not downloaded yet.');
  });
  it('detects WebGPU', () => {
    expect(webGpuAvailable({ gpu: {} })).toBe(true);
    expect(webGpuAvailable({})).toBe(false);
  });
});
