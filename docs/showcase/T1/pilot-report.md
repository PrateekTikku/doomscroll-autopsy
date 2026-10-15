# T1 pilot report (Phase A: 10 examples)

Gemma 4 31B teacher (UD-Q4_K_XL) on raw `llama-server` (port 8889, `-np 4`, no MTP), thinking off, temperature 0.7, concurrency 1, seed 1.

- **Passed all validators:** 10/10 (naming 5/5, autopsy 5/5). Attempts: 6/10 passed on the first try; the rest used the one allowed retry.
- **Autopsy word counts:** [167, 167, 168, 161, 179] (limit 120-180).
- **Single-stream speed in this run:** naming ~7 chunks/s, autopsy ~9-10 chunks/s (see `s4-throughput.md`).

## What the pilot taught us (all fixed before this run)

1. Number comparison was string-based, so `49.0` did not match `49`. Now numeric.
2. The teacher wrote ~105-word autopsies when asked for 130-170. Prompt now asks for 150-175 words and more explanation per number.
3. My territory-name table produced clumsy names ("Google Calendar calendar"); replaced with an explicit name per site.
4. Switch counts were independent of Deep minutes (52 switches on a day with 2 Deep minutes). They now scale with Deep time.
5. The teacher said "7 day average" and quoted deltas as magnitudes; the validator compared signed strings. Now grounded by magnitude, and "7-day" is allowed only when `vs7Day` is present.

**Known gap:** the validator checks that numbers exist in the facts, not that their *direction* is right ("up" vs "down" for a negative delta). Worth a rubric item in T2's judge.

## Examples

### naming-1-0000 · developer · naming · `{"label": "deep", "edge": "no-titles", "mainSite": "YouTube videos"}`

**Input**

```json
{
 "origins": [
  {
   "origin": "https://www.youtube.com",
   "pathPrefix": "/watch",
   "count": 201
  }
 ],
 "sampleTitles": [],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 0.1,
  "skipRate": 0.01,
  "meanDwellS": 604.9
 },
 "minutesToday": 11
}
```

**Output**

```json
{"name":"Long form YouTube viewing","suggested_label":"deep","why":"A very low itemsPerMin of 0.1 and a meanDwellS of 604.9 indicate sustained focus on a single video."}
```

### naming-1-0001 · writer · naming · `{"label": "shallow", "edge": "with-tags", "mainSite": "Notion"}`

**Input**

```json
{
 "origins": [
  {
   "origin": "https://www.notion.so",
   "pathPrefix": "/",
   "count": 162
  },
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 83
  }
 ],
 "sampleTitles": [
  "Google Calendar - Week of Oct 12",
  "Invoices 2026"
 ],
 "topicTags": [
  {
   "tag": "task tracker",
   "score": 0.71
  }
 ],
 "velocity": {
  "itemsPerMin": 1.2,
  "skipRate": 0.19,
  "meanDwellS": 49.0
 },
 "minutesToday": 121
}
```

**Output**

```json
{"name":"Scheduling and task management","suggested_label":"shallow","why":"Interacting with a calendar and task tracker with a mean dwell of 49.0 seconds suggests administrative coordination."}
```

### naming-1-0002 · researcher · naming · `{"label": "deep", "edge": "no-titles", "mainSite": "arXiv papers"}`

**Input**

```json
{
 "origins": [
  {
   "origin": "https://arxiv.org",
   "pathPrefix": "/abs",
   "count": 301
  }
 ],
 "sampleTitles": [],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 0.8,
  "skipRate": 0.01,
  "meanDwellS": 78.0
 },
 "minutesToday": 24
}
```

**Output**

```json
{"name":"Reading academic papers on arXiv","suggested_label":"deep","why":"A low velocity of 0.8 items per minute and a high mean dwell of 78.0 seconds indicates focused reading."}
```

### naming-1-0003 · designer · naming · `{"label": "drain", "edge": "with-tags", "mainSite": "Dribbble shots"}`

**Input**

```json
{
 "origins": [
  {
   "origin": "https://dribbble.com",
   "pathPrefix": "/shots",
   "count": 195
  }
 ],
 "sampleTitles": [
  "Dribbble - Popular shots",
  "Fintech dashboard concept"
 ],
 "topicTags": [
  {
   "tag": "gym workouts",
   "score": 0.68
  },
  {
   "tag": "memes",
   "score": 0.64
  }
 ],
 "velocity": {
  "itemsPerMin": 9.5,
  "skipRate": 0.24,
  "meanDwellS": 12.5
 },
 "minutesToday": 63
}
```

