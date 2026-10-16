import type { DailyFacts } from '@shared/types';
import { AUTOPSY_MAX_WORDS, AUTOPSY_MIN_WORDS } from './validate';

/**
 * Template autopsy (PDD 4.6, 9.8, 9.10): `facts` rendered deterministically in the calm, factual
 * coach voice (D-44). It is the permanent fallback for the fine-tuned model (M6) and the baseline
 * the model is compared with. Every number comes from `facts`; it speaks only of browser
 * attention (D-45); it is always 120-180 words and passes `checkAutopsy`.
 */
export const TEMPLATE_VERSION = 'template';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const abs = (n: number) => Math.abs(n);
const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

interface Part {
  text: string;
  paragraph: number;
  /** Optional parts are dropped, lowest first, when the text runs past the word limit. */
  drop?: number;
}

/** Neutral sentences (no figures) that bring a quiet day up to the minimum length. */
const FILLERS = [
  'Deep blocks count only browser time in Deep territories, and short detours do not end a block.',
  'These figures describe your browser only, so read them as a map of where attention went rather than a verdict.',
  'Small, steady changes in what you open next usually matter more than effort in the moment.',
  'Coming back to deep work soon after a detour keeps the cost of switching low.',
];

function headline(f: DailyFacts): string {
  const d = f.deepBlocks;
  if (d.count === 0) return 'No deep blocks today: a deep block needs 25 minutes in Deep territories, with detours of no more than 2 minutes.';
  if (d.count === 1) return `You had 1 deep block today, ${plural(d.longestMin, 'minute')} of unbroken depth.`;
  return `You had ${d.count} deep blocks today, the longest ${plural(d.longestMin, 'minute')}, and ${plural(d.totalMin, 'minute')} of deep work in all.`;
}

function residue(f: DailyFacts): string {
  const r = f.residue;
  if (r.switchesOutOfDeep === 0) return 'There were no switches out of deep work.';
  const back = r.meanMinBackToDeep == null ? 'and you did not return to deep work afterwards' : `and it took ${plural(r.meanMinBackToDeep, 'minute')} on average to get back`;
  return `You switched out of deep work ${plural(r.switchesOutOfDeep, 'time')}, ${back}.`;
}

function weekComparison(f: DailyFacts): string | null {
  const v = f.vs7Day;
  if (!v) return null;
  const blocks =
    v.deepBlocksDelta === 0
      ? 'the same number of deep blocks as'
      : `${plural(abs(v.deepBlocksDelta), 'deep block')} ${v.deepBlocksDelta > 0 ? 'more' : 'fewer'} than`;
  const drain =
    v.drainOverDelta === 0
      ? 'the same Drain time past allowance'
      : `${plural(abs(v.drainOverDelta), 'minute')} ${v.drainOverDelta > 0 ? 'more' : 'less'} Drain time past allowance`;
  return `Against your 7-day average that is ${blocks} your average, with ${drain}.`;
}

function nudges(f: DailyFacts): string {
  const n = f.nudges;
  if (n.shown === 0) return 'No nudges were shown today.';
  const base = `${plural(n.shown, 'nudge')} appeared: ${n.accepted} accepted, ${n.snoozed} snoozed and ${n.ignored} ignored.`;
  return n.medianReturnMin == null ? base : `${base} After an accepted nudge you were back in deep work within a median of ${plural(n.medianReturnMin, 'minute')}.`;
}

function suggestion(f: DailyFacts): string {
  const over = f.drainOverAllowance[0];
  if (over) return `Tomorrow, try keeping ${over.territory} inside its ${over.allowanceMin} minute allowance.`;
  const trig = f.topTriggers[0];
  if (trig) return `Tomorrow, when you notice yourself leaving ${trig.fromTerritory} around ${hh(trig.hour)}, take a short pause before opening ${trig.toTerritory}.`;
  if (f.deepBlocks.count === 0) return 'Tomorrow, try to protect a single stretch of 25 minutes in a Deep territory and keep detours short.';
  return 'Tomorrow, protect your first deep block early in the day and keep detours short.';
}

export function renderAutopsy(f: DailyFacts): string {
  const parts: Part[] = [
    { text: headline(f), paragraph: 0 },
    { text: residue(f), paragraph: 0 },
  ];
  const week = weekComparison(f);
  if (week) parts.push({ text: week, paragraph: 0, drop: 2 });

  if (f.strongestStretch) {
    const s = f.strongestStretch;
    parts.push({ text: `Your strongest stretch was ${s.territory}, from ${s.start} to ${s.end}, ${plural(s.minutes, 'minute')} without a break.`, paragraph: 1 });
  }
  const t = f.totalsMin;
  parts.push({ text: `Across your browser day you spent ${plural(t.deep, 'minute')} in Deep, ${t.shallow} in Shallow and ${t.drain} in Drain.`, paragraph: 1 });
  f.drainOverAllowance.slice(0, 2).forEach((d, i) => {
    parts.push({ text: `${d.territory} ran ${plural(d.minutesOver, 'minute')} past its ${d.allowanceMin} minute allowance.`, paragraph: 1, drop: i === 0 ? 4 : 1 });
  });
  if (f.drainOverAllowance.length === 0 && t.drain > 0) parts.push({ text: 'Every Drain territory stayed within its allowance.', paragraph: 1, drop: 3 });

  f.topTriggers.slice(0, 2).forEach((tr, i) => {
    const text =
      i === 0
        ? `Depth broke most often around ${hh(tr.hour)}, when you moved from ${tr.fromTerritory} to ${tr.toTerritory}, ${plural(tr.count, 'time')}.`
        : `Next came ${tr.fromTerritory} to ${tr.toTerritory} around ${hh(tr.hour)}, ${plural(tr.count, 'time')}.`;
    parts.push({ text, paragraph: 2, drop: i === 0 ? undefined : 0 });
  });
  parts.push({ text: nudges(f), paragraph: 3 });
  parts.push({ text: suggestion(f), paragraph: 4 });

  const words = () => parts.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  // Too long: drop optional parts, lowest priority first.
  while (words() > AUTOPSY_MAX_WORDS) {
    const optional = parts.filter((p) => p.drop != null).sort((a, b) => a.drop! - b.drop!);
    if (optional.length === 0) break;
    parts.splice(parts.indexOf(optional[0]!), 1);
  }
  // Too short: neutral fillers go before the suggestion.
  for (const filler of FILLERS) {
    if (words() >= AUTOPSY_MIN_WORDS) break;
    parts.splice(parts.length - 1, 0, { text: filler, paragraph: 3 });
  }

  const byParagraph = new Map<number, string[]>();
  for (const p of parts) byParagraph.set(p.paragraph, [...(byParagraph.get(p.paragraph) ?? []), p.text]);
  return [...byParagraph.entries()].sort((a, b) => a[0] - b[0]).map(([, texts]) => texts.join(' ')).join('\n\n');
}
