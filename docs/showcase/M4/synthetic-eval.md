Synthetic evaluation: 14 days per persona, seed 1. Cells are rules / Markov. Held-out = the latest day.

| Persona | Split | Test bins | Top-1 | Top-3 | Top-3 on switches | Spiral AUC | Positives | Nudges/day |
|---|---|---|---|---|---|---|---|---|
| developer | latest-day | 1064 | 96.2% / 96.2% | 99.6% / 99.4% | 90.0% / 85.0% | 0.991 / 0.993 | 20/1044 | 0.6 |
| writer | latest-day | 880 | 96.4% / 96.4% | 99.4% / 99.4% | 84.4% / 84.4% | 1.000 / 1.000 | 16/860 | 1.6 |
| researcher | latest-day | 1189 | 96.6% / 96.6% | 99.7% / 99.7% | 90.0% / 90.0% | 1.000 / 1.000 | 124/1169 | 3.4 |
| designer | latest-day | 1014 | 96.9% / 96.9% | 98.0% / 99.6% | 35.5% / 87.1% | 0.987 / 0.990 | 98/994 | 3.4 |
| student | latest-day | 1404 | 95.9% / 95.9% | 99.5% / 99.8% | 87.9% / 94.8% | 1.000 / 1.000 | 44/1384 | 2.4 |
| freelancer | latest-day | 1017 | 96.2% / 96.2% | 99.8% / 99.7% | 94.9% / 92.3% | 0.991 / 0.990 | 11/997 | 1.0 |
| **mean** | | | 96.4% / 96.4% | 99.3% / 99.6% | 80.4% / 88.9% | 0.995 / 0.996 | | |
