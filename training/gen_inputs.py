"""Synthetic teacher inputs from shared/personas.json (PDD 10.2).

Produces territory descriptions (naming task) and daily facts (autopsy task), both validated
against the shared JSON Schemas. Seeded and deterministic.

    uv run python -m gen_inputs --naming 5 --autopsy 5 --seed 1 --out data/pilot/inputs
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from common import AUTOPSY, DATA, NAMING, append_jsonl, load_personas, schema_validator

HOSTS = {
    "github.com": "GitHub", "www.youtube.com": "YouTube", "x.com": "X", "twitter.com": "X",
    "www.instagram.com": "Instagram", "www.reddit.com": "Reddit", "www.tiktok.com": "TikTok",
    "app.slack.com": "Slack", "linear.app": "Linear", "calendar.google.com": "Google Calendar",
    "developer.mozilla.org": "MDN", "docs.python.org": "Python docs", "news.ycombinator.com": "Hacker News",
    "docs.google.com": "Google Docs", "www.notion.so": "Notion", "www.figma.com": "Figma",
    "scholar.google.com": "Google Scholar", "arxiv.org": "arXiv", "www.linkedin.com": "LinkedIn",
    "www.facebook.com": "Facebook", "stackoverflow.com": "Stack Overflow",
}
SEGMENT_WORDS = {"watch": "videos", "client": "", "home": "feed", "en-US": "", "docs": "docs", "3": ""}

TOPIC_TAGS = {
    "deep": ["programming tutorial", "documentation", "conference talk", "research paper", "long-form writing"],
    "shallow": ["team chat", "calendar", "task tracker", "admin"],
    "drain": ["memes", "short comedy clips", "political commentary", "celebrity news", "cooking videos", "gym workouts"],
}
ALLOWANCES = [10, 15, 15, 15, 20, 30]


def pretty_host(origin: str) -> str:
    host = origin.split("://", 1)[1]
    if host in HOSTS:
        return HOSTS[host]
    parts = host.split(".")
    core = parts[-2] if len(parts) >= 2 else parts[0]
    return core.capitalize()


SITE_NAMES = {
    ("https://app.hubspot.com", "/contacts"): "HubSpot contacts",
    ("https://app.slack.com", "/client"): "Slack",
    ("https://arxiv.org", "/abs"): "arXiv papers",
    ("https://calendar.google.com", "/calendar"): "Google Calendar",
    ("https://canvas.instructure.com", "/courses"): "Canvas courses",
    ("https://developer.mozilla.org", "/en-US/docs"): "MDN docs",
    ("https://docs.google.com", "/document"): "Google Docs",
    ("https://docs.google.com", "/spreadsheets"): "Google Sheets",
    ("https://docs.python.org", "/3"): "Python docs",
    ("https://dribbble.com", "/shots"): "Dribbble shots",
    ("https://en.wikipedia.org", "/wiki"): "Wikipedia",
    ("https://github.com", "/"): "GitHub",
    ("https://leetcode.com", "/problems"): "LeetCode problems",
    ("https://linear.app", "/team"): "Linear",
    ("https://m3.material.io", "/components"): "Material Design components",
    ("https://news.ycombinator.com", "/"): "Hacker News",
    ("https://scholar.google.com", "/scholar"): "Google Scholar",
    ("https://web.whatsapp.com", "/"): "WhatsApp Web",
    ("https://www.bbc.com", "/news"): "BBC News",
    ("https://www.figma.com", "/design"): "Figma design files",
    ("https://www.instagram.com", "/reels"): "Instagram Reels",
    ("https://www.khanacademy.org", "/math"): "Khan Academy math",
    ("https://www.linkedin.com", "/feed"): "LinkedIn feed",
    ("https://www.notion.so", "/"): "Notion",
    ("https://www.overleaf.com", "/project"): "Overleaf projects",
    ("https://www.pinterest.com", "/"): "Pinterest",
    ("https://www.reddit.com", "/r/all"): "Reddit front page",
    ("https://www.theatlantic.com", "/ideas"): "The Atlantic essays",
    ("https://www.tiktok.com", "/foryou"): "TikTok For You",
    ("https://www.youtube.com", "/"): "YouTube home",
    ("https://www.youtube.com", "/shorts"): "YouTube Shorts",
    ("https://www.youtube.com", "/watch"): "YouTube videos",
    ("https://www.zotero.org", "/mylibrary"): "Zotero library",
    ("https://x.com", "/home"): "X timeline",
}


def territory_name(site: dict) -> str:
    known = SITE_NAMES.get((site["origin"], site["pathPrefix"]))
    if known:
        return known
    seg = [s for s in site["pathPrefix"].split("/") if s]
    word = ""
    if seg:
        last = seg[-1]
        word = SEGMENT_WORDS.get(last, last.replace("-", " "))
    return " ".join(x for x in (pretty_host(site["origin"]), word) if x)


def _rng_range(rng: random.Random, pair, ndigits=1) -> float:
    return round(rng.uniform(pair[0], pair[1]), ndigits)


def _validate(kind: str, obj: dict) -> None:
    errs = [e.message for e in schema_validator(kind).iter_errors(obj)]
    if errs:
        raise ValueError(f"{kind} schema errors: {errs[:3]}")


# --------------------------------------------------------------------------- naming

def make_description(rng: random.Random, persona: dict, label: str | None = None, tag: str | None = None):
    label = label or rng.choice(["deep", "shallow", "drain", "drain", "deep", "shallow"])
    sites = persona["sites"][label]
    main = rng.choice(sites)
    edge = tag or rng.choice(
        ["pure", "pure", "mixed-origin", "no-titles", "with-tags", "single-origin", "with-tags"]
    )

    total = rng.randint(30, 700)
    counts_share = [0.6, 0.25, 0.1, 0.05]
    origins = [{"origin": main["origin"], "pathPrefix": main["pathPrefix"]}]
    if edge not in ("single-origin",):
        others = [s for s in sites if s is not main]
        rng.shuffle(others)
        extra = others[: rng.randint(0, 2)]
        if edge == "mixed-origin":
            other_label = rng.choice([l for l in persona["sites"] if l != label])
            extra.append(rng.choice(persona["sites"][other_label]))
        for s in extra:
            if all(o["origin"] != s["origin"] or o["pathPrefix"] != s["pathPrefix"] for o in origins):
                origins.append({"origin": s["origin"], "pathPrefix": s["pathPrefix"]})
    origins = origins[:4]
    out_origins = []
    for i, o in enumerate(origins):
        c = max(1, int(total * counts_share[i] * rng.uniform(0.7, 1.3)))
        out_origins.append({"origin": o["origin"], "pathPrefix": o["pathPrefix"], "count": c})
    out_origins.sort(key=lambda x: -x["count"])

    titles: list[str] = []
    if edge != "no-titles":
        pool = list(main["sampleTitles"])
        for s in sites:
            if s is not main and any(o["origin"] == s["origin"] for o in out_origins):
                pool += s["sampleTitles"]
        rng.shuffle(pool)
        titles = pool[: rng.randint(1, 5)]

    tags: list[dict] = []
    if edge == "with-tags":
        pool = TOPIC_TAGS[label][:]
        rng.shuffle(pool)
        scores = sorted((round(rng.uniform(0.28, 0.72), 2) for _ in range(3)), reverse=True)
        tags = [{"tag": t, "score": s} for t, s in zip(pool[: rng.randint(1, 3)], scores)]

    v = main["velocity"]
    desc = {
        "origins": out_origins,
        "sampleTitles": titles,
        "topicTags": tags,
        "velocity": {
            "itemsPerMin": _rng_range(rng, v["itemsPerMin"]),
            "skipRate": _rng_range(rng, v["skipRate"], 2),
            "meanDwellS": _rng_range(rng, v["meanDwellS"]),
        },
        "minutesToday": rng.randint(2, 140),
    }
    _validate("territory-description", desc)
    return desc, {"label": label, "edge": edge, "mainSite": territory_name(main)}


# --------------------------------------------------------------------------- facts

def _clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def make_facts(rng: random.Random, persona: dict, date: str, edge: str | None = None):
    edge = edge or rng.choice(
        ["typical", "typical", "typical", "zero-deep", "great-day", "drain-heavy", "no-nudges",
         "new-user", "single-long-block"]
    )
    shape = persona["dayShape"]
    deep_sites = [territory_name(s) for s in persona["sites"]["deep"]]
    shallow_sites = [territory_name(s) for s in persona["sites"]["shallow"]]
    drain_sites = [territory_name(s) for s in persona["sites"]["drain"]]

    lo, hi = shape["deepBlocks"]
    n_blocks = {
        "zero-deep": 0, "single-long-block": 1, "great-day": min(6, hi + 2),
    }.get(edge, rng.randint(max(lo, 1), hi))
    start_h, end_h = (int(persona["workHours"][k][:2]) for k in ("start", "end"))
    cursor = start_h * 60 + rng.randint(0, 45)
    blocks = []
    for _ in range(n_blocks):
        if edge == "single-long-block":
            minutes = rng.randint(max(shape["deepBlockMinutes"][1], 90), 140)
        else:
            minutes = rng.randint(*shape["deepBlockMinutes"])
        minutes = max(25, minutes)
        if cursor + minutes > 23 * 60:
            break
        blocks.append({
            "start": _clock(cursor), "end": _clock(cursor + minutes), "minutes": minutes,
            "territory": rng.choice(deep_sites),
        })
        cursor += minutes + rng.randint(25, 120)
    longest = max((b["minutes"] for b in blocks), default=0)
    block_total = sum(b["minutes"] for b in blocks)

    deep_total = block_total + rng.randint(0, 45) if blocks else rng.randint(0, 20)
    shallow_total = rng.randint(15, 140)
    if edge == "drain-heavy":
        drain_total = rng.randint(max(shape["drainMinutes"][1], 70), 160)
    elif edge == "great-day":
        drain_total = rng.randint(0, 12)
    else:
        drain_total = rng.randint(*shape["drainMinutes"])
        drain_total = min(drain_total, 100)

    # drain over allowance
    over = []
    if drain_total > 10:
        names = drain_sites[:]
        rng.shuffle(names)
        remaining = drain_total
        for name in names[: rng.randint(1, min(2, len(names)))]:
            allowance = rng.choice(ALLOWANCES)
            spent = min(remaining, max(allowance + 1, int(drain_total * rng.uniform(0.4, 0.8))))
            remaining -= spent
            if spent > allowance:
                over.append({"territory": name, "allowanceMin": allowance, "minutesOver": spent - allowance})
    if edge == "great-day":
        over = []

    # residue
    # switches out of Deep scale with how much Deep time there was
    top = min(18 if edge == "great-day" else 55, deep_total // 4 + 2)
    switches = 0 if deep_total == 0 else rng.randint(min(max(1, deep_total // 20), top), top)
    mean_back = None if switches == 0 else round(rng.uniform(0.8, 11.0), 1)

    # triggers
    triggers = []
    if blocks or deep_total > 0:
        for tr in persona["spiralTriggers"]:
            to_site = next(
                (s for s in persona["sites"]["drain"] + persona["sites"]["shallow"]
                 if s["origin"] == tr["toOrigin"] and s["pathPrefix"] == tr["toPathPrefix"]), None)
            if to_site is None or rng.random() < 0.25:
                continue
            from_label = tr["afterLabel"]
            from_name = rng.choice([territory_name(s) for s in persona["sites"][from_label]])
            triggers.append({
                "fromTerritory": from_name, "toTerritory": territory_name(to_site),
                "hour": rng.choice(tr["hours"]), "count": rng.randint(1, 7),
            })
        triggers = triggers[:5]
    if edge == "great-day":
        triggers = triggers[:1]

    # strongest stretch
    stretch = None
    if blocks:
        best = max(blocks, key=lambda b: b["minutes"])
        stretch = {"territory": best["territory"], "start": best["start"], "end": best["end"],
                   "minutes": best["minutes"]}
    elif deep_total > 0:
        s = rng.randint(max(1, min(deep_total, 8)), min(24, max(deep_total, 8)))
        st = start_h * 60 + rng.randint(30, 240)
        stretch = {"territory": rng.choice(deep_sites), "start": _clock(st), "end": _clock(st + s),
                   "minutes": s}

    # nudges
    if edge in ("no-nudges", "great-day") and rng.random() < 0.7:
        shown = 0
    else:
        shown = rng.randint(1, 9)
    accepted = rng.randint(0, shown)
    snoozed = rng.randint(0, shown - accepted)
    ignored = shown - accepted - snoozed
    nudges = {
        "shown": shown, "accepted": accepted, "snoozed": snoozed, "ignored": ignored,
        "medianReturnMin": round(rng.uniform(1.0, 9.0), 1) if accepted else None,
    }

    vs = None
    if edge != "new-user" and rng.random() > 0.3:
        vs = {"deepBlocksDelta": round(rng.choice([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]), 1),
              "drainOverDelta": round(rng.uniform(-30, 30), 1)}

    facts = {
        "date": date,
        "deepBlocks": {"count": len(blocks), "longestMin": longest, "totalMin": block_total, "blocks": blocks},
        "residue": {"switchesOutOfDeep": switches, "meanMinBackToDeep": mean_back},
        "totalsMin": {"deep": deep_total, "shallow": shallow_total, "drain": drain_total},
        "drainOverAllowance": over,
        "topTriggers": triggers,
        "strongestStretch": stretch,
        "nudges": nudges,
        "vs7Day": vs,
    }
    _validate("daily-facts", facts)
    check_facts_consistency(facts)
    return facts, {"edge": edge}


def check_facts_consistency(f: dict) -> None:
    b = f["deepBlocks"]
    assert b["count"] == len(b["blocks"]), "count"
    assert b["longestMin"] == max((x["minutes"] for x in b["blocks"]), default=0), "longest"
    assert b["totalMin"] == sum(x["minutes"] for x in b["blocks"]), "total"
    assert f["totalsMin"]["deep"] >= b["totalMin"], "deep total"
    n = f["nudges"]
    assert n["accepted"] + n["snoozed"] + n["ignored"] == n["shown"], "nudges"
    assert (n["medianReturnMin"] is None) == (n["accepted"] == 0), "median return"
    for o in f["drainOverAllowance"]:
        assert o["minutesOver"] <= f["totalsMin"]["drain"], "over"
    if b["count"]:
        s = f["strongestStretch"]
        assert s and s["minutes"] >= b["longestMin"], "stretch"
    for x in b["blocks"]:
        h1, m1 = map(int, x["start"].split(":"))
        h2, m2 = map(int, x["end"].split(":"))
        assert (h2 * 60 + m2) - (h1 * 60 + m1) == x["minutes"], "block span"


# --------------------------------------------------------------------------- CLI

def generate(task: str, count: int, seed: int) -> list[dict]:
    rng = random.Random(f"{task}:{seed}")
    personas = load_personas()
    out, seen = [], set()
    attempts = 0
    while len(out) < count and attempts < count * 20:
        attempts += 1
        persona = personas[len(out) % len(personas)] if count <= len(personas) * 2 else rng.choice(personas)
        if task == NAMING:
            obj, meta = make_description(rng, persona)
        else:
            date = f"2026-{rng.randint(9, 10):02d}-{rng.randint(1, 28):02d}"
            obj, meta = make_facts(rng, persona, date)
        key = repr(obj)
        if key in seen:
            continue
        seen.add(key)
        out.append({"id": f"{task}-{seed}-{len(out):04d}", "task": task, "persona": persona["id"],
                    "input": obj, "meta": meta})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--naming", type=int, default=0)
    ap.add_argument("--autopsy", type=int, default=0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", type=Path, default=DATA / "inputs")
    args = ap.parse_args()
    for task, n in ((NAMING, args.naming), (AUTOPSY, args.autopsy)):
        if not n:
            continue
        path = args.out / f"{task}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("")
        for rec in generate(task, n, args.seed):
            append_jsonl(path, rec)
        print(f"wrote {n} {task} inputs to {path}")


if __name__ == "__main__":
    main()
