import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { effectiveBlocklist, excludeMatchesFor, isBlockedHost } from './blocklist';

const noEdits = DEFAULT_SETTINGS.blocklist;

describe('blocklist', () => {
  const list = effectiveBlocklist(noEdits);

  it('blocks default domains and their subdomains', () => {
    expect(isBlockedHost('chase.com', list)).toBe(true);
    expect(isBlockedHost('secure.chase.com', list)).toBe(true);
    expect(isBlockedHost('mail.google.com', list)).toBe(true);
    expect(isBlockedHost('notchase.com', list)).toBe(false);
    expect(isBlockedHost('www.youtube.com', list)).toBe(false);
  });

  it('blocks suffixes and keywords', () => {
    expect(isBlockedHost('www.irs.gov', list)).toBe(true);
    expect(isBlockedHost('www.gov.uk', list)).toBe(true);
    expect(isBlockedHost('mybank-online.example', list)).toBe(true);
    expect(isBlockedHost('developer.mozilla.org', list)).toBe(false);
  });

  it('applies user additions and removals', () => {
    const edited = effectiveBlocklist({ addedDomains: ['Example.com'], removedDomains: ['chase.com'], addedKeywords: ['casino'] });
    expect(isBlockedHost('www.example.com', edited)).toBe(true);
    expect(isBlockedHost('chase.com', edited)).toBe(false);
    expect(isBlockedHost('bestcasino.net', edited)).toBe(true);
  });

  it('builds match patterns for excludeMatches (domains and suffixes, never keywords)', () => {
    const patterns = excludeMatchesFor(list);
    expect(patterns).toContain('*://*.chase.com/*');
    expect(patterns).toContain('*://*.gov/*');
    expect(patterns.some((p) => p.includes('bank') && !p.includes('.'))).toBe(false);
    for (const p of patterns) expect(p).toMatch(/^\*:\/\/\*\.[a-z0-9.-]+\/\*$/);
    expect(excludeMatchesFor(list, { suffixes: false })).not.toContain('*://*.gov/*');
  });
});
