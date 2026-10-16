import type { DailyFacts } from '@shared/types';

/**
 * Autopsy validator (PDD 9.8): a TypeScript port of `training/validators.py::check_autopsy`, which
 * T1 used to filter the teacher data and T2 to evaluate. Hand-written, so it runs under the MV3
 * CSP (K-01). The template autopsy must pass it; M6 runs the model's text through it too.
 * Returns error codes; an empty array means the text passes.
 */
export const AUTOPSY_MIN_WORDS = 120;
export const AUTOPSY_MAX_WORDS = 180;
/** Product constants (deep block = 25 min, interruption = 2 min) may appear anywhere. */
const CONSTANT_NUMBERS = new Set(['25', '2']);

/** Phrases about time outside the browser (D-45). Territory names are stripped first. */
export const OUTSIDE_BROWSER =
  /\b(offline|off[- ]?screen|off the (screen|browser|computer)|away from (the |your )?(keyboard|screen|computer|browser|desk)|time away|while (you were )?away|outside (of )?(the |your )?(browser|chrome|computer)|phone|smartphone|mobile|tablet|other apps?|desktop apps?|in person|commut\w*|meetings?|lunch|dinner|sleep\w*|touch grass|go outside|take a walk|walk\b|exercis\w*|gym)\b/i;

export const BANNED_TONE =
  /\b(lazy|laziness|wasted?|waste of|failure|failed|pathetic|addict\w*|guilt\w*|shame\w*|terrible|awful|bad day|you should have|you must|stupid|disappoint\w*|worthless)\b/i;

const SEVEN_DAY =
  /\b(7[- ]day|seven[- ]day|weekly average|last week|past week|than usual|compared (to|with) (your|the) (usual|average|typical))\b/i;
