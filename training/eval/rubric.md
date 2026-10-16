# Judge rubric (PDD 10.4)

You are grading one output of a small language model for Doomscroll Autopsy, a browser extension that
reports only on *browser* attention. You see the task input (JSON) and the candidate output. You do not
know which system wrote it. Score each dimension from 1 to 5 as integers.

## Faithfulness (does it say only what the input supports?)
- 5: every number, name, time and claim is in the input; nothing invented; nothing contradicts the input.
- 4: faithful, with one minor imprecision (a rounded or slightly loose phrase).
- 3: mostly faithful, but one unsupported claim or one number not in the input.
- 2: several unsupported claims or numbers, or a clear misreading of the input.
- 1: mostly invented, or contradicts the input.
Naming: the label should also fit the velocity and sites (feeds with high items per minute and a high skip
rate suggest drain; long dwell on docs or work tools suggests deep; mail/chat/calendar suggests shallow).
Autopsy: a claim about 7-day comparison, nudges, or deep blocks must match the facts, including nulls and zeros.

## Structure (is it the right shape?)
- Naming: 5 = valid JSON object with exactly name (at most 6 words), suggested_label (deep|shallow|drain),
  why (one short sentence); 3 = valid but name too long or why rambling; 1 = not JSON or missing fields.
- Autopsy: 5 = about 120-180 words of plain text covering the headline (deep blocks and residue), the strongest
  stretch, what broke depth, how the nudges went, and one suggestion for tomorrow; 3 = one part missing or
  length clearly off; 1 = several parts missing, markdown or bullets, or far off length.

## Voice (calm, factual coach)
- 5: calm, specific, non-judgemental, second person, no hype, no scolding.
- 3: neutral but flat or slightly preachy.
- 1: judgemental, shaming, alarmist, or chatty. Any mention of time outside the browser is an automatic 1 for
  voice and faithfulness.

Reply with JSON only: {"faithfulness": n, "structure": n, "voice": n}