**Output**

```json
{"name":"Dribbble design inspiration scrolling","suggested_label":"drain","why":"Viewing 9.5 items per minute across 195 shots indicates rapid consumption of visual content."}
```

### naming-1-0004 · student · naming · `{"label": "shallow", "edge": "pure", "mainSite": "Google Calendar"}`

**Input**

```json
{
 "origins": [
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 338
  },
  {
   "origin": "https://canvas.instructure.com",
   "pathPrefix": "/courses",
   "count": 138
  },
  {
   "origin": "https://web.whatsapp.com",
   "pathPrefix": "/",
   "count": 39
  }
 ],
 "sampleTitles": [
  "Assignments",
  "Grades",
  "Google Calendar - Week of Oct 12"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 1.7,
  "skipRate": 0.07,
  "meanDwellS": 58.2
 },
 "minutesToday": 35
}
```

**Output**

```json
{"name":"Scheduling and course administration","suggested_label":"shallow","why":"Activity across calendar, assignments, and chat with 58.2 second mean dwell indicates necessary administrative coordination."}
```

### autopsy-1-0000 · developer · autopsy · `{"edge": "no-nudges"}`

**Input**

```json
{
 "date": "2026-09-13",
 "deepBlocks": {
  "count": 4,
  "longestMin": 91,
  "totalMin": 234,
  "blocks": [
   {
    "start": "09:36",
    "end": "10:45",
    "minutes": 69,
    "territory": "Python docs"
   },
   {
    "start": "12:08",
    "end": "13:39",
    "minutes": 91,
    "territory": "Python docs"
   },
   {
    "start": "14:47",
    "end": "15:28",
    "minutes": 41,
    "territory": "YouTube videos"
   },
   {
    "start": "16:40",
    "end": "17:13",
    "minutes": 33,
    "territory": "MDN docs"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 55,
  "meanMinBackToDeep": 9.9
 },
 "totalsMin": {
  "deep": 268,
  "shallow": 114,
  "drain": 43
 },
 "drainOverAllowance": [
  {
   "territory": "X timeline",
   "allowanceMin": 10,
   "minutesOver": 22
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "GitHub",
   "toTerritory": "YouTube Shorts",
   "hour": 16,
   "count": 5
  },
  {
   "fromTerritory": "Slack",
   "toTerritory": "X timeline",
   "hour": 14,
   "count": 5
  }
 ],
 "strongestStretch": {
  "territory": "Python docs",
  "start": "12:08",
  "end": "13:39",
  "minutes": 91
 },
 "nudges": {
  "shown": 0,
  "accepted": 0,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": null
 },
 "vs7Day": {
  "deepBlocksDelta": -1,
  "drainOverDelta": 14.2
 }
}
```

**Output**

You had 4 deep blocks today, with the longest lasting 91 minutes, totaling 234 minutes of deep work. You switched out of deep territory 55 times, and it took an average of 9.9 minutes to return to a deep state. This reflects 1 fewer deep block than your recent average.

Your strongest stretch occurred in Python docs, from 12:08 to 13:39, lasting 91 minutes. Across your browser activity, you spent 268 minutes in Deep territories, 114 minutes in Shallow, and 43 minutes in Drain. Your drain over allowance was up 14.2 minutes compared to your recent average.

Depth broke most often at 16:00 when you moved from GitHub to YouTube Shorts 5 times, and at 14:00 when you moved from Slack to X timeline 5 times. X timeline ran 22 minutes over your 10 minute allowance.

No nudges were shown during your browser sessions today.

Tomorrow, try to limit visits to X timeline during the 14:00 window. Keep your focus on Python docs to maintain your momentum.

### autopsy-1-0001 · writer · autopsy · `{"edge": "single-long-block"}`

**Input**

