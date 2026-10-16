# T3 results: targeted retrain (K-07, K-08, K-24)

## Why
After M6 the fallback rate on replayed days was 34.8% (run1), mostly the model attaching the wrong state to a nudge (`shown 1, ignored 1` -> "was snoozed"). Cause in the data: ignored-only nudge configurations were rare in the 373 training autopsies (about 17), while real use produces mostly unanswered nudges; and 32 training autopsies contained slips the strict checks catch (K-08).

## What changed (`training/clean.py`, 29 pytest cases)
- 32 autopsies with strict-check failures dropped (the K-08 wrong-direction 7-day examples among them).
- The nudge sentence sits alone in paragraph 4 of the teacher texts (361 of 373; the other paragraphs never mention nudges), so it was rewritten from `facts.nudges` in a canonical form (shortest valid wording).
- 160 augmented variants: the same autopsy with a different `nudges` object, weighted to real use (40% all ignored, 30% mixed, 15% all accepted, 15% snoozed); only paragraph 4 changes, the validators stay green.
- run3 also dropped texts over 172 words (teacher texts have mean 167 words, so run2 overshot the 180 ceiling in 11 of 40 eval autopsies).
- Naming data untouched. Same recipe as run1 (LoRA r16/alpha32, lr 2e-4, 3 epochs). run2 = cleaned + augmented; **run3 = run2 + length filter (shipped)**.

## Result (automatic metrics on browser generations; `comparison.md`)
| | run1 (T2) | run2 | run3 (shipped) |
|---|---|---|---|
| Naming: valid / grounded / label correct (60) | 97% / 97% / 95% | 100% / 100% / 100% | 100% / 100% / 100% |
| Eval autopsy (40): grounded | 92% | 100% | 100% |
| Eval autopsy: strict-clean, T1 length 120-180 | 70% | 68% | 70% |
| Eval autopsy: strict-clean, runtime length 110-200 | 75% | 95% | 98% |
| Ignored-heavy nudge prompts (40): strict-clean | 60% | 95% | 95% |
| Outside-browser mentions | 0 | 0 | 0 |

The length rows differ because 11 to 13 of the 40 eval autopsies come out 181-196 words on busy days (faithful text, a little long); the runtime gate accepts 110-200 words (D-59), the 120-180 target of T1 stays the training and template standard. Remaining strict errors: `delta_sign_wrong` 1 (run1: 6), `claims_over_allowance` 0 (run1: 3), `invented_trigger` 0 (run1: 6), `nudge_*` 0 (run1: 12).

## In the extension (`probe:m6`, 23 replayed persona days, real service worker -> offscreen path)
| | run1 | run3 |
|---|---|---|
| Autopsies written by the model | 15 of 23 | **20 of 23** |
| Fallback to the template | 34.8% | **13.0%** |
| Refusal codes (both attempts) | nudge_state_wrong 18, word_count 6, invented_trigger 4, ungrounded_number 1 | ungrounded_clock 3, invented_trigger 2, ungrounded_number 2 |
| Median time per autopsy | 5.0 s | 2.6 s |

## Caveats
- The 31B judge was **not** re-run (the teacher isn't started for T3), so faithfulness/structure/voice judge scores are T2's. Canonical nudge sentences make that paragraph templated (calm, correct, a little uniform); the rest of the text is the model's.
- 40 held-out nudge prompts and 40 eval autopsies are small samples (95% Wilson intervals are wide, roughly +/- 10 points).
- The nudge check set is derived from the eval facts, which the training set never saw; the training augmentation used train facts only.
