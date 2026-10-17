/**
 * Reads the owner's copy of Chrome's History database (read-only, `.demo-history/History`, git-ignored) and writes
 * `.demo-history/days.json`: per local day, the visits to whitelisted hosts only, reduced to
 * { ts, host, seg, durMs }. No titles, no query strings, no full paths, nothing about other sites.
 * Usage: node scripts/demo/extract-history.mjs [--from 2026-07-19]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { SAFE_SEGMENTS } from './sites.mjs';

const SITES = JSON.parse(readFileSync(new URL('./sites.json', import.meta.url), 'utf8'));

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const db = resolve(root, '.demo-history/History');
const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : '2026-07-19';
const sql = `select (v.visit_time/1000 - 11644473600000) as ms, u.url, v.visit_duration/1000 as dur from visits v join urls u on u.id = v.url order by v.visit_time`;
const out = execFileSync('sqlite3', ['-readonly', '-separator', '\t', db, sql], { maxBuffer: 1 << 28 }).toString();

const fromMs = new Date(`${from}T00:00:00`).getTime();
const days = {};
let total = 0;
let kept = 0;
for (const line of out.split('\n')) {
  if (!line) continue;
  const [msS, url, durS] = line.split('\t');
  const ms = Number(msS);
  total++;
  if (ms < fromMs) continue;
  let u;
  try {
    u = new URL(url);
  } catch {
    continue;
  }
  if (!/^https?:$/.test(u.protocol) || !(u.host in SITES)) continue;
  const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
  const d = new Date(ms);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  (days[key] ??= []).push({ ts: ms, host: u.host, seg: SAFE_SEGMENTS.has(seg) ? seg : '', durMs: Math.max(0, Number(durS) || 0) });
  kept++;
}
// Merge bursts: the same host within 20 s is one visit (redirects, frames, reloads).
for (const [k, list] of Object.entries(days)) {
  const merged = [];
  for (const v of list) {
    const p = merged[merged.length - 1];
    if (p && p.host === v.host && v.ts - p.ts < 20_000) {
      p.durMs = Math.max(p.durMs, v.durMs);
      continue;
    }
    merged.push(v);
  }
  days[k] = merged;
}
mkdirSync(resolve(root, '.demo-history'), { recursive: true });
writeFileSync(resolve(root, '.demo-history/days.json'), JSON.stringify(days));
const summary = Object.entries(days).map(([k, l]) => `${k}:${l.length}`).join(' ');
console.log(`visits read: ${total}, kept from whitelisted hosts since ${from}: ${kept}\ndays: ${summary}`);