```json
{
 "date": "2026-09-07",
 "deepBlocks": {
  "count": 1,
  "longestMin": 123,
  "totalMin": 123,
  "blocks": [
   {
    "start": "08:00",
    "end": "10:03",
    "minutes": 123,
    "territory": "The Atlantic essays"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 29,
  "meanMinBackToDeep": 4.2
 },
 "totalsMin": {
  "deep": 137,
  "shallow": 65,
  "drain": 38
 },
 "drainOverAllowance": [
  {
   "territory": "Instagram Reels",
   "allowanceMin": 15,
   "minutesOver": 5
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Google Docs",
   "toTerritory": "Reddit front page",
   "hour": 15,
   "count": 6
  }
 ],
 "strongestStretch": {
  "territory": "The Atlantic essays",
  "start": "08:00",
  "end": "10:03",
  "minutes": 123
 },
 "nudges": {
  "shown": 4,
  "accepted": 2,
  "snoozed": 2,
  "ignored": 0,
  "medianReturnMin": 8.7
 },
 "vs7Day": {
  "deepBlocksDelta": 0.5,
  "drainOverDelta": -14.3
 }
}
```

**Output**

You had 1 deep block today, the longest 123 minutes, totaling 123 minutes of focused work. You switched out of deep work 29 times, and it took an average of 4.2 minutes to return to a deep state. This is 0.5 more deep blocks than your recent average.

Your strongest stretch was in The Atlantic essays, from 08:00 to 10:03, lasting 123 minutes. Looking at your browser totals, you spent 137 minutes in Deep territories, 65 minutes in Shallow, and 38 minutes in Drain. Your drain over allowance was 14.3 minutes lower than your recent average.

Depth broke most often at 15:00, when you moved from Google Docs to Reddit front page 6 times. Instagram Reels also ran 5 minutes over your 15 minute allowance.

4 nudges were shown. 2 were accepted with a median return of 8.7 minutes, and 2 were snoozed.

Tomorrow, try to limit your time on Reddit front page during the 15:00 hour. Use Google Docs for your primary work before switching territories.

### autopsy-1-0002 · researcher · autopsy · `{"edge": "zero-deep"}`

**Input**

```json
{
 "date": "2026-09-17",
 "deepBlocks": {
  "count": 0,
  "longestMin": 0,
  "totalMin": 0,
  "blocks": []
 },
 "residue": {
  "switchesOutOfDeep": 2,
  "meanMinBackToDeep": 6.1
 },
 "totalsMin": {
  "deep": 2,
  "shallow": 113,
  "drain": 69
 },
 "drainOverAllowance": [
  {
   "territory": "Hacker News",
   "allowanceMin": 15,
   "minutesOver": 35
  },
  {
   "territory": "YouTube home",
   "allowanceMin": 15,
   "minutesOver": 4
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Google Scholar",
   "toTerritory": "X timeline",
   "hour": 17,
   "count": 4
  },
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "Hacker News",
   "hour": 22,
   "count": 6
  }
 ],
 "strongestStretch": {
  "territory": "Overleaf projects",
  "start": "12:20",
  "end": "12:26",
  "minutes": 6
 },
 "nudges": {
  "shown": 5,
  "accepted": 5,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": 7.2
 },
 "vs7Day": {
  "deepBlocksDelta": -1.5,
  "drainOverDelta": -2.9
 }
}
```

**Output**

You had 0 deep blocks today, which is 1.5 fewer deep blocks than your recent average. You switched out of deep work 2 times, and the return to depth took 6.1 minutes.

There was no deep block, but your strongest stretch occurred in Overleaf projects from 12:20 to 12:26 for 6 minutes. Across your browser activity, you spent 2 minutes in Deep, 113 minutes in Shallow, and 69 minutes in Drain.

Depth broke most often at 22:00 when you moved from Google Calendar to Hacker News 6 times, and at 17:00 when you moved from Google Scholar to X timeline 4 times. Hacker News ran 35 minutes over your 15 minute allowance, while YouTube home ran 4 minutes over your 15 minute allowance. Your drain over allowance was 2.9 minutes lower than your recent average.

5 nudges were shown today. All 5 were accepted, with a median return of 7.2 minutes.

Tomorrow, try to stay in Google Scholar after 17:00. Avoid moving to X timeline during that time.

### autopsy-1-0003 · designer · autopsy · `{"edge": "great-day"}`

**Input**

