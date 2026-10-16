# T3: run1 vs run2 (automatic metrics, browser generations)

| Run | Set | n | Valid | Grounded | Length OK | Outside-browser | Structure | Clean | Strict-clean |
|---|---|---|---|---|---|---|---|---|---|
| run1 | eval naming | 60 | 97% | 97% | n/a | 0% | n/a | 97% | n/a |
| run1 | eval autopsy | 40 | 100% | 92% | 95% | 0% | 100% | 88% | 70% |
| run1 | nudge-heavy autopsy | 40 | 100% | 95% | 90% | 0% | 100% | 85% | 60% |
| run1 | eval naming label correct | 60 | | | | | | 95% | |
| run2 | eval naming | 60 | 100% | 100% | n/a | 0% | n/a | 100% | n/a |
| run2 | eval autopsy | 40 | 100% | 100% | 72% | 0% | 100% | 72% | 68% |
| run2 | nudge-heavy autopsy | 40 | 100% | 100% | 98% | 0% | 100% | 98% | 95% |
| run2 | eval naming label correct | 60 | | | | | | 100% | |
| run3 | eval naming | 60 | 100% | 100% | n/a | 0% | n/a | 100% | n/a |
| run3 | eval autopsy | 40 | 100% | 100% | 72% | 0% | 100% | 72% | 70% |
| run3 | nudge-heavy autopsy | 40 | 100% | 100% | 95% | 0% | 100% | 95% | 95% |
| run3 | eval naming label correct | 60 | | | | | | 100% | |

## Error codes over eval autopsies + nudge-heavy autopsies

- run1: {"nudge_state_wrong": 8, "delta_sign_wrong": 6, "invented_trigger": 6, "word_count": 6, "ungrounded_clock": 5, "nudge_count_wrong": 4, "claims_over_allowance": 3, "ungrounded_number": 1}
- run2: {"word_count": 12, "delta_sign_wrong": 2, "claims_over_allowance": 1}
- run3: {"word_count": 13, "delta_sign_wrong": 1}
