"""Baselines for the evaluation (PDD 9.10): baseline names and the template autopsy.

The template rendering is the deterministic fallback M5 ships when the model's output fails validation;
here it is the baseline the fine-tuned 270M has to beat.
"""
from __future__ import annotations

from urllib.parse import urlparse


def baseline_name(desc: dict) -> str:
    """'<top origin> · <top topic>', or '<top origin> · <top path segment>' without topic tags."""
    top = max(desc["origins"], key=lambda o: o["count"])
    host = urlparse(top["origin"]).netloc.removeprefix("www.")
    tags = desc.get("topicTags") or []
    if tags:
        extra = max(tags, key=lambda t: t["score"])["tag"]
    else:
        segs = [s for s in top["pathPrefix"].split("/") if s]
        extra = segs[0] if segs else ""
    return f"{host} · {extra}" if extra else host


def _plural(n, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def template_autopsy(f: dict) -> str:
    db, res, tot = f["deepBlocks"], f["residue"], f["totalsMin"]
    out = []
    if db["count"] == 0:
        out.append("No deep blocks today.")
    else:
        out.append(f"{_plural(db['count'], 'deep block')} today, the longest {db['longestMin']} minutes, "
                   f"{db['totalMin']} minutes in total.")
    back = f", and it took {res['meanMinBackToDeep']} minutes on average to get back" \
        if res["meanMinBackToDeep"] is not None else ""
    out.append(f"{_plural(res['switchesOutOfDeep'], 'switch')} out of deep work{back}.")
    out.append(f"Your browser time was {tot['deep']} minutes deep, {tot['shallow']} shallow and {tot['drain']} drain.")
    s = f["strongestStretch"]
    if s:
        out.append(f"Strongest stretch: {s['territory']}, {s['start']} to {s['end']}, {s['minutes']} minutes.")
    over = f["drainOverAllowance"]
    if over:
        out.append("Over allowance: " + ", ".join(
            f"{o['territory']} by {o['minutesOver']} minutes" for o in over) + ".")
    if f["topTriggers"]:
        out.append("What broke depth: " + "; ".join(
            f"{t['fromTerritory']} to {t['toTerritory']} around {t['hour']:02d}:00, {_plural(t['count'], 'time')}"
            for t in f["topTriggers"]) + ".")
    n = f["nudges"]
    if n["shown"]:
        ret = f", median time back {n['medianReturnMin']} minutes" if n["medianReturnMin"] is not None else ""
        out.append(f"Nudges shown: {n['shown']}, accepted {n['accepted']}, snoozed {n['snoozed']}, "
                   f"ignored {n['ignored']}{ret}.")
    else:
        out.append("No nudges were shown.")
    v = f["vs7Day"]
    if v:
        out.append(f"Against your 7-day average: {v['deepBlocksDelta']:+} deep blocks, "
                   f"{v['drainOverDelta']:+} drain minutes over allowance.")
    out.append("Tomorrow, protect your first deep block before opening your usual Drain territories.")
    return " ".join(out)