const SPELLED_NUMBER = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|hundred)\b/i;
const MARKDOWN = /(^\s*[-*•]\s)|(^\s*#{1,6}\s)|(\*\*)|(^\s*\d+\.\s)/m;
const CLOCK = /\b\d{1,2}:\d{2}\b/g;
const NUMBER = /\d+(?:\.\d+)?/g;

export function normNum(s: string): string {
  const f = Number(s);
  if (Number.isNaN(f)) return s;
  return Number.isInteger(f) ? String(f) : String(Math.round(f * 1e6) / 1e6);
}

/** Every number found in a JSON-like value, including inside strings (clocks and dates excluded). */
export function numbersIn(value: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'number') out.add(normNum(String(Math.abs(v)))); // deltas are written as magnitudes
    else if (typeof v === 'string') {
      const stripped = v.replace(/\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b/g, ' ');
      for (const n of stripped.match(NUMBER) ?? []) out.add(normNum(n));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

function factClocks(facts: DailyFacts): Set<string> {
  const clocks = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) clocks.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(facts);
  for (const t of facts.topTriggers) clocks.add(`${String(t.hour).padStart(2, '0')}:00`);
  return clocks;
}

export function territoryNames(facts: DailyFacts): Set<string> {
  const names = new Set<string>();
  facts.deepBlocks.blocks.forEach((b) => names.add(b.territory));
  facts.drainOverAllowance.forEach((d) => names.add(d.territory));
  facts.topTriggers.forEach((t) => {
    names.add(t.fromTerritory);
    names.add(t.toTerritory);
  });
  if (facts.strongestStretch) names.add(facts.strongestStretch.territory);
  return names;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function removeNames(text: string, names: Set<string>): string {
  let out = text;
  for (const n of [...names].sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(escapeRe(n), 'gi'), ' ');
  return out;
}

export function checkAutopsy(text: string, facts: DailyFacts): string[] {
  const errors: string[] = [];
  const t = text.trim();
  if (!t) return ['empty'];
  if (MARKDOWN.test(t) || t.includes('```')) errors.push('markdown');

  const words = t.split(/\s+/).length;
  if (words < AUTOPSY_MIN_WORDS || words > AUTOPSY_MAX_WORDS) errors.push('word_count');

  const names = territoryNames(facts);
  let plain = removeNames(t, names);
  if (facts.vs7Day != null) plain = plain.replace(/\b7[- ]day\b/gi, ' ');

  // The date's digits are not allowed: the autopsy has no reason to quote them.
  const { date: _date, ...rest } = facts;
  const allowedNums = new Set([...numbersIn(rest), ...CONSTANT_NUMBERS]);
  const allowedClocks = factClocks(facts);
  if ((plain.match(CLOCK) ?? []).some((c) => !allowedClocks.has(c))) errors.push('ungrounded_clock');
  const noClocks = plain.replace(CLOCK, ' ');
  if ((noClocks.match(NUMBER) ?? []).some((n) => !allowedNums.has(normNum(n)))) errors.push('ungrounded_number');
  if (t.includes('%')) errors.push('percentage');
  if (SPELLED_NUMBER.test(plain)) errors.push('spelled_number');

  // Invented territory names: quoted strings must be real names.
  for (const m of t.matchAll(/["“]([^"”]{2,80})["”]/g)) {
    if (!names.has(m[1]!)) {
      errors.push('unknown_territory');
      break;
    }
  }

  if (OUTSIDE_BROWSER.test(plain)) errors.push('outside_browser');
  if (BANNED_TONE.test(t)) errors.push('tone');

  // Null / zero consistency.
  if (facts.vs7Day == null && SEVEN_DAY.test(t)) errors.push('claims_7day');
  if (
    facts.deepBlocks.count === 0 &&
    /\b(\d+|a|the longest|your longest) deep blocks?\b/i.test(t) &&
    !/\b(0|no|zero) deep blocks?\b/i.test(t)
  ) {
    errors.push('claims_deep_block');
  }
  if (facts.nudges.shown === 0 && /\bnudges? (worked|helped|were accepted)\b/i.test(t)) errors.push('claims_nudges');

  // Required structure (the verifiable parts of PDD 4.6).
  const textInts = new Set((t.match(/\d+/g) ?? []).map(normNum));
  if (!textInts.has(String(facts.deepBlocks.count)) && !(facts.deepBlocks.count === 0 && /\bno deep blocks?\b/i.test(t))) {
    errors.push('missing_headline_blocks');
  }
  if (
    !textInts.has(String(facts.residue.switchesOutOfDeep)) &&
    !(facts.residue.switchesOutOfDeep === 0 && /\b(no|zero) switches\b/i.test(t))
  ) {
    errors.push('missing_headline_residue');
  }
  if (facts.strongestStretch && !textInts.has(String(facts.strongestStretch.minutes))) errors.push('missing_strongest_stretch');
  const lower = t.toLowerCase();
  if (facts.topTriggers.length && !facts.topTriggers.some((tr) => lower.includes(tr.fromTerritory.toLowerCase()) || lower.includes(tr.toTerritory.toLowerCase()))) {
    errors.push('missing_triggers');
  }
  if (!/\btomorrow\b/i.test(t)) errors.push('missing_suggestion');
  return [...new Set(errors)].sort();
}

/**
 * Strict semantic checks (K-07): `checkAutopsy` grounds every *number*, but a real number can still be
 * attached to the wrong thing. These catch the slips seen in the T2 review: swapped nudge counts or
 * states, a wrong-direction 7-day change, an allowance claim with none, an invented trigger pair.
 * Port of `training/eval/metrics.py::strict_autopsy_errors`. The model's autopsy must pass both.
 */
export function strictAutopsyErrors(text: string, facts: DailyFacts): string[] {
  const errs = new Set<string>();
  const nud = facts.nudges as unknown as Record<string, number>;
  for (const m of text.matchAll(/\b(\d+) (?:nudges? )?(?:was|were) (accepted|snoozed|ignored)\b/gi)) {
    if (Number(m[1]) !== nud[m[2]!.toLowerCase()]) errs.add('nudge_count_wrong');
  }
  for (const m of text.matchAll(/\bnudge (?:was|got) (accepted|snoozed|ignored)\b/gi)) {
    if (nud[m[1]!.toLowerCase()] === 0) errs.add('nudge_state_wrong');
  }
  const v = facts.vs7Day;
  if (v) {
    for (const m of text.matchAll(/\b(\d+(?:\.\d+)?) (more|fewer) deep blocks?\b/gi)) {
      if ((m[2]!.toLowerCase() === 'more') !== v.deepBlocksDelta > 0) errs.add('delta_sign_wrong');
    }
    for (const m of text.matchAll(/\bdrain over allowance was (up|down)\b/gi)) {
      if ((m[1]!.toLowerCase() === 'up') !== v.drainOverDelta > 0) errs.add('delta_sign_wrong');
    }
  }
  if (
    facts.drainOverAllowance.length === 0 &&
    /\b(exceeded|ran over|went over|over) (your|the) (\d+ minute )?allowance|\d+ minutes over\b/i.test(text)
  ) {
    errs.add('claims_over_allowance');
  }
  const pairs = new Set(facts.topTriggers.map((x) => `${x.fromTerritory.toLowerCase()}\u0000${x.toTerritory.toLowerCase()}`));
  for (const m of text.matchAll(/\b(?:moved|switched|going) from (.+?) to (.+?)(?:\s+\d+ times?|[.,]|\s+(?:at|in|during)\b)/gi)) {
    if (!pairs.has(`${m[1]!.trim().toLowerCase()}\u0000${m[2]!.trim().toLowerCase()}`)) errs.add('invented_trigger');
  }
  return [...errs].sort();
}

/**
 * Length the model's autopsy may have. PDD 4.6 says "≈ 120-180 words" and T1 trained and filtered to
 * exactly that; a faithful text of 185-195 words on a busy day is not a defect for the reader, so the
 * runtime gate accepts 110-200 (D-59). The template always stays inside 120-180 (`checkAutopsy`).
 */
export const MODEL_AUTOPSY_WORDS = { min: 110, max: 200 } as const;

/** Everything the autopsy must satisfy before it is shown as model-written (PDD 9.8, K-07). */
export function validateAutopsy(text: string, facts: DailyFacts): string[] {
  const words = text.trim().split(/\s+/).length;
  const lengthOk = words >= MODEL_AUTOPSY_WORDS.min && words <= MODEL_AUTOPSY_WORDS.max;
  return [...new Set([...checkAutopsy(text, facts), ...strictAutopsyErrors(text, facts)])].filter((e) => !(e === 'word_count' && lengthOk)).sort();
}
