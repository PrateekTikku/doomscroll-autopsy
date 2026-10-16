import defaults from '@/assets/blocklist.json';
import type { Settings } from '@/lib/settings';
import { effectiveBlocklist } from '@/lib/observer/blocklist';

/** Pure edits of the user's blocklist (PDD 11.2). All return the new `settings.blocklist`. */
export type BlocklistEdits = Settings['blocklist'];

const DOMAIN = /^([a-z0-9-]+\.)+[a-z]{2,}$/;

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^\*?\.?/, '').replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN.test(d) ? d : null;
}

export function addDomain(edits: BlocklistEdits, input: string): { edits: BlocklistEdits; error?: string } {
  const d = normalizeDomain(input);
  if (!d) return { edits, error: 'Enter a site like example.com' };
  const removed = edits.removedDomains.filter((x) => x !== d);
  const added = defaults.domains.includes(d) || edits.addedDomains.includes(d) ? edits.addedDomains : [...edits.addedDomains, d];
  return { edits: { ...edits, addedDomains: added, removedDomains: removed } };
}

export function addKeyword(edits: BlocklistEdits, input: string): { edits: BlocklistEdits; error?: string } {
  const k = input.trim().toLowerCase();
  if (k.length < 3) return { edits, error: 'Keywords need at least 3 characters' };
  if (/[\s/]/.test(k)) return { edits, error: 'Keywords are one word, with no spaces or slashes' };
  if (defaults.keywords.includes(k) || edits.addedKeywords.includes(k)) return { edits };
  return { edits: { ...edits, addedKeywords: [...edits.addedKeywords, k] } };
}

/** Removes an entry: your own additions are deleted; a shipped default is marked removed. */
export function removeEntry(edits: BlocklistEdits, kind: 'domain' | 'keyword', value: string): BlocklistEdits {
  if (kind === 'keyword') return { ...edits, addedKeywords: edits.addedKeywords.filter((k) => k !== value) };
  if (edits.addedDomains.includes(value)) return { ...edits, addedDomains: edits.addedDomains.filter((d) => d !== value) };
  return defaults.domains.includes(value) && !edits.removedDomains.includes(value) ? { ...edits, removedDomains: [...edits.removedDomains, value] } : edits;
}

/** Entries to show: each with whether it is a shipped default. Shipped default keywords can't be removed. */
export function listEntries(edits: BlocklistEdits): Array<{ kind: 'domain' | 'keyword'; value: string; isDefault: boolean; removable: boolean }> {
  const list = effectiveBlocklist(edits);
  return [
    ...list.domains.map((value) => ({ kind: 'domain' as const, value, isDefault: defaults.domains.includes(value), removable: true })),
    ...list.keywords.map((value) => ({ kind: 'keyword' as const, value, isDefault: defaults.keywords.includes(value), removable: !defaults.keywords.includes(value) })),
  ];
}
