# Territory naming: baseline vs fine-tuned model

| Persona | Baseline name | Model name | Label (model) | Ground truth | Why (model) |
|---|---|---|---|---|---|
| developer | app.slack.com · client | Slack team communication | shallow | shallow | Activity consists of 40 interactions across team channels and help threads with a mean dwell of 16.9 seconds per item. |
| developer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a mean dwell of 25.5 seconds per item. |
| developer | developer.mozilla.org · en-US | MDN Web API documentation and indexing | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.6 seconds indicate focused reading of technical documentation. |
| developer | docs.python.org · 3 | Python async and type checking | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.7 seconds indicate focused study of documentation. |
| developer | github.com · home | GitHub code review and issue tracking | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 29.2 seconds indicates focused technical analysis. |
| developer | linear.app · team | Linear issue and sprint triage | shallow | shallow | Activity consists of managing issues and sprints with a mean dwell of 25.4 seconds per item. |
| developer | reddit.com · r | (fell back) | drain | drain |  |
| developer | youtube.com · shorts | (fell back) | drain | drain |  |
| developer | youtube.com · watch | Rust technical talk and design study | deep | deep | A low velocity of 0.2 items per minute and a mean dwell of 33.7 seconds indicates focused engagement with technical content. |
| developer | x.com · home | X timeline and thread browsing | drain | drain | Spending 20 minutes viewing 5.5 items per minute indicates a pattern of continuous consumption of social media feeds. |
| writer | app.slack.com · client | Slack team communication | shallow | shallow | Activity consists of 40 interactions across team channels and help threads with a mean dwell of 17.6 seconds per item. |
| writer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a mean dwell of 25.0 seconds per item. |
| writer | docs.google.com · document | Writing and drafting documents | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 29.3 seconds indicates sustained focus. |
| writer | en.wikipedia.org · wiki | Wikipedia research and attention studies | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.9 seconds indicate focused reading of long-form articles. |
| writer | instagram.com · reels | Instagram reels consumption | drain | drain | A high velocity of 10.5 items per minute and a 0.46 skip rate indicates rapid, passive consumption of short videos. |
| writer | notion.so · home | Notion editorial calendar and invoicing | shallow | shallow | The activity consists of managing invoices and scheduling with a low velocity of 2.0 items per minute. |
| writer | pinterest.com · home | (fell back) | drain | drain |  |
| writer | reddit.com · r | (fell back) | drain | drain |  |
| writer | theatlantic.com · ideas | Reading long form essays | deep | deep | A low skip rate of 0.0 and mean dwell of 28.5 seconds indicate focused reading of long form texts. |
| researcher | app.slack.com · client | Slack team communication | shallow | shallow | Activity consists of 40 interactions across team channels and help threads with a mean dwell of 16.4 seconds per item. |
| researcher | arxiv.org · abs | Reading academic research papers | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.7 seconds indicate focused reading of long-form content. |
| researcher | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a low velocity of 2.0 items per minute. |
| researcher | news.ycombinator.com · home | Hacker News feed browsing | drain | drain | A velocity of 5.6 items per minute with a 11.1 second mean dwell indicates rapid consumption of news and social feeds. |
| researcher | scholar.google.com · scholar | Academic research and scholarly reading | deep | deep | A low skip rate of 0.0 and a mean dwell of 29.3 seconds indicate focused reading of academic papers. |
| researcher | overleaf.com · project | Academic writing and thesis research | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 27.7 seconds indicates focused study of academic papers. |
| researcher | youtube.com · home | (fell back) | drain | drain |  |
| researcher | zotero.org · mylibrary | Zotero library management | shallow | shallow | The activity consists of managing unfiled items and library pages with a mean dwell of 25.9 seconds per page. |
| researcher | x.com · home | X timeline and thread browsing | drain | drain | Spending 28 minutes viewing 5.2 items per minute indicates a pattern of continuous consumption of social media feeds. |
| designer | app.slack.com · client | Slack team communication | shallow | shallow | Spending 78 minutes across team channels and threads indicates routine coordination and administrative communication. |
| designer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a mean dwell of 25.5 seconds per item. |
| designer | dribbble.com · shots | Dribbble design inspiration browsing | drain | drain | A high velocity of 7.4 items per minute and a 0.33 skip rate indicates rapid consumption of visual content. |
| designer | linear.app · team | Linear issue and sprint triage | shallow | shallow | Activity consists of managing issues and sprints with a mean dwell of 26.2 seconds per item. |
| designer | m3.material.io · components | Material Design component research | deep | deep | A low skip rate of 0.0 and a mean dwell of 29.3 seconds indicate focused study of design documentation. |
| designer | figma.com · design | Figma design system work | deep | deep | A low velocity of 0.6 items per minute and a mean dwell of 28.4 seconds indicates sustained focus on design files. |
| designer | instagram.com · reels | (fell back) | drain | drain |  |
| designer | tiktok.com · foryou | TikTok For You feed | drain | drain | A velocity of 10.6 items per minute with a 0.44 skip rate indicates rapid consumption of short videos. |
| student | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a mean dwell of 25.5 seconds per item. |
| student | canvas.instructure.com · courses | Course administration and grades | shallow | shallow | A low velocity of 2.1 items per minute and a mean dwell of 25.6 seconds indicates routine administrative task management. |
| student | leetcode.com · problems | (fell back) | deep | deep |  |
| student | web.whatsapp.com · home | WhatsApp messaging and chat | shallow | shallow | Spending 196 minutes with 4.0 items per minute indicates routine communication and coordination. |
| student | instagram.com · reels | Instagram reels consumption | drain | drain | A high velocity of 10.6 items per minute and a 0.44 skip rate indicates rapid, passive consumption of short videos. |
| student | khanacademy.org · math | Linear algebra study | deep | deep | A low skip rate of 0.0 and a mean dwell of 28.4 seconds indicate focused study of math topics. |
| student | tiktok.com · foryou | (fell back) | drain | drain |  |
| student | youtube.com · shorts | (fell back) | drain | drain |  |
| student | youtube.com · watch | MIT computer science lecture | deep | deep | A low velocity of 0.2 items per minute and a mean dwell of 45.7 seconds indicates sustained focus on a single video. |
| freelancer | app.hubspot.com · contacts | HubSpot CRM contact management | shallow | shallow | Spending 132 minutes with 2.1 items per minute indicates routine administrative task management. |
| freelancer | app.slack.com · client | Slack team communication | shallow | shallow | Activity consists of 40 interactions across team channels and help threads with a mean dwell of 16.4 seconds per item. |
| freelancer | calendar.google.com · calendar | Google Calendar scheduling | shallow | shallow | The activity consists of managing a calendar with a mean dwell of 25.6 seconds per item. |
| freelancer | docs.google.com · spreadsheets | Client forecasting and pricing models | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 28.8 seconds indicates sustained focus on spreadsheets. |
| freelancer | bbc.com · news | (fell back) | drain | drain |  |
| freelancer | linkedin.com · feed | LinkedIn feed browsing | drain | drain | A velocity of 7.0 items per minute with a 0.0 skip rate indicates rapid consumption of feed posts. |
| freelancer | notion.so · home | Client proposal and workshop planning | deep | deep | A low velocity of 0.5 items per minute and a mean dwell of 27.7 seconds indicates focused work. |
| freelancer | x.com · home | (fell back) | drain | drain |  |

Named by the model: 42 of 53. Suggested label equals the persona's ground truth for 42 of 42 model-named territories.