```json
{
 "date": "2026-09-22",
 "deepBlocks": {
  "count": 5,
  "longestMin": 114,
  "totalMin": 393,
  "blocks": [
   {
    "start": "09:27",
    "end": "10:03",
    "minutes": 36,
    "territory": "Figma design files"
   },
   {
    "start": "11:29",
    "end": "12:45",
    "minutes": 76,
    "territory": "Figma design files"
   },
   {
    "start": "14:11",
    "end": "16:05",
    "minutes": 114,
    "territory": "Figma design files"
   },
   {
    "start": "18:02",
    "end": "19:20",
    "minutes": 78,
    "territory": "Figma design files"
   },
   {
    "start": "20:52",
    "end": "22:21",
    "minutes": 89,
    "territory": "Material Design components"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 18,
  "meanMinBackToDeep": 8.1
 },
 "totalsMin": {
  "deep": 429,
  "shallow": 140,
  "drain": 6
 },
 "drainOverAllowance": [],
 "topTriggers": [
  {
   "fromTerritory": "Material Design components",
   "toTerritory": "Dribbble shots",
   "hour": 10,
   "count": 3
  }
 ],
 "strongestStretch": {
  "territory": "Figma design files",
  "start": "14:11",
  "end": "16:05",
  "minutes": 114
 },
 "nudges": {
  "shown": 9,
  "accepted": 2,
  "snoozed": 5,
  "ignored": 2,
  "medianReturnMin": 7.4
 },
 "vs7Day": null
}
```

**Output**

You had 5 deep blocks today, the longest being 114 minutes, for a total of 393 minutes of deep work. You switched out of deep territory 18 times, and it took an average of 8.1 minutes to return each time.

Your strongest stretch occurred in Figma design files from 14:11 to 16:05, lasting 114 minutes. Across your browser activity, you spent 429 minutes in Deep, 140 minutes in Shallow, and 6 minutes in Drain territories.

The most frequent break in depth happened at 10:00, when you moved from Material Design components to Dribbble shots 3 times. This specific transition was the primary trigger that shifted your attention away from deep work during that hour.

9 nudges were shown to you. 2 were accepted with a median return of 7.4 minutes, 5 were snoozed, and 2 were ignored.

Tomorrow, try to limit the use of Dribbble shots during the 10:00 window. Focus on staying within Material Design components to maintain your flow.

### autopsy-1-0004 · student · autopsy · `{"edge": "typical"}`

**Input**

```json
{
 "date": "2026-10-17",
 "deepBlocks": {
  "count": 2,
  "longestMin": 77,
  "totalMin": 143,
  "blocks": [
   {
    "start": "11:43",
    "end": "12:49",
    "minutes": 66,
    "territory": "LeetCode problems"
   },
   {
    "start": "13:29",
    "end": "14:46",
    "minutes": 77,
    "territory": "LeetCode problems"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 12,
  "meanMinBackToDeep": 4.4
 },
 "totalsMin": {
  "deep": 177,
  "shallow": 75,
  "drain": 41
 },
 "drainOverAllowance": [
  {
   "territory": "Instagram Reels",
   "allowanceMin": 20,
   "minutesOver": 4
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Khan Academy math",
   "toTerritory": "YouTube Shorts",
   "hour": 14,
   "count": 3
  },
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "Instagram Reels",
   "hour": 22,
   "count": 3
  }
 ],
 "strongestStretch": {
  "territory": "LeetCode problems",
  "start": "13:29",
  "end": "14:46",
  "minutes": 77
 },
 "nudges": {
  "shown": 6,
  "accepted": 4,
  "snoozed": 1,
  "ignored": 1,
  "medianReturnMin": 7.1
 },
 "vs7Day": {
  "deepBlocksDelta": -1.5,
  "drainOverDelta": 24.9
 }
}
```

**Output**

You had 2 deep blocks today, with the longest lasting 77 minutes. This provided 143 minutes of focused work. You switched out of deep work 12 times, and it took 4.4 minutes on average to get back. This is 1.5 fewer deep blocks than your recent average.

Your strongest stretch occurred in LeetCode problems, from 13:29 to 14:46, totaling 77 minutes. Across your whole browser day, you spent 177 minutes in Deep territories, 75 minutes in Shallow, and 41 minutes in Drain. Your drain over allowance was up 24.9 minutes compared to your recent average.

Depth broke at 14:00 when you moved from Khan Academy math to YouTube Shorts 3 times. It also broke at 22:00 when you moved from Google Calendar to Instagram Reels 3 times. Instagram Reels went 4 minutes over your 20 minute allowance.

6 nudges were shown. 4 were accepted with a median return of 7.1 minutes, 1 was snoozed, and 1 was ignored.

Tomorrow, try to limit your time in Instagram Reels after 22:00. Keep your focus on LeetCode problems during the early afternoon.
