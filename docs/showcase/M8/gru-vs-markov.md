# GRU vs Markov vs rules on synthetic personas (7 days, last day held out)

| Persona | Next top-1 GRU / Markov | Next top-3 GRU / Markov | Switch top-3 GRU / Markov | AUC GRU / Markov / rules | Train | Promoted? |
|---|---|---|---|---|---|---|
| developer | 93.7% / 95.7% | 97.8% / 99.3% | 82.6% / 84.8% | 0.994 / 0.993 / 0.993 | 1428 windows, 97 s (cpu) | no |
| writer | 94.2% / 96.3% | 97.6% / 99.5% | 90.9% / 87.9% | 1.000 / 1.000 / 1.000 | 1162 windows, 79 s (cpu) | no |
| researcher | 94.7% / 96.6% | 97.2% / 99.4% | 76.3% / 81.6% | 1.000 / 1.000 / 1.000 | 1211 windows, 82 s (cpu) | no |
| designer | 95.1% / 96.6% | 98.6% / 99.6% | 94.1% / 88.2% | 0.986 / 0.987 / 0.986 | 1337 windows, 90 s (cpu) | no |
| student | 94.2% / 95.6% | 99.8% / 99.7% | 95.1% / 93.4% | 1.000 / 1.000 / 1.000 | 1489 windows, 100 s (cpu) | no |
| freelancer | 94.4% / 95.8% | 97.5% / 99.6% | 88.4% / 90.7% | n/a / n/a / n/a | 1345 windows, 90 s (cpu) | no |

Promotion rule (D-20): the GRU runs only if its AUC on the held-out day is higher than Markov's by at least 0.005; ties go to Markov.

Caveat (K-18): synthetic days come from our own generator, so AUC saturates for every model. This checks the machinery and the promotion rule; it is not evidence of predictive skill on a real person.
