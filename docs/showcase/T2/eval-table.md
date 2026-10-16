# T2 evaluation report

100 held-out examples (60 naming, 40 autopsy). Greedy decoding. Judge: Gemma 4 31B, blind, rubric in `training/eval/rubric.md`. The teacher wrote the reference outputs and judges them, so its judge score is biased upward (self-preference); the 20 manual reviews are the check.

## naming

| System | n | Valid JSON | Grounded | Outside-browser | Label correct | Clean | Judge faith. | Judge struct. | Judge voice | Judge mean |
|---|---|---|---|---|---|---|---|---|---|---|
| Baseline (template / `origin · topic`) | 60 | 100% | 100% | 0% | – | 100% | 2.75 | 1 | 5 | 2.92 |
| Base 270M | 60 | 0% | 0% | 0% | 0% | 0% | 1.93 | 1 | 4.67 | 2.53 |
| Fine-tuned 270M (fp32) | 60 | 97% | 97% | 0% | 97% | 97% | 4.98 | 5 | 5 | 4.99 |
| Fine-tuned 270M (optimum ONNX, 4-bit, 488 MB) | 60 | 85% | 83% | 0% | 80% | 83% | 3.98 | 4.8 | 5 | 4.59 |
| Fine-tuned 270M (optimum ONNX, 8-bit, 622 MB, superseded) | 60 | 95% | 95% | 0% | 93% | 95% | 4.98 | 5 | 5 | 4.99 |
| **Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)** | 60 | 97% | 97% | 0% | 95% | 97% | 4.97 | 5 | 5 | 4.99 |
| Teacher 31B (ceiling) | 60 | 100% | 100% | 0% | 100% | 100% | 5 | 5 | 5 | 5 |

## autopsy

| System | n | Length 120-180 | Plain text | Grounded | Outside-browser | Structure | Clean | Strict-clean | Words | Judge faith. | Judge struct. | Judge voice | Judge mean |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Baseline (template / `origin · topic`) | 40 | 0% | 100% | 100% | 0% | 100% | 0% | 0% | 101.7 | 5 | 2.9 | 5 | 4.3 |
| Base 270M | 40 | 12% | 52% | 38% | 0% | 0% | 0% | 0% | 68.6 | 1.2 | 1 | 1 | 1.07 |
| Fine-tuned 270M (fp32) | 40 | 95% | 100% | 98% | 0% | 100% | 92% | 70% | 164.6 | 4.53 | 4.2 | 5 | 4.58 |
| Fine-tuned 270M (optimum ONNX, 4-bit, 488 MB) | 40 | 70% | 100% | 52% | 0% | 95% | 28% | 18% | 175.2 | 1.27 | 2.6 | 4.1 | 2.66 |
| Fine-tuned 270M (optimum ONNX, 8-bit, 622 MB, superseded) | 40 | 92% | 100% | 95% | 0% | 100% | 88% | 70% | 163.4 | 4.6 | 4.2 | 5 | 4.6 |
| **Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)** | 40 | 95% | 100% | 92% | 0% | 100% | 88% | 70% | 163.8 | 4.45 | 4.08 | 5 | 4.51 |
| Teacher 31B (ceiling) | 40 | 100% | 100% | 100% | 0% | 100% | 100% | 90% | 166.3 | 4.95 | 4.85 | 5 | 4.93 |

## Ship bar (PDD 10.4)

| Criterion | Fine-tuned (fp32) | Optimum 8-bit (622 MB) | **Shipped: genai 8-bit (324 MB)** |
|---|---|---|---|
| ≥ 95% valid output (JSON for naming, plain text for autopsy; worst task) | 97% ✅ | 95% ✅ | 97% ✅ |
| ≥ 90% grounding pass (worst task) | 97% ✅ | 95% ✅ | 92% ✅ |
| Judge mean ≥ 3.5 (mean of both tasks) | 4.79 ✅ | 4.79 ✅ | 4.75 ✅ |
| Beats baseline on judge mean | ✅ | ✅ | ✅ |
| Outside-browser mentions = 0% | 0% ✅ | 0% ✅ | 0% ✅ |

## Shipped system: 95% confidence intervals (Wilson) and worst cases

| Measure | Passed | n | Rate | 95% CI |
|---|---|---|---|---|
| naming valid_json | 58 | 60 | 97% | 89% to 99% |
| naming grounded | 58 | 60 | 97% | 89% to 99% |
| naming label_correct | 57 | 60 | 95% | 86% to 98% |
| naming clean | 58 | 60 | 97% | 89% to 99% |
| autopsy length_ok | 38 | 40 | 95% | 83% to 99% |
| autopsy grounded | 37 | 40 | 92% | 80% to 97% |
| autopsy structure_ok | 40 | 40 | 100% | 91% to 100% |
| autopsy clean | 35 | 40 | 88% | 74% to 95% |

