# T1 dataset stats

Train 973, eval 100, total 1073.

## naming

- generated 660, valid 660 (100.0%), retried 4
- tok/s while generating: 6.3

Attempt error codes:

| error | count |
|---|---|
| ungrounded_number | 3 |
| outside_browser | 1 |

| persona | count |
|---|---|
| designer | 122 |
| writer | 119 |
| student | 111 |
| developer | 110 |
| researcher | 101 |
| freelancer | 97 |

| label | count |
|---|---|
| drain | 227 |
| shallow | 225 |
| deep | 208 |

## autopsy

- generated 440, valid 413 (93.9%), retried 47
- tok/s while generating: 18.8

Attempt error codes:

| error | count |
|---|---|
| word_count | 67 |
| ungrounded_clock | 5 |
| spelled_number | 4 |

| persona | count |
|---|---|
| researcher | 74 |
| developer | 72 |
| writer | 71 |
| freelancer | 67 |
| student | 65 |
| designer | 64 |

| edge case | count |
|---|---|
| typical | 141 |
| no-nudges | 56 |
| great-day | 50 |
| zero-deep | 50 |
| drain-heavy | 39 |
| new-user | 39 |
| single-long-block | 38 |

Word count: min 139, median 167, max 180.

## Three good examples per task

### naming `naming-1-0478` (designer)

```
{"origins":[{"origin":"https://www.figma.com","pathPrefix":"/design","count":33}],"sampleTitles":[],"topicTags":[],"velocity":{"itemsPerMin":0.9,"skipRate":0.02,"meanDwellS":159.1},"minutesToday":94}
```

```
{"name":"Figma design work","suggested_label":"deep","why":"A low velocity of 0.9 items per minute and high dwell time of 159.1 seconds indicates focused creative work."}
```

### naming `naming-1-0292` (developer)

```
{"origins":[{"origin":"https://github.com","pathPrefix":"/","count":128},{"origin":"https://www.youtube.com","pathPrefix":"/watch","count":35},{"origin":"https://developer.mozilla.org","pathPrefix":"/en-US/docs","count":16}],"sampleTitles":[],"topicTags":[],"velocity":{"itemsPerMin":0.8,"skipRate":0.0,"meanDwellS":181.1},"minutesToday":38}
```

```
{"name":"Software development and technical research","suggested_label":"deep","why":"A mean dwell time of 181.1 seconds and a 0.0 skip rate indicate sustained focus on GitHub and MDN documentation."}
```

### naming `naming-1-0048` (designer)

```
{"origins":[{"origin":"https://linear.app","pathPrefix":"/team","count":45}],"sampleTitles":["My issues › Linear","Triage › Linear","Sprint 42 › Linear"],"topicTags":[{"tag":"team chat","score":0.69}],"velocity":{"itemsPerMin":1.4,"skipRate":0.17,"meanDwellS":19.1},"minutesToday":53}
```

```
{"name":"Linear project and issue triage","suggested_label":"shallow","why":"Managing issues and sprints with a mean dwell of 19.1 seconds reflects low-value administrative coordination."}
```

### autopsy `autopsy-1-0438` (developer)

```
{"date":"2026-09-21","deepBlocks":{"count":5,"longestMin":100,"totalMin":347,"blocks":[{"start":"09:31","end":"11:11","minutes":100,"territory":"Python docs"},{"start":"11:55","end":"12:39","minutes":44,"territory":"GitHub"},{"start":"14:31","end":"14:59","minutes":28,"territory":"YouTube videos"},{"start":"16:21","end":"17:45","minutes":84,"territory":"GitHub"},{"start":"19:07","end":"20:38","minutes":91,"territory":"MDN docs"}]},"residue":{"switchesOutOfDeep":18,"meanMinBackToDeep":8.2},"totalsMin":{"deep":361,"shallow":73,"drain":8},"drainOverAllowance":[],"topTriggers":[{"fromTerritory":"GitHub","toTerritory":"YouTube Shorts","hour":15,"count":1}],"strongestStretch":{"territory":"Python docs","start":"09:31","end":"11:11","minutes":100},"nudges":{"shown":0,"accepted":0,"snoozed":0,"ignored":0,"medianReturnMin":null},"vs7Day":{"deepBlocksDelta":-1,"drainOverDelta":2.6}}
```

```
You had 5 deep blocks today, the longest 100 minutes, totaling 347 minutes of sustained focus. You switched out of deep work 18 times, and it took an average of 8.2 minutes to return to deep work. This is 1 fewer deep block than your recent average.

Your strongest stretch occurred in Python docs, from 09:31 to 11:11, lasting 100 minutes. Looking at your totals, you spent 361 minutes in Deep territories, 73 minutes in Shallow, and 8 minutes in Drain. Your drain was 2.6 minutes over your recent average.

Depth broke most notably at 15:00, when you moved from GitHub to YouTube Shorts 1 time. This specific switch interrupted your flow during the afternoon.

No nudges were shown today, meaning you navigated your browser transitions without system prompts.

Tomorrow, try to maintain your focus on GitHub during the 15:00 window to avoid the switch to YouTube Shorts. Limit your browser activity to deep territories during that specific time.
```

