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