Lowest judge totals (id, faithfulness/structure/voice):

- `autopsy-1-0029`: 2/3/5
- `autopsy-1-0409`: 2/3/5
- `autopsy-1-0173`: 2/3/5
- `autopsy-1-0370`: 2/3/5
- `autopsy-1-0007`: 3/3/5
- `autopsy-1-0093`: 3/3/5
- `autopsy-1-0217`: 3/4/5
- `autopsy-1-0336`: 2/5/5

Judge scores of 3 or less: 26 of 300 (8.7%).

Identical output text to the optimum 8-bit build: 69 of 100 prompts.

Paired judge difference (genai minus optimum, n=100): mean -0.04, better on 0, worse on 5, same on 95.

## Reading the table
- **Shipped system:** the genai 8-bit build (324 MB), evaluated as the actual artifact in Transformers.js on WebGPU, greedy, all 100 prompts. The optimum 8-bit (622 MB) and 4-bit builds and the fp32 model are shown for comparison. The 4-bit build fails the ship bar; both 8-bit builds and fp32 pass it.
- **Naming baseline** is a name only (no label, no explanation), so it scores 1 on the judge's structure dimension by construction; compare faithfulness (2.75 vs 4.97) rather than the mean.
- **Autopsy template baseline** is faithful by construction (5.0) but short (about 102 words, structure 2.9). The fine-tuned model wins on the judge mean (4.51 vs 4.3) and loses on faithfulness (4.45 vs 5.0). **The edge is small and the template is the safety net.**
- **Quantisation costs almost nothing at 8-bit:** fp32 vs shipped differ by 0.07 on the autopsy judge mean (4.58 vs 4.51) and the paired difference to the optimum 8-bit build is -0.04 (95 of 100 outputs scored the same, 5 slightly lower, none higher), which is within what a different fp16 rounding path does to a greedy decode (69 of 100 outputs are word-for-word identical).
- **Ship-bar margins are thin on autopsy:** grounding is 92% (95% CI 80% to 97%) against a 90% bar, and 40 autopsy prompts is a small sample. The point estimate passes; the interval does not clear the bar.
- **What the model gets wrong (shipped, 40 autopsies):** 12 autopsies fail at least one deterministic check (T1 validators plus the strict checks below): the T1 validators flag 5 (3 ungrounded clock times, 2 word counts) and the strict checks add 7 more that pass the validators. All 8 autopsies the judge scored 3 or lower on faithfulness are among them; none of the 28 that pass every check scored 3 or lower. The judge missed two real errors (a wrong-direction 7-day change in `autopsy-1-0090` and an over-allowance claim in `autopsy-1-0111`), so it is not infallible either.
- **Strict checks (eval-only, `eval/metrics.py::strict_autopsy_errors`):** T1's validators ground every number but cannot see a real number attached to the wrong thing. The strict checks catch: nudge counts swapped (3 snoozed / 1 ignored when it was 1 / 3), nudge state wrong, "N fewer deep blocks" when the delta is positive, "exceeded your allowance" when none was exceeded, and a trigger pair ("moved from A to B") that is not in the facts. They are candidates for the M6 TypeScript validator port. The template passes all of them on every eval input.
- **A defect in the training data (from T1):** in 29 of 202 teacher sentences that compare deep blocks with the 7-day average (14%) the direction is wrong ("fewer" for a positive delta), and the teacher does it in 4 of its own 40 eval outputs. T1's validator deliberately does not grade the sign. The student copies it (3 of its eval autopsies). Dropping or repairing the 32 flagged training autopsies (29 sign, 2 allowance, 1 trigger; 8.6% of 373) and retraining (about 15 min plus export and eval) is the obvious fix; not done, pending the owner's call.
- **Failures on naming (shipped, 60):** 2 schema failures, 1 wrong label.
- The judge is the family that wrote the data (self-preference). The 20 side-by-side examples in `training/eval/review_20.md` are the owner's check. I read six of the eight lowest-faithfulness autopsies against their inputs: all six contain a real error (invented trigger, wrong direction, swapped nudge counts, wrong nudge state, over-allowance claim with none).
- 8-bit vs 4-bit: 4-bit drops autopsy grounding from 92-95% to 52% (optimum builder) and naming validity from 95-97% to 85% (optimum) or 43% (genai). See `s5-notes.md`.
