# Territory naming: baseline vs fine-tuned model

| Persona | Baseline name | Model name | Label (model) | Ground truth | Why (model) |
|---|---|---|---|---|---|
| developer | app.slack.com · client | Slack team communication | shallow | shallow | Frequent switching between team channels and threads with a mean dwell of 16.9 seconds indicates routine coordination. |
| developer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 124 minutes on a calendar with a low items per minute rate indicates routine administrative coordination. |
| developer | developer.mozilla.org · en-US | MDN web API documentation reading | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.6 seconds indicate focused reading of technical documentation. |
| developer | docs.python.org · 3 | Python documentation and async study | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.7 seconds indicate focused reading of technical documentation. |
| developer | github.com · home | GitHub pull request and issue tracking | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 29.2 seconds indicates focused technical work. |
| developer | linear.app · team | Linear issue and sprint triage | shallow | shallow | The activity consists of managing issues and sprints with a mean dwell of 25.4 seconds per item. |
| developer | reddit.com · r | (baseline name kept) | drain | drain |  |
| developer | youtube.com · shorts | (baseline name kept) | drain | drain |  |
| developer | youtube.com · watch | Rust and design talks | deep | deep | A low velocity of 0.2 items per minute and a mean dwell of 33.7 seconds indicates sustained focus on technical content. |
| developer | x.com · home | X timeline and thread browsing | drain | drain | A mean dwell of 11.8 seconds and a 0.0 skip rate indicate rapid consumption of short-form content. |
| writer | app.slack.com · client | Slack team communication | shallow | shallow | Frequent switching between team channels and threads with a mean dwell of 17.6 seconds indicates routine coordination. |
| writer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 48 minutes on a calendar with a low skip rate of 0.0 indicates routine administrative coordination. |
| writer | docs.google.com · document | Writing and drafting documents | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 29.3 seconds indicates sustained focus. |
| writer | en.wikipedia.org · wiki | Wikipedia research and learning | deep | deep | A low 1.2 items per minute and a mean dwell of 28.9 seconds indicate focused reading and research. |
| writer | instagram.com · reels | Instagram reels consumption | drain | drain | A high velocity of 10.5 items per minute and a 0.46 skip rate indicates rapid consumption of short-form content. |
| writer | notion.so · home | Notion editorial calendar and invoicing | shallow | shallow | A low skip rate of 0.0 and a mean dwell of 25.8 seconds indicate routine administrative coordination. |
| writer | pinterest.com · home | (baseline name kept) | drain | drain |  |
| writer | reddit.com · r | (baseline name kept) | drain | drain |  |
| writer | theatlantic.com · ideas | Long form reading and writing | deep | deep | A low 1.3 items per minute and a mean dwell of 28.5 seconds indicate sustained focus on long-form content. |
| researcher | app.slack.com · client | Slack team communication | shallow | shallow | Frequent switching between team channels and threads with a mean dwell of 16.4 seconds indicates routine coordination. |
| researcher | arxiv.org · abs | Reading attention and representation learning papers | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.7 seconds indicate focused reading of academic research. |
| researcher | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 99 minutes on a calendar with a low items per minute rate indicates routine administrative coordination. |
| researcher | news.ycombinator.com · home | Hacker News feed browsing | drain | drain | A velocity of 5.6 items per minute with a 11.1 second mean dwell indicates rapid consumption of news and social feeds. |
| researcher | scholar.google.com · scholar | Google Scholar academic research | deep | deep | A low 1.3 items per minute and a mean dwell of 29.3 seconds indicate focused reading and writing. |
| researcher | overleaf.com · project | Academic writing and thesis research | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 27.7 seconds indicates focused work on a project. |
| researcher | youtube.com · home | (baseline name kept) | drain | drain |  |
| researcher | zotero.org · mylibrary | Zotero library management | shallow | shallow | The activity consists of managing unfiled items and a low 0.0 skip rate across a library. |
| researcher | x.com · home | X timeline and thread browsing | drain | drain | A mean dwell of 12.6 seconds and a 0.0 skip rate indicate rapid consumption of short-form content. |
| designer | app.slack.com · client | Slack team communication | shallow | shallow | Spending 78 minutes across team channels with a mean dwell of 16.0 seconds indicates routine coordination and messaging. |
| designer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 115 minutes on a calendar with a low items per minute rate indicates routine administrative coordination. |
| designer | dribbble.com · shots | Dribbble design inspiration browsing | drain | drain | A high velocity of 7.4 items per minute and a 0.33 skip rate indicates rapid consumption of visual shots. |
| designer | linear.app · team | Linear issue and sprint triage | shallow | shallow | The activity consists of managing issues and sprints with a mean dwell of 26.2 seconds per item. |
| designer | m3.material.io · components | Material Design component research | deep | deep | A low skip rate of 0.0 and a mean dwell of 29.3 seconds indicate focused study of design components. |
| designer | figma.com · design | Figma design work | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 28.4 seconds indicates sustained focus on design files. |
| designer | instagram.com · reels | (baseline name kept) | drain | drain |  |
| designer | tiktok.com · foryou | TikTok For You feed | drain | drain | A high velocity of 10.6 items per minute and a 0.44 skip rate indicates rapid consumption of short videos. |
| student | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 196 minutes on a calendar with a low items per minute rate indicates routine administrative coordination. |
| student | canvas.instructure.com · courses | Course administration and grading | shallow | shallow | A low velocity of 2.1 items per minute and a mean dwell of 25.6 seconds indicates routine administrative task management. |
| student | leetcode.com · problems | (baseline name kept) | deep | deep |  |
| student | web.whatsapp.com · home | WhatsApp messaging and chat | shallow | shallow | Spending 196 minutes with 4.0 items per minute indicates routine communication and coordination. |
| student | instagram.com · reels | Instagram reels consumption | drain | drain | A high velocity of 10.7 items per minute and a 0.45 skip rate indicates rapid consumption of short-form content. |
| student | khanacademy.org · math | Linear algebra study | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.4 seconds indicate focused learning of math concepts. |
| student | tiktok.com · foryou | (baseline name kept) | drain | drain |  |
| student | youtube.com · shorts | (baseline name kept) | drain | drain |  |
| student | youtube.com · watch | Computer science lectures | deep | deep | A low velocity of 0.2 items per minute and a mean dwell of 45.7 seconds indicates focused study. |
| freelancer | app.hubspot.com · contacts | HubSpot CRM contact management | shallow | shallow | Spending 132 minutes managing contacts with a mean dwell of 25.6 seconds indicates routine administrative coordination. |
| freelancer | app.slack.com · client | Slack team communication | shallow | shallow | Frequent switching between team channels and threads with a mean dwell of 16.4 seconds indicates routine coordination. |
| freelancer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | Spending 142 minutes on a calendar with a low items per minute rate indicates routine administrative coordination. |
| freelancer | docs.google.com · spreadsheets | Client forecasting and pricing models | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 28.8 seconds indicates sustained focus on complex spreadsheets. |
| freelancer | bbc.com · news | (baseline name kept) | drain | drain |  |
| freelancer | linkedin.com · feed | LinkedIn feed browsing | drain | drain | A velocity of 7.0 items per minute with a 0.0 skip rate indicates rapid consumption of feed posts. |
| freelancer | notion.so · home | Notion client proposal and workshop drafting | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 27.7 seconds indicates focused work. |
| freelancer | x.com · home | (baseline name kept) | drain | drain |  |

Named by the model: 42 of 53. Suggested label equals the persona's ground truth for 42 of 42 model-named territories.
