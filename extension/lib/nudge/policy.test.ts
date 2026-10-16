import { describe, expect, it } from 'vitest';
import { nudgeCopy } from './copy';
import { COOLDOWN_MS, decideNudge, inQuietHours, type PolicyInput } from './policy';

const NOW = new Date(2026, 9, 16, 15, 0, 0).getTime();
const base: PolicyInput = {
  now: NOW,
  score: 0.8,
  threshold: 0.6,
  currentLabel: 'drain',
  remainingCurrentMin: 0,
  maxStep: 2,
  quietHours: null,
  last: null,
};

describe('nudge policy', () => {
  it('shows step 1 first', () => {
    expect(decideNudge(base)).toEqual({ show: true, step: 1 });
  });
  it('never in Deep, Shallow or unlabelled territories', () => {
    for (const label of ['deep', 'shallow', null] as const) {
      expect(decideNudge({ ...base, currentLabel: label })).toEqual({ show: false, reason: 'not-drain' });
    }
  });
  it('never within the remaining allowance', () => {
    expect(decideNudge({ ...base, remainingCurrentMin: 0.5 })).toEqual({ show: false, reason: 'within-allowance' });
  });
  it('needs the score to reach the threshold (inclusive)', () => {
    expect(decideNudge({ ...base, score: 0.59 })).toEqual({ show: false, reason: 'below-threshold' });
    expect(decideNudge({ ...base, score: 0.6 }).show).toBe(true);
  });
  it('cooldown: blocked at 14:59, allowed at 15:00', () => {
    const last = { ts: NOW - COOLDOWN_MS + 1000, step: 1 as const, response: 'back' as const };
    expect(decideNudge({ ...base, last })).toEqual({ show: false, reason: 'cooldown' });
    expect(decideNudge({ ...base, last: { ...last, ts: NOW - COOLDOWN_MS } }).show).toBe(true);
  });
  it('escalates to step 2 after an ignored or snoozed nudge, and a pending one counts as ignored', () => {
    for (const response of ['ignored', 'snooze', null] as const) {
      expect(decideNudge({ ...base, last: { ts: NOW - 16 * 60_000, step: 1, response } })).toEqual({ show: true, step: 2 });
    }
  });
  it('a "back" response resets to step 1; an old nudge too', () => {
    expect(decideNudge({ ...base, last: { ts: NOW - 20 * 60_000, step: 2, response: 'back' } })).toEqual({ show: true, step: 1 });
    expect(decideNudge({ ...base, last: { ts: NOW - 90 * 60_000, step: 2, response: 'ignored' } })).toEqual({ show: true, step: 1 });
  });
  it('never exceeds the max step, and step 3 is not built yet', () => {
    const last = { ts: NOW - 20 * 60_000, step: 1 as const, response: 'ignored' as const };
    expect(decideNudge({ ...base, maxStep: 1, last })).toEqual({ show: true, step: 1 });
    expect(decideNudge({ ...base, maxStep: 3, last: { ...last, step: 2 } })).toEqual({ show: true, step: 2 });
  });
  it('quiet hours, including a range that wraps past midnight', () => {
    expect(decideNudge({ ...base, quietHours: { start: '14:00', end: '16:00' } })).toEqual({ show: false, reason: 'quiet-hours' });
    expect(inQuietHours(new Date(2026, 9, 16, 23, 30).getTime(), { start: '22:00', end: '07:00' })).toBe(true);
    expect(inQuietHours(new Date(2026, 9, 16, 6, 59).getTime(), { start: '22:00', end: '07:00' })).toBe(true);
    expect(inQuietHours(new Date(2026, 9, 16, 12, 0).getTime(), { start: '22:00', end: '07:00' })).toBe(false);
    expect(inQuietHours(NOW, null)).toBe(false);
  });
});

describe('nudge copy', () => {
  const facts = { territory: 'youtube.com · shorts', allowanceMin: 15, spentMin: 19.4, leftDeep: { name: 'docs.example · guide', minutesAgo: 23 } };
  it('uses the facts and the coach voice, with the two buttons', () => {
    const c = nudgeCopy(1, facts);
    expect(c.body).toContain('You left docs.example · guide 23 minutes ago.');
    expect(c.body).toContain('youtube.com · shorts');
    expect(c.primary).toBe('Back to it');
    expect(c.secondary).toBe('5 more min');
    expect(nudgeCopy(2, facts).secondary).toBe('Keep going');
  });
  it('says "used your N minutes" at the limit and "past" only beyond it', () => {
    expect(nudgeCopy(1, { territory: 'x', allowanceMin: 15, spentMin: 15.2 }).body).toContain("You've used your 15 minutes in x today.");
    expect(nudgeCopy(1, { territory: 'x', allowanceMin: 15, spentMin: 15.2 }).body).not.toContain('past');
    expect(nudgeCopy(2, { territory: 'x', allowanceMin: 15, spentMin: 30 }).body).toContain('30 minutes in x today, past your 15 minutes');
  });
  it('mentions nothing outside the browser (D-45) and no judgement', () => {
    const all = [1, 2].flatMap((s) => Object.values(nudgeCopy(s as 1 | 2, facts))).join(' ').toLowerCase();
    for (const bad of ['phone', 'offline', 'away from', 'off the computer', 'lazy', 'wasting', 'addict']) expect(all).not.toContain(bad);
  });
  it('singular minutes and no stale "left deep" line', () => {
    const c = nudgeCopy(1, { territory: 'x', allowanceMin: 1, spentMin: 1, leftDeep: { name: 'y', minutesAgo: 0 } });
    expect(c.body).toContain('1 minute in x');
    expect(c.body).not.toContain('You left');
  });
});
