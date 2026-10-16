# 20 side-by-side examples for manual review

For each: the input, then each system's output. Mark which you would ship (and flag anything wrong).

## 1. naming · naming-1-0196 · student · {'label': 'shallow', 'edge': 'mixed-origin', 'mainSite': 'Google Calendar'}

```json
{
 "origins": [
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 73
  },
  {
   "origin": "https://canvas.instructure.com",
   "pathPrefix": "/courses",
   "count": 44
  },
  {
   "origin": "https://www.tiktok.com",
   "pathPrefix": "/foryou",
   "count": 13
  }
 ],
 "sampleTitles": [
  "Google Calendar - Today",
  "Assignments",
  "Grades",
  "Google Calendar - Week of Oct 12"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 1.7,
  "skipRate": 0.17,
  "meanDwellS": 57.4
 },
 "minutesToday": 75
}
```

**Baseline (template / `origin · topic`)**

> {"name": "calendar.google.com \u00b7 calendar", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Scheduling and course administration","suggested_label":"shallow","why":"Activity across calendar, assignments, and grades with a mean dwell of 57.4 seconds indicates routine administrative coordination."}

**Teacher 31B (ceiling)**

> {"name":"Scheduling and course administration","suggested_label":"shallow","why":"Activity is centered on calendar and assignment pages with a slow pace of 1.7 items per minute."}

## 2. naming · naming-1-0645 · developer · {'label': 'drain', 'edge': 'with-tags', 'mainSite': 'Reddit front page'}

```json
{
 "origins": [
  {
   "origin": "https://www.reddit.com",
   "pathPrefix": "/r/all",
   "count": 15
  }
 ],
 "sampleTitles": [
  "TIL octopuses have three hearts",
  "AITA for leaving the group chat?"
 ],
 "topicTags": [
  {
   "tag": "gym workouts",
   "score": 0.55
  },
  {
   "tag": "political commentary",
   "score": 0.33
  }
 ],
 "velocity": {
  "itemsPerMin": 11.5,
  "skipRate": 0.28,
  "meanDwellS": 6.5
 },
 "minutesToday": 29
}
```

**Baseline (template / `origin · topic`)**

> {"name": "reddit.com \u00b7 gym workouts", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Reddit general feed browsing","suggested_label":"drain","why":"A high velocity of 11.5 items per minute and a 0.28 skip rate indicates rapid consumption of short-form content."}

**Teacher 31B (ceiling)**

> {"name":"Reddit general feed browsing","suggested_label":"drain","why":"A velocity of 11.5 items per minute with a 6.5 second mean dwell suggests rapid consumption of varied topics."}

## 3. naming · naming-1-0457 · writer · {'label': 'shallow', 'edge': 'mixed-origin', 'mainSite': 'Notion'}

```json
{
 "origins": [
  {
   "origin": "https://www.notion.so",
   "pathPrefix": "/",
   "count": 90
  },
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 64
  },
  {
   "origin": "https://www.instagram.com",
   "pathPrefix": "/reels",
   "count": 27
  }
 ],
 "sampleTitles": [
  "Editorial calendar",
  "Google Calendar - Week of Oct 12"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 2.5,
  "skipRate": 0.12,
  "meanDwellS": 23.7
 },
 "minutesToday": 3
}
```

**Baseline (template / `origin · topic`)**

> {"name": "notion.so", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Scheduling and calendar management","suggested_label":"shallow","why":"Activity across Notion, Google Calendar, and Instagram Reels with a mean dwell of 23.7 seconds indicates routine administrative coordination."}

**Teacher 31B (ceiling)**

> {"name":"Scheduling and Notion admin","suggested_label":"shallow","why":"Activity across a calendar and Notion with a mean dwell of 23.7 seconds suggests brief organizational tasks."}

## 4. naming · naming-1-0200 · freelancer · {'label': 'drain', 'edge': 'no-titles', 'mainSite': 'LinkedIn feed'}

```json
{
 "origins": [
  {
   "origin": "https://www.linkedin.com",
   "pathPrefix": "/feed",
   "count": 67
  },
  {
   "origin": "https://www.bbc.com",
   "pathPrefix": "/news",
   "count": 50
  },
  {
   "origin": "https://x.com",
   "pathPrefix": "/home",
   "count": 12
  }
 ],
 "sampleTitles": [],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 8.0,
  "skipRate": 0.23,
  "meanDwellS": 11.4
 },
 "minutesToday": 15
}
```

**Baseline (template / `origin · topic`)**

> {"name": "linkedin.com \u00b7 feed", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Social media feed browsing","suggested_label":"drain","why":"A high velocity of 8.0 items per minute across feed and news sites indicates rapid consumption of short-form content."}

**Teacher 31B (ceiling)**

> {"name":"Social feeds and news browsing","suggested_label":"drain","why":"A velocity of 8.0 items per minute across LinkedIn, BBC, and X indicates a pattern of fragmented consumption."}

## 5. naming · naming-1-0149 · designer · {'label': 'deep', 'edge': 'single-origin', 'mainSite': 'Material Design components'}

```json
{
 "origins": [
  {
   "origin": "https://m3.material.io",
   "pathPrefix": "/components",
   "count": 100
  }
 ],
 "sampleTitles": [
  "Buttons – Material Design 3",
  "Navigation drawer – Material Design 3"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 1.1,
  "skipRate": 0.0,
  "meanDwellS": 104.2
 },
 "minutesToday": 74
}
```

**Baseline (template / `origin · topic`)**

> {"name": "m3.material.io \u00b7 components", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Material Design component research","suggested_label":"deep","why":"A low skip rate of 0.0 and a mean dwell of 104.2 seconds indicate focused study of design documentation."}

**Teacher 31B (ceiling)**

> {"name":"Material Design component study","suggested_label":"deep","why":"A mean dwell of 104.2 seconds per page and a 0.0 skip rate indicate focused study of design documentation."}

## 6. naming · naming-1-0375 · designer · {'label': 'shallow', 'edge': 'with-tags', 'mainSite': 'Slack'}

```json
{
 "origins": [
  {
   "origin": "https://app.slack.com",
   "pathPrefix": "/client",
   "count": 304
  },
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 103
  }
 ],
 "sampleTitles": [
  "Google Calendar - Today",
  "#team | Slack",
  "#random | Slack",
  "Google Calendar - Week of Oct 12",
  "Thread in #eng-help | Slack"
 ],
 "topicTags": [
  {
   "tag": "admin",
   "score": 0.59
  }
 ],
 "velocity": {
  "itemsPerMin": 4.9,
  "skipRate": 0.14,
  "meanDwellS": 24.9
 },
 "minutesToday": 57
}
```

**Baseline (template / `origin · topic`)**

> {"name": "app.slack.com \u00b7 admin", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Team coordination and scheduling","suggested_label":"shallow","why":"Activity across Slack and Google Calendar with admin tags indicates routine coordination and scheduling tasks."}

**Teacher 31B (ceiling)**

> {"name":"Slack messages and calendar management","suggested_label":"shallow","why":"The activity consists of administrative tasks across Slack and Google Calendar with a mean dwell of 24.9 seconds per item."}

## 7. naming · naming-1-0385 · student · {'label': 'shallow', 'edge': 'pure', 'mainSite': 'Canvas courses'}

```json
{
 "origins": [
  {
   "origin": "https://canvas.instructure.com",
   "pathPrefix": "/courses",
   "count": 256
  },
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 147
  },
  {
   "origin": "https://web.whatsapp.com",
   "pathPrefix": "/",
   "count": 33
  }
 ],
 "sampleTitles": [
  "WhatsApp",
  "Assignments"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 3.0,
  "skipRate": 0.05,
  "meanDwellS": 28.3
 },
 "minutesToday": 102
}
```

**Baseline (template / `origin · topic`)**

> {"name": "canvas.instructure.com \u00b7 courses", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Course administration and scheduling","suggested_label":"shallow","why":"Activity across Canvas, Google Calendar, and WhatsApp with a mean dwell of 28.3 seconds indicates routine administrative coordination."}

**Teacher 31B (ceiling)**

> {"name":"Course admin and scheduling","suggested_label":"shallow","why":"Activity across Canvas, Google Calendar, and WhatsApp indicates low-value coordination and administrative tasks."}

## 8. naming · naming-1-0132 · designer · {'label': 'drain', 'edge': 'with-tags', 'mainSite': 'Dribbble shots'}

```json
{
 "origins": [
  {
   "origin": "https://dribbble.com",
   "pathPrefix": "/shots",
   "count": 414
  }
 ],
 "sampleTitles": [
  "Dribbble - Popular shots",
  "Fintech dashboard concept"
 ],
 "topicTags": [
  {
   "tag": "cooking videos",
   "score": 0.62
  },
  {
   "tag": "gym workouts",
   "score": 0.49
  }
 ],
 "velocity": {
  "itemsPerMin": 5.5,
  "skipRate": 0.35,
  "meanDwellS": 7.5
 },
 "minutesToday": 97
}
```

**Baseline (template / `origin · topic`)**

> {"name": "dribbble.com \u00b7 cooking videos", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Dribbble design inspiration browsing","suggested_label":"drain","why":"A high velocity of 5.5 items per minute and a 0.35 skip rate indicates rapid consumption of visual content."}

**Teacher 31B (ceiling)**

> {"name":"Dribbble design shot browsing","suggested_label":"drain","why":"A mean dwell of 7.5 seconds across 414 items indicates passive consumption of visual content."}

## 9. naming · naming-1-0292 · developer · {'label': 'deep', 'edge': 'no-titles', 'mainSite': 'GitHub'}

```json
{
 "origins": [
  {
   "origin": "https://github.com",
   "pathPrefix": "/",
   "count": 128
  },
  {
   "origin": "https://www.youtube.com",
   "pathPrefix": "/watch",
   "count": 35
  },
  {
   "origin": "https://developer.mozilla.org",
   "pathPrefix": "/en-US/docs",
   "count": 16
  }
 ],
 "sampleTitles": [],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 0.8,
  "skipRate": 0.0,
  "meanDwellS": 181.1
 },
 "minutesToday": 38
}
```

**Baseline (template / `origin · topic`)**

> {"name": "github.com", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Technical documentation and code review","suggested_label":"deep","why":"A low velocity of 0.8 items per minute and a mean dwell of 181.1 seconds indicates focused study of technical documentation."}

**Teacher 31B (ceiling)**

> {"name":"Software development and technical research","suggested_label":"deep","why":"A mean dwell time of 181.1 seconds and a 0.0 skip rate indicate sustained focus on GitHub and MDN documentation."}

## 10. naming · naming-1-0227 · student · {'label': 'shallow', 'edge': 'single-origin', 'mainSite': 'Google Calendar'}

```json
{
 "origins": [
  {
   "origin": "https://calendar.google.com",
   "pathPrefix": "/calendar",
   "count": 140
  }
 ],
 "sampleTitles": [
  "Google Calendar - Week of Oct 12",
  "Google Calendar - Today"
 ],
 "topicTags": [],
 "velocity": {
  "itemsPerMin": 1.4,
  "skipRate": 0.11,
  "meanDwellS": 57.8
 },
 "minutesToday": 4
}
```

**Baseline (template / `origin · topic`)**

> {"name": "calendar.google.com \u00b7 calendar", "suggested_label": null, "why": ""}

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> {"name":"Google Calendar scheduling","suggested_label":"shallow","why":"The activity consists of managing a calendar with a low velocity of 1.4 items per minute."}

**Teacher 31B (ceiling)**

> {"name":"Google Calendar scheduling","suggested_label":"shallow","why":"Spending 4 minutes with low velocity on calendar pages indicates routine administrative coordination."}

## 11. autopsy · autopsy-1-0178 · writer · {'edge': 'new-user'}

```json
{
 "date": "2026-10-20",
 "deepBlocks": {
  "count": 3,
  "longestMin": 86,
  "totalMin": 233,
  "blocks": [
   {
    "start": "08:38",
    "end": "09:51",
    "minutes": 73,
    "territory": "Google Docs"
   },
   {
    "start": "10:33",
    "end": "11:47",
    "minutes": 74,
    "territory": "The Atlantic essays"
   },
   {
    "start": "13:38",
    "end": "15:04",
    "minutes": 86,
    "territory": "Google Docs"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 18,
  "meanMinBackToDeep": 0.8
 },
 "totalsMin": {
  "deep": 247,
  "shallow": 105,
  "drain": 44
 },
 "drainOverAllowance": [
  {
   "territory": "Reddit front page",
   "allowanceMin": 15,
   "minutesOver": 2
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "The Atlantic essays",
   "toTerritory": "Instagram Reels",
   "hour": 12,
   "count": 5
  },
  {
   "fromTerritory": "Google Docs",
   "toTerritory": "Reddit front page",
   "hour": 15,
   "count": 4
  }
 ],
 "strongestStretch": {
  "territory": "Google Docs",
  "start": "13:38",
  "end": "15:04",
  "minutes": 86
 },
 "nudges": {
  "shown": 5,
  "accepted": 4,
  "snoozed": 0,
  "ignored": 1,
  "medianReturnMin": 7.7
 },
 "vs7Day": null
}
```

**Baseline (template / `origin · topic`)**

> 3 deep blocks today, the longest 86 minutes, 233 minutes in total. 18 switchs out of deep work, and it took 0.8 minutes on average to get back. Your browser time was 247 minutes deep, 105 shallow and 44 drain. Strongest stretch: Google Docs, 13:38 to 15:04, 86 minutes. Over allowance: Reddit front page by 2 minutes. What broke depth: The Atlantic essays to Instagram Reels around 12:00, 5 times; Google Docs to Reddit front page around 15:00, 4 times. Nudges shown: 5, accepted 4, snoozed 0, ignored 1, median time back 7.7 minutes. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 3 deep blocks today, the longest 86 minutes, totaling 233 minutes of focused work. You switched out of deep work 18 times, and it took an average of 0.8 minutes to return to a deep state.
> 
> Your strongest stretch occurred in Google Docs, from 13:38 to 15:04, lasting 86 minutes. Across your browser activity, you spent 247 minutes in Deep territories, 105 minutes in Shallow territories, and 44 minutes in Drain territories.
> 
> Depth broke most frequently at 12:00, when you moved from The Atlantic essays to Instagram Reels 5 times. At 15:00, you moved from Google Docs to Reddit front page 4 times. Reddit front page went 2 minutes over your 15 minute allowance.
> 
> 5 nudges were shown. 4 were accepted with a median return of 7.7 minutes, and 1 was ignored.
> 
> Tomorrow, try to limit your time on Reddit front page during the 12:00 hour. Use a specific timer to stay within your allowance.

**Teacher 31B (ceiling)**

> You had 3 deep blocks today, the longest 86 minutes, for a total of 233 minutes of focus. You switched out of deep work 18 times, and it took an average of 0.8 minutes to return to a deep state.
> 
> Your strongest stretch occurred in Google Docs, from 13:38 to 15:04, lasting 86 minutes. In terms of total browser time, you spent 247 minutes in Deep territories, 105 minutes in Shallow, and 44 minutes in Drain.
> 
> Depth was most frequently broken at 12:00, when you moved from The Atlantic essays to Instagram Reels 5 times, and at 15:00, when you moved from Google Docs to Reddit front page 4 times. Reddit front page went 2 minutes over your 15 minute allowance.
> 
> 5 nudges were shown. 4 were accepted with a median return of 7.7 minutes, while 1 was ignored.
> 
> Tomorrow, try to limit your visits to Instagram Reels after 12:00. You can do this by keeping The Atlantic essays open in a dedicated window.

## 12. autopsy · autopsy-1-0152 · designer · {'edge': 'no-nudges'}

```json
{
 "date": "2026-09-01",
 "deepBlocks": {
  "count": 3,
  "longestMin": 75,
  "totalMin": 153,
  "blocks": [
   {
    "start": "09:34",
    "end": "10:49",
    "minutes": 75,
    "territory": "Material Design components"
   },
   {
    "start": "12:33",
    "end": "13:21",
    "minutes": 48,
    "territory": "Material Design components"
   },
   {
    "start": "14:35",
    "end": "15:05",
    "minutes": 30,
    "territory": "Figma design files"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 22,
  "meanMinBackToDeep": 2.9
 },
 "totalsMin": {
  "deep": 186,
  "shallow": 136,
  "drain": 66
 },
 "drainOverAllowance": [
  {
   "territory": "TikTok For You",
   "allowanceMin": 10,
   "minutesOver": 23
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Material Design components",
   "toTerritory": "Dribbble shots",
   "hour": 15,
   "count": 7
  }
 ],
 "strongestStretch": {
  "territory": "Material Design components",
  "start": "09:34",
  "end": "10:49",
  "minutes": 75
 },
 "nudges": {
  "shown": 0,
  "accepted": 0,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": null
 },
 "vs7Day": null
}
```

**Baseline (template / `origin · topic`)**

> 3 deep blocks today, the longest 75 minutes, 153 minutes in total. 22 switchs out of deep work, and it took 2.9 minutes on average to get back. Your browser time was 186 minutes deep, 136 shallow and 66 drain. Strongest stretch: Material Design components, 09:34 to 10:49, 75 minutes. Over allowance: TikTok For You by 23 minutes. What broke depth: Material Design components to Dribbble shots around 15:00, 7 times. No nudges were shown. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 3 deep blocks today, the longest 75 minutes, totaling 153 minutes of focused work. You switched out of deep work 22 times, and it took an average of 2.9 minutes to return to a deep state.
> 
> Your strongest stretch occurred in Material Design components, from 09:34 to 10:49, lasting 75 minutes. Across your entire browser day, you spent 186 minutes in Deep territories, 136 minutes in Shallow territories, and 66 minutes in Drain territories.
> 
> Depth was broken most frequently at 15:00, when you moved from Material Design components to Dribbble shots 7 times. Additionally, TikTok For You ran 23 minutes over your 10 minute allowance, which contributed to the Drain total.
> 
> No nudges were shown during your browser activity today.
> 
> Tomorrow, try to limit your visits to Dribbble shots during the 15:00 hour. Use that time to stay in Material Design components instead.

**Teacher 31B (ceiling)**

> You had 3 deep blocks today, the longest 75 minutes, for a total of 153 minutes of focused work. You switched out of deep work 22 times, and the average time to return to a deep state was 2.9 minutes.
> 
> Your strongest stretch occurred in Material Design components, from 09:34 to 10:49, lasting 75 minutes of uninterrupted activity. Across the day, your browser totals were 186 minutes in Deep, 136 minutes in Shallow, and 66 minutes in Drain.
> 
> Depth broke most frequently at 15:00, when you moved from Material Design components to Dribbble shots 7 times. Additionally, TikTok For You ran 23 minutes over your 10 minute allowance, which contributed to your total Drain time.
> 
> No nudges were shown during your browser activity today.
> 
> Tomorrow, try to limit your visits to Dribbble shots during the 15:00 window. Focus instead on staying within Material Design components to extend your deep blocks.

## 13. autopsy · autopsy-1-0137 · student · {'edge': 'single-long-block'}

```json
{
 "date": "2026-10-25",
 "deepBlocks": {
  "count": 1,
  "longestMin": 121,
  "totalMin": 121,
  "blocks": [
   {
    "start": "11:09",
    "end": "13:10",
    "minutes": 121,
    "territory": "LeetCode problems"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 38,
  "meanMinBackToDeep": 10.7
 },
 "totalsMin": {
  "deep": 162,
  "shallow": 105,
  "drain": 100
 },
 "drainOverAllowance": [
  {
   "territory": "Instagram Reels",
   "allowanceMin": 30,
   "minutesOver": 46
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "WhatsApp Web",
   "toTerritory": "Instagram Reels",
   "hour": 23,
   "count": 7
  }
 ],
 "strongestStretch": {
  "territory": "LeetCode problems",
  "start": "11:09",
  "end": "13:10",
  "minutes": 121
 },
 "nudges": {
  "shown": 6,
  "accepted": 0,
  "snoozed": 0,
  "ignored": 6,
  "medianReturnMin": null
 },
 "vs7Day": {
  "deepBlocksDelta": 0,
  "drainOverDelta": 13.6
 }
}
```

**Baseline (template / `origin · topic`)**

> 1 deep block today, the longest 121 minutes, 121 minutes in total. 38 switchs out of deep work, and it took 10.7 minutes on average to get back. Your browser time was 162 minutes deep, 105 shallow and 100 drain. Strongest stretch: LeetCode problems, 11:09 to 13:10, 121 minutes. Over allowance: Instagram Reels by 46 minutes. What broke depth: WhatsApp Web to Instagram Reels around 23:00, 7 times. Nudges shown: 6, accepted 0, snoozed 0, ignored 6. Against your 7-day average: +0 deep blocks, +13.6 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 1 deep block today, the longest 121 minutes, which provided 121 minutes of focused work. You switched out of deep work 38 times, and it took an average of 10.7 minutes to return to a deep state. This is 0 deep blocks compared to your recent average.
> 
> Your strongest stretch was in LeetCode problems, from 11:09 to 13:10, lasting 121 minutes. Across your browser activity, you spent 162 minutes in Deep territories, 105 minutes in Shallow, and 100 minutes in Drain. Your drain over allowance was up 13.6 minutes compared to your recent average.
> 
> Depth broke most often at 23:00, when you moved from WhatsApp Web to Instagram Reels 7 times. Instagram Reels went 46 minutes over your 30 minute allowance.
> 
> 6 nudges were shown. All 6 were ignored, meaning no nudges successfully brought you back to deep work.
> 
> Tomorrow, try to limit your time in Instagram Reels during the 23:00 hour. Use a different browser tab for LeetCode problems to maintain your focus.

**Teacher 31B (ceiling)**

> You had 1 deep block today, the longest 121 minutes, totaling 121 minutes of unbroken focus. You switched out of deep work 38 times, and each return took about 10.7 minutes. This is 0 deep blocks different than your recent average.
> 
> Your strongest stretch was in LeetCode problems, from 11:09 to 13:10, lasting 121 minutes. Across the browser day, you spent 162 minutes in Deep territories, 105 minutes in Shallow territories, and 100 minutes in Drain territories. Your drain over allowance was up 13.6 minutes compared to your recent average.
> 
> Depth broke most often around 23:00, when you moved from WhatsApp Web to Instagram Reels 7 times. Instagram Reels ran 46 minutes past your 30 minute allowance, which contributed to the total drain.
> 
> 6 nudges were shown. All 6 were ignored, meaning they did not help you return to a deep state.
> 
> Tomorrow, try to close the tab for Instagram Reels before you open WhatsApp Web. Do this specifically during the evening hours to avoid the 23:00 trigger.

## 14. autopsy · autopsy-1-0173 · developer · {'edge': 'zero-deep'}

```json
{
 "date": "2026-10-07",
 "deepBlocks": {
  "count": 0,
  "longestMin": 0,
  "totalMin": 0,
  "blocks": []
 },
 "residue": {
  "switchesOutOfDeep": 1,
  "meanMinBackToDeep": 0.9
 },
 "totalsMin": {
  "deep": 14,
  "shallow": 44,
  "drain": 30
 },
 "drainOverAllowance": [],
 "topTriggers": [
  {
   "fromTerritory": "GitHub",
   "toTerritory": "YouTube Shorts",
   "hour": 15,
   "count": 5
  },
  {
   "fromTerritory": "Linear",
   "toTerritory": "X timeline",
   "hour": 11,
   "count": 5
  }
 ],
 "strongestStretch": {
  "territory": "Python docs",
  "start": "10:49",
  "end": "10:58",
  "minutes": 9
 },
 "nudges": {
  "shown": 5,
  "accepted": 1,
  "snoozed": 2,
  "ignored": 2,
  "medianReturnMin": 6.9
 },
 "vs7Day": {
  "deepBlocksDelta": 1.5,
  "drainOverDelta": 21.5
 }
}
```

**Baseline (template / `origin · topic`)**

> No deep blocks today. 1 switch out of deep work, and it took 0.9 minutes on average to get back. Your browser time was 14 minutes deep, 44 shallow and 30 drain. Strongest stretch: Python docs, 10:49 to 10:58, 9 minutes. What broke depth: GitHub to YouTube Shorts around 15:00, 5 times; Linear to X timeline around 11:00, 5 times. Nudges shown: 5, accepted 1, snoozed 2, ignored 2, median time back 6.9 minutes. Against your 7-day average: +1.5 deep blocks, +21.5 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 0 deep blocks today, meaning no single stretch of depth reached a high volume of 25 minutes. You switched out of deep territory 1 time, and it took 0.9 minutes to return. This is 1.5 fewer deep blocks than your recent average.
> 
> Your strongest stretch was in Python docs, from 10:49 to 10:58, lasting 9 minutes. Across your browser activity, you spent 14 minutes in Deep territories, 44 minutes in Shallow territories, and 30 minutes in Drain territories. Your drain over allowance was up 21.5 minutes compared to your recent average.
> 
> Depth broke most often at 15:00, when you moved from GitHub to YouTube Shorts 5 times. At 11:00, you moved from Linear to X timeline 5 times. You also switched from GitHub to Linear at 11:00.
> 
> 5 nudges were shown. 1 was accepted with a median return of 6.9 minutes, 2 were snoozed, and 2 were ignored.
> 
> Tomorrow, try to limit the transition from Linear to X timeline during the 11:00 hour. Use a specific timer to stay within your Shallow territories.

**Teacher 31B (ceiling)**

> You had 0 deep blocks today, meaning no single stretch of deep work lasted at least 25 minutes. You switched out of deep territory 1 time, and it took 0.9 minutes to return. This is 1.5 fewer deep blocks than your recent average.
> 
> Your strongest stretch was in Python docs, from 10:49 to 10:58, lasting 9 minutes. Across your browser activity, you spent 14 minutes in Deep territories, 44 minutes in Shallow, and 30 minutes in Drain.
> 
> Depth broke most often at 15:00, when you moved from GitHub to YouTube Shorts 5 times. Another trigger occurred at 11:00, when you switched from Linear to X timeline 5 times.
> 
> 5 nudges were shown to help you refocus. 1 was accepted with a median return of 6.9 minutes, 2 were snoozed, and 2 were ignored.
> 
> Tomorrow, try to stay in Python docs for longer than 9 minutes to build a deep block. Set a specific goal for your time in Linear before 11:00 to avoid X timeline.

## 15. autopsy · autopsy-1-0051 · designer · {'edge': 'new-user'}

```json
{
 "date": "2026-10-25",
 "deepBlocks": {
  "count": 1,
  "longestMin": 77,
  "totalMin": 77,
  "blocks": [
   {
    "start": "09:28",
    "end": "10:45",
    "minutes": 77,
    "territory": "Figma design files"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 15,
  "meanMinBackToDeep": 2.4
 },
 "totalsMin": {
  "deep": 111,
  "shallow": 39,
  "drain": 61
 },
 "drainOverAllowance": [
  {
   "territory": "TikTok For You",
   "allowanceMin": 10,
   "minutesOver": 29
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Figma design files",
   "toTerritory": "Dribbble shots",
   "hour": 10,
   "count": 6
  },
  {
   "fromTerritory": "Slack",
   "toTerritory": "TikTok For You",
   "hour": 13,
   "count": 7
  }
 ],
 "strongestStretch": {
  "territory": "Figma design files",
  "start": "09:28",
  "end": "10:45",
  "minutes": 77
 },
 "nudges": {
  "shown": 6,
  "accepted": 6,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": 5.2
 },
 "vs7Day": null
}
```

**Baseline (template / `origin · topic`)**

> 1 deep block today, the longest 77 minutes, 77 minutes in total. 15 switchs out of deep work, and it took 2.4 minutes on average to get back. Your browser time was 111 minutes deep, 39 shallow and 61 drain. Strongest stretch: Figma design files, 09:28 to 10:45, 77 minutes. Over allowance: TikTok For You by 29 minutes. What broke depth: Figma design files to Dribbble shots around 10:00, 6 times; Slack to TikTok For You around 13:00, 7 times. Nudges shown: 6, accepted 6, snoozed 0, ignored 0, median time back 5.2 minutes. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 1 deep block today, the longest 77 minutes, which provided 77 minutes of focused work. You switched out of deep work 15 times, and it took an average of 2.4 minutes to return to a deep state.
> 
> Your strongest stretch was in Figma design files, from 09:28 to 10:45, lasting 77 minutes. Across your browser activity, you spent 111 minutes in Deep territories, 39 minutes in Shallow, and 61 minutes in Drain.
> 
> Depth broke most frequently at 10:00, when you moved from Figma design files to Dribbble shots 6 times. At 13:00, you moved from Slack to TikTok For You 7 times. TikTok For You ran 29 minutes over your 10 minute allowance.
> 
> 6 nudges were shown. All 6 were accepted, with a median return time of 5.2 minutes.
> 
> Tomorrow, try to limit your time in Slack during the 10:00 window. Keep your focus on Figma design files until your first deep block is fully complete.

**Teacher 31B (ceiling)**

> You had 1 deep block today, the longest 77 minutes, totaling 77 minutes of focused work. You switched out of deep territory 15 times, and it took an average of 2.4 minutes to return to a deep state.
> 
> Your strongest stretch occurred in Figma design files, from 09:28 to 10:45, lasting 77 minutes. Throughout the browser day, you spent 111 minutes in Deep territories, 39 minutes in Shallow, and 61 minutes in Drain.
> 
> Depth broke most frequently at 13:00 when you moved from Slack to TikTok For You 7 times, and at 10:00 when you moved from Figma design files to Dribbble shots 6 times. TikTok For You ran 29 minutes over your 10 minute allowance.
> 
> 6 nudges were shown today. All 6 were accepted, with a median return time of 5.2 minutes.
> 
> Tomorrow, try to limit your time in TikTok For You during the 13:00 window. Use the Figma design files territory to anchor your morning work.

## 16. autopsy · autopsy-1-0237 · designer · {'edge': 'typical'}

```json
{
 "date": "2026-09-12",
 "deepBlocks": {
  "count": 4,
  "longestMin": 114,
  "totalMin": 347,
  "blocks": [
   {
    "start": "09:42",
    "end": "11:26",
    "minutes": 104,
    "territory": "Figma design files"
   },
   {
    "start": "12:38",
    "end": "13:30",
    "minutes": 52,
    "territory": "Figma design files"
   },
   {
    "start": "14:09",
    "end": "15:26",
    "minutes": 77,
    "territory": "Figma design files"
   },
   {
    "start": "17:20",
    "end": "19:14",
    "minutes": 114,
    "territory": "Figma design files"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 39,
  "meanMinBackToDeep": 7.8
 },
 "totalsMin": {
  "deep": 350,
  "shallow": 80,
  "drain": 42
 },
 "drainOverAllowance": [
  {
   "territory": "Dribbble shots",
   "allowanceMin": 30,
   "minutesOver": 1
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Figma design files",
   "toTerritory": "Dribbble shots",
   "hour": 10,
   "count": 2
  },
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "TikTok For You",
   "hour": 13,
   "count": 2
  }
 ],
 "strongestStretch": {
  "territory": "Figma design files",
  "start": "17:20",
  "end": "19:14",
  "minutes": 114
 },
 "nudges": {
  "shown": 1,
  "accepted": 1,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": 2.5
 },
 "vs7Day": {
  "deepBlocksDelta": 1.5,
  "drainOverDelta": -19.3
 }
}
```

**Baseline (template / `origin · topic`)**

> 4 deep blocks today, the longest 114 minutes, 347 minutes in total. 39 switchs out of deep work, and it took 7.8 minutes on average to get back. Your browser time was 350 minutes deep, 80 shallow and 42 drain. Strongest stretch: Figma design files, 17:20 to 19:14, 114 minutes. Over allowance: Dribbble shots by 1 minutes. What broke depth: Figma design files to Dribbble shots around 10:00, 2 times; Google Calendar to TikTok For You around 13:00, 2 times. Nudges shown: 1, accepted 1, snoozed 0, ignored 0, median time back 2.5 minutes. Against your 7-day average: +1.5 deep blocks, -19.3 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 4 deep blocks today, the longest 114 minutes, totaling 347 minutes of focused work. You switched out of deep work 39 times, and it took an average of 7.8 minutes to return to a deep state. This is 1.5 more deep blocks than your recent average.
> 
> Your strongest stretch was in Figma design files, from 17:20 to 19:14, lasting 114 minutes. Across your browser activity, you spent 350 minutes in Deep territories, 80 minutes in Shallow, and 42 minutes in Drain. Your drain over allowance was 19.3 minutes lower than your recent average.
> 
> Depth broke most often at 10:00, when you moved from Figma design files to Dribbble shots 2 times. At 13:00, you moved from Google Calendar to TikTok For You 2 times. Dribbble shots went 1 minute over your 30 minute allowance.
> 
> 1 nudge was shown. This nudge was accepted, and it took a median of 2.5 minutes to return to your work.
> 
> Tomorrow, try to limit your visits to Dribbble shots during the 10:00 window. Use Figma design files only for your primary tasks.

**Teacher 31B (ceiling)**

> You had 4 deep blocks today, the longest 114 minutes, totaling 347 minutes of focused work. You switched out of deep work 39 times, and it took an average of 7.8 minutes to return to a deep state. This represents 1.5 more deep blocks than your recent average.
> 
> Your strongest stretch occurred in Figma design files, from 17:20 to 19:14, lasting 114 minutes. Across your browser activity, you spent 350 minutes in Deep territories, 80 minutes in Shallow, and 42 minutes in Drain. Your drain over allowance was 19.3 minutes lower than your recent average.
> 
> Depth broke most often at 10:00 when you moved from Figma design files to Dribbble shots 2 times, and at 13:00 when you moved from Google Calendar to TikTok For You 2 times. Dribbble shots went 1 minute over your 30 minute allowance.
> 
> 1 nudge was shown and accepted, with a median return time of 2.5 minutes.
> 
> Tomorrow, try to limit visits to Dribbble shots while you are in Figma design files. Do this specifically during the 10:00 window.

## 17. autopsy · autopsy-1-0205 · researcher · {'edge': 'zero-deep'}

```json
{
 "date": "2026-10-11",
 "deepBlocks": {
  "count": 0,
  "longestMin": 0,
  "totalMin": 0,
  "blocks": []
 },
 "residue": {
  "switchesOutOfDeep": 2,
  "meanMinBackToDeep": 3.1
 },
 "totalsMin": {
  "deep": 3,
  "shallow": 28,
  "drain": 57
 },
 "drainOverAllowance": [
  {
   "territory": "Hacker News",
   "allowanceMin": 15,
   "minutesOver": 20
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Overleaf projects",
   "toTerritory": "X timeline",
   "hour": 17,
   "count": 6
  },
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "Hacker News",
   "hour": 23,
   "count": 1
  }
 ],
 "strongestStretch": {
  "territory": "arXiv papers",
  "start": "13:51",
  "end": "13:58",
  "minutes": 7
 },
 "nudges": {
  "shown": 1,
  "accepted": 1,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": 4.6
 },
 "vs7Day": {
  "deepBlocksDelta": 1.5,
  "drainOverDelta": -14.4
 }
}
```

**Baseline (template / `origin · topic`)**

> No deep blocks today. 2 switchs out of deep work, and it took 3.1 minutes on average to get back. Your browser time was 3 minutes deep, 28 shallow and 57 drain. Strongest stretch: arXiv papers, 13:51 to 13:58, 7 minutes. Over allowance: Hacker News by 20 minutes. What broke depth: Overleaf projects to X timeline around 17:00, 6 times; Google Calendar to Hacker News around 23:00, 1 time. Nudges shown: 1, accepted 1, snoozed 0, ignored 0, median time back 4.6 minutes. Against your 7-day average: +1.5 deep blocks, -14.4 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 0 deep blocks today, meaning no single stretch of deep work reached the 25 minute threshold. You switched out of deep territory 2 times, and it took an average of 3.1 minutes to return to a deep state.
> 
> Your strongest stretch was in arXiv papers, from 13:51 to 13:58, lasting 7 minutes. Across your browser activity, you spent 3 minutes in Deep territories, 28 minutes in Shallow, and 57 minutes in Drain. Your drain over allowance was 14.4 minutes lower than your recent average.
> 
> Depth broke most often at 17:00, when you moved from Overleaf projects to X timeline 6 times. You also moved from Google Calendar to Hacker News 1 time at 23:00. Hacker News went 20 minutes over your 15 minute allowance.
> 
> 1 nudge was shown. This nudge was accepted, and it took 4.6 minutes to return to your work.
> 
> Tomorrow, try to limit your time in Hacker News during the 17:00 hour. Use a specific timer to stay within your allowance.

**Teacher 31B (ceiling)**

> You had 0 deep blocks today, which means you did not reach the 25 minute threshold for unbroken depth. You also switched out of deep work 2 times, with each return taking about 3.1 minutes. This is 1.5 fewer deep blocks than your recent average.
> 
> Your strongest stretch was in arXiv papers, from 13:51 to 13:58, lasting 7 minutes. Looking at your totals, you spent 3 minutes in Deep territories, 28 minutes in Shallow, and 57 minutes in Drain. Your drain over allowance was 14.4 minutes lower than your recent average.
> 
> Depth broke most often at 17:00, when you moved from Overleaf projects to X timeline 6 times. You also moved from Google Calendar to Hacker News at 23:00. Hacker News ran 20 minutes past your 15 minute allowance.
> 
> 1 nudge was shown. It was accepted, with a median return of 4.6 minutes.
> 
> Tomorrow, try to avoid the X timeline during your work in Overleaf projects. Focus on staying in arXiv papers for longer stretches tomorrow afternoon.

## 18. autopsy · autopsy-1-0007 · researcher · {'edge': 'typical'}

```json
{
 "date": "2026-10-15",
 "deepBlocks": {
  "count": 4,
  "longestMin": 83,
  "totalMin": 195,
  "blocks": [
   {
    "start": "10:32",
    "end": "11:55",
    "minutes": 83,
    "territory": "Overleaf projects"
   },
   {
    "start": "12:49",
    "end": "13:37",
    "minutes": 48,
    "territory": "arXiv papers"
   },
   {
    "start": "14:31",
    "end": "15:08",
    "minutes": 37,
    "territory": "Overleaf projects"
   },
   {
    "start": "15:39",
    "end": "16:06",
    "minutes": 27,
    "territory": "Overleaf projects"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 31,
  "meanMinBackToDeep": 10.8
 },
 "totalsMin": {
  "deep": 234,
  "shallow": 36,
  "drain": 38
 },
 "drainOverAllowance": [
  {
   "territory": "X timeline",
   "allowanceMin": 15,
   "minutesOver": 8
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Overleaf projects",
   "toTerritory": "X timeline",
   "hour": 12,
   "count": 1
  }
 ],
 "strongestStretch": {
  "territory": "Overleaf projects",
  "start": "10:32",
  "end": "11:55",
  "minutes": 83
 },
 "nudges": {
  "shown": 3,
  "accepted": 1,
  "snoozed": 2,
  "ignored": 0,
  "medianReturnMin": 3.7
 },
 "vs7Day": {
  "deepBlocksDelta": 0.5,
  "drainOverDelta": -18.6
 }
}
```

**Baseline (template / `origin · topic`)**

> 4 deep blocks today, the longest 83 minutes, 195 minutes in total. 31 switchs out of deep work, and it took 10.8 minutes on average to get back. Your browser time was 234 minutes deep, 36 shallow and 38 drain. Strongest stretch: Overleaf projects, 10:32 to 11:55, 83 minutes. Over allowance: X timeline by 8 minutes. What broke depth: Overleaf projects to X timeline around 12:00, 1 time. Nudges shown: 3, accepted 1, snoozed 2, ignored 0, median time back 3.7 minutes. Against your 7-day average: +0.5 deep blocks, -18.6 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 4 deep blocks today, the longest 83 minutes, totaling 195 minutes of focused work. You switched out of deep work 31 times, and it took an average of 10.8 minutes to return to a deep state. This is 0.5 more deep blocks than your recent average.
> 
> Your strongest stretch was in Overleaf projects, from 10:32 to 11:55, lasting 83 minutes. Across your browser activity, you spent 234 minutes in Deep territories, 36 minutes in Shallow, and 38 minutes in Drain. Your drain over allowance was 18.6 minutes lower than your recent average.
> 
> Depth broke most often at 12:00, when you moved from Overleaf projects to X timeline 1 time. This specific transition happened at 1:00, which interrupted your flow during the afternoon.
> 
> 3 nudges were shown. 1 was accepted with a median return of 3.7 minutes, and 2 were snoozed.
> 
> Tomorrow, try to limit the transition from Overleaf projects to X timeline during the 12:00 hour. Use a specific timer to stay within your allowance for the afternoon.

**Teacher 31B (ceiling)**

> You had 4 deep blocks today, the longest 83 minutes, for a total of 195 minutes of focused work. You switched out of deep work 31 times, and it took an average of 10.8 minutes to return to your flow. This is 0.5 more deep blocks than your recent average.
> 
> Your strongest stretch was in Overleaf projects, from 10:32 to 11:55, lasting 83 minutes. Across your browser activity, you spent 234 minutes in Deep territories, 36 minutes in Shallow and 38 minutes in Drain. Your drain over allowance was 18.6 minutes lower than your recent average.
> 
> Depth broke at 12:00, when you moved from Overleaf projects to X timeline, 1 time. This activity in X timeline went 8 minutes over your 15 minute allowance.
> 
> 3 nudges were shown to help you refocus. 1 was accepted with a median return of 3.7 minutes, while 2 were snoozed.
> 
> Tomorrow, try to stay in Overleaf projects during the 12:00 window. Keep X timeline for a time after your main work blocks.

## 19. autopsy · autopsy-1-0217 · designer · {'edge': 'single-long-block'}

```json
{
 "date": "2026-09-16",
 "deepBlocks": {
  "count": 1,
  "longestMin": 133,
  "totalMin": 133,
  "blocks": [
   {
    "start": "09:18",
    "end": "11:31",
    "minutes": 133,
    "territory": "Material Design components"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 31,
  "meanMinBackToDeep": 8.9
 },
 "totalsMin": {
  "deep": 159,
  "shallow": 17,
  "drain": 44
 },
 "drainOverAllowance": [
  {
   "territory": "TikTok For You",
   "allowanceMin": 15,
   "minutesOver": 19
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "TikTok For You",
   "hour": 21,
   "count": 1
  }
 ],
 "strongestStretch": {
  "territory": "Material Design components",
  "start": "09:18",
  "end": "11:31",
  "minutes": 133
 },
 "nudges": {
  "shown": 1,
  "accepted": 0,
  "snoozed": 0,
  "ignored": 1,
  "medianReturnMin": null
 },
 "vs7Day": {
  "deepBlocksDelta": 0.5,
  "drainOverDelta": 2.3
 }
}
```

**Baseline (template / `origin · topic`)**

> 1 deep block today, the longest 133 minutes, 133 minutes in total. 31 switchs out of deep work, and it took 8.9 minutes on average to get back. Your browser time was 159 minutes deep, 17 shallow and 44 drain. Strongest stretch: Material Design components, 09:18 to 11:31, 133 minutes. Over allowance: TikTok For You by 19 minutes. What broke depth: Google Calendar to TikTok For You around 21:00, 1 time. Nudges shown: 1, accepted 0, snoozed 0, ignored 1. Against your 7-day average: +0.5 deep blocks, +2.3 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 1 deep block today, the longest 133 minutes, which provided 133 minutes of focused work. You switched out of deep work 31 times, and it took an average of 8.9 minutes to return to a deep state. This is 0.5 more deep blocks than your recent average.
> 
> Your strongest stretch was in Material Design components, from 09:18 to 11:31, lasting 133 minutes. Across your browser activity, you spent 159 minutes in Deep territories, 17 minutes in Shallow, and 44 minutes in Drain. Your drain over allowance was up 2.3 minutes compared to your recent average.
> 
> Depth broke most often at 21:00, when you moved from Google Calendar to TikTok For You, 1 time. TikTok For You ran 19 minutes over your 15 minute allowance.
> 
> 1 nudge was shown to you. This nudge was snoozed, meaning it did not result in an immediate return to deep work.
> 
> Tomorrow, try to limit your time in TikTok For You during the 21:00 hour. Use Google Calendar for your primary tasks to maintain your focus.

**Teacher 31B (ceiling)**

> You had 1 deep block today, the longest 133 minutes, which provided 133 minutes of continuous focus. You switched out of deep work 31 times, and it took an average of 8.9 minutes to return to a deep state. This is 0.5 more deep blocks than your recent average.
> 
> Your strongest stretch was in Material Design components, from 09:18 to 11:31, lasting 133 minutes. Across your browser activity, you spent 159 minutes in Deep territories, 17 in Shallow, and 44 in Drain. Your drain over allowance was up 2.3 minutes compared to your recent average.
> 
> Depth broke at 21:00, when you moved from Google Calendar to TikTok For You, 1 time. TikTok For You went 19 minutes over your 15 minute allowance, adding to the total drain.
> 
> 1 nudge was shown, and it was ignored.
> 
> Tomorrow, try to avoid visiting TikTok For You after you open Google Calendar. Set a specific time to check that site after your deep work is complete.

## 20. autopsy · autopsy-1-0428 · developer · {'edge': 'drain-heavy'}

```json
{
 "date": "2026-09-05",
 "deepBlocks": {
  "count": 4,
  "longestMin": 90,
  "totalMin": 261,
  "blocks": [
   {
    "start": "09:29",
    "end": "10:27",
    "minutes": 58,
    "territory": "GitHub"
   },
   {
    "start": "11:29",
    "end": "12:10",
    "minutes": 41,
    "territory": "MDN docs"
   },
   {
    "start": "13:54",
    "end": "15:24",
    "minutes": 90,
    "territory": "GitHub"
   },
   {
    "start": "16:40",
    "end": "17:52",
    "minutes": 72,
    "territory": "Python docs"
   }
  ]
 },
 "residue": {
  "switchesOutOfDeep": 54,
  "meanMinBackToDeep": 9.3
 },
 "totalsMin": {
  "deep": 290,
  "shallow": 139,
  "drain": 110
 },
 "drainOverAllowance": [
  {
   "territory": "YouTube Shorts",
   "allowanceMin": 15,
   "minutesOver": 34
  }
 ],
 "topTriggers": [
  {
   "fromTerritory": "YouTube videos",
   "toTerritory": "YouTube Shorts",
   "hour": 15,
   "count": 2
  },
  {
   "fromTerritory": "Google Calendar",
   "toTerritory": "X timeline",
   "hour": 14,
   "count": 7
  }
 ],
 "strongestStretch": {
  "territory": "GitHub",
  "start": "13:54",
  "end": "15:24",
  "minutes": 90
 },
 "nudges": {
  "shown": 4,
  "accepted": 4,
  "snoozed": 0,
  "ignored": 0,
  "medianReturnMin": 8.4
 },
 "vs7Day": {
  "deepBlocksDelta": -1.5,
  "drainOverDelta": -21.5
 }
}
```

**Baseline (template / `origin · topic`)**

> 4 deep blocks today, the longest 90 minutes, 261 minutes in total. 54 switchs out of deep work, and it took 9.3 minutes on average to get back. Your browser time was 290 minutes deep, 139 shallow and 110 drain. Strongest stretch: GitHub, 13:54 to 15:24, 90 minutes. Over allowance: YouTube Shorts by 34 minutes. What broke depth: YouTube videos to YouTube Shorts around 15:00, 2 times; Google Calendar to X timeline around 14:00, 7 times. Nudges shown: 4, accepted 4, snoozed 0, ignored 0, median time back 8.4 minutes. Against your 7-day average: -1.5 deep blocks, -21.5 drain minutes over allowance. Tomorrow, protect your first deep block before opening your usual Drain territories.

****Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)****

> You had 4 deep blocks today, the longest 90 minutes, totaling 261 minutes of focused work. You switched out of deep work 54 times, and it took an average of 9.3 minutes to return to a deep state. This is 1.5 fewer deep blocks than your recent average.
> 
> Your strongest stretch was in GitHub, from 13:54 to 15:24, lasting 90 minutes. Across your browser activity, you spent 290 minutes in Deep territories, 139 minutes in Shallow, and 110 minutes in Drain. Your drain over allowance was 21.5 minutes lower than your recent average.
> 
> Depth broke most often at 15:00, when you moved from YouTube videos to YouTube Shorts 2 times. At 14:00, you moved from Google Calendar to X timeline 7 times. YouTube Shorts went 34 minutes over your 15 minute allowance.
> 
> 4 nudges were shown. All 4 were accepted, with a median return time of 8.4 minutes.
> 
> Tomorrow, try to limit your time in YouTube videos during the 15:00 window. Use Google Calendar only for necessary administrative tasks.

**Teacher 31B (ceiling)**

> You had 4 deep blocks today, the longest 90 minutes, for a total of 261 minutes of depth. You switched out of deep work 54 times, and it took an average of 9.3 minutes to return to deep territory. This is 1.5 fewer deep blocks than your recent average.
> 
> Your strongest stretch took place in GitHub, from 13:54 to 15:24, lasting 90 minutes. Across your browser day, you spent 290 minutes in Deep, 139 minutes in Shallow, and 110 minutes in Drain. Your drain over allowance was 21.5 minutes lower than your recent average.
> 
> Depth was broken most often at 14:00 when you moved from Google Calendar to X timeline 7 times, and at 15:00 when you moved from YouTube videos to YouTube Shorts 2 times. YouTube Shorts ran 34 minutes over your 15 minute allowance.
> 
> 4 nudges were shown and all 4 were accepted, with a median return time of 8.4 minutes.
> 
> Tomorrow, try to limit your visits to X timeline during the 14:00 window. Use Google Calendar only for quick checks before starting your first deep block.