### autopsy `autopsy-1-0112` (writer)

```
{"date":"2026-10-21","deepBlocks":{"count":2,"longestMin":46,"totalMin":87,"blocks":[{"start":"08:07","end":"08:53","minutes":46,"territory":"Google Docs"},{"start":"09:29","end":"10:10","minutes":41,"territory":"Google Docs"}]},"residue":{"switchesOutOfDeep":17,"meanMinBackToDeep":3.7},"totalsMin":{"deep":108,"shallow":63,"drain":71},"drainOverAllowance":[{"territory":"Pinterest","allowanceMin":30,"minutesOver":18},{"territory":"Reddit front page","allowanceMin":15,"minutesOver":8}],"topTriggers":[{"fromTerritory":"The Atlantic essays","toTerritory":"Instagram Reels","hour":12,"count":7},{"fromTerritory":"Wikipedia","toTerritory":"Reddit front page","hour":14,"count":6}],"strongestStretch":{"territory":"Google Docs","start":"08:07","end":"08:53","minutes":46},"nudges":{"shown":7,"accepted":5,"snoozed":1,"ignored":1,"medianReturnMin":4.4},"vs7Day":null}
```

```
You had 2 deep blocks today, the longest 46 minutes, for a total of 87 minutes of focused work. You switched out of deep work 17 times, and it took an average of 3.7 minutes to return to a deep state.

Your strongest stretch was in Google Docs from 08:07 to 08:53, lasting 46 minutes. Across your browser activity, you spent 108 minutes in Deep territories, 63 minutes in Shallow territories, and 71 minutes in Drain territories.

Depth broke most often at 12:00 when you moved from The Atlantic essays to Instagram Reels 7 times, and at 14:00 when you moved from Wikipedia to Reddit front page 6 times. Pinterest ran 18 minutes over your 30 minute allowance, and Reddit front page ran 8 minutes over your 15 minute allowance.

7 nudges were shown. 5 were accepted with a median return of 4.4 minutes, 1 was snoozed, and 1 was ignored.

Tomorrow, try to limit your time on Instagram Reels when reading The Atlantic essays. Use a specific timer for Pinterest to stay within your 30 minute allowance tomorrow.
```

### autopsy `autopsy-1-0206` (developer)

```
{"date":"2026-10-25","deepBlocks":{"count":4,"longestMin":110,"totalMin":320,"blocks":[{"start":"09:04","end":"10:54","minutes":110,"territory":"GitHub"},{"start":"12:19","end":"14:05","minutes":106,"territory":"YouTube videos"},{"start":"15:33","end":"16:51","minutes":78,"territory":"YouTube videos"},{"start":"18:04","end":"18:30","minutes":26,"territory":"Python docs"}]},"residue":{"switchesOutOfDeep":22,"meanMinBackToDeep":8.1},"totalsMin":{"deep":358,"shallow":23,"drain":59},"drainOverAllowance":[{"territory":"YouTube Shorts","allowanceMin":20,"minutesOver":16},{"territory":"X timeline","allowanceMin":15,"minutesOver":8}],"topTriggers":[{"fromTerritory":"Python docs","toTerritory":"YouTube Shorts","hour":16,"count":1}],"strongestStretch":{"territory":"GitHub","start":"09:04","end":"10:54","minutes":110},"nudges":{"shown":8,"accepted":1,"snoozed":2,"ignored":5,"medianReturnMin":2.4},"vs7Day":null}
```

```
You had 4 deep blocks today, with the longest lasting 110 minutes, creating 320 minutes of focused work. You switched out of deep territory 22 times, and it took an average of 8.1 minutes to return to depth each time.

Your strongest stretch was in GitHub, from 09:04 to 10:54, lasting 110 minutes. Across your browser activity, you spent 358 minutes in Deep territories, 23 minutes in Shallow, and 59 minutes in Drain.

Depth was broken at 16:00 when you moved from Python docs to YouTube Shorts, 1 time. YouTube Shorts went 16 minutes over your 20 minute allowance, and X timeline went 8 minutes over your 15 minute allowance.

8 nudges were shown during the day. 1 was accepted with a median return of 2.4 minutes, 2 were snoozed, and 5 were ignored.

Tomorrow, try to limit the transition from Python docs to other sites at 16:00. Keep your browser focused on GitHub during the morning stretch to maintain that momentum.
```
