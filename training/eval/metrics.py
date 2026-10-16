"""Automatic metrics (PDD 10.4), reusing T1's validators."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from validators import check_autopsy, parse_naming  # noqa: E402

GROUNDING = {"ungrounded_number", "ungrounded_clock", "percentage", "spelled_number", "unknown_territory"}
STRUCTURE = {"missing_headline_blocks", "missing_headline_residue", "missing_strongest_stretch",
             "missing_triggers", "missing_suggestion"}


# --------------------------------------------------------------------------- strict (eval-only)
# T1's validators ground every *number*, but a number can be real and still be attached to the wrong
# thing. These checks catch the semantic slips seen in the T2 review (swapped nudge counts, wrong sign
# on the 7-day change, an allowance claim with none, an invented trigger pair). Eval-only: T1's
# validators are the contract M6 ports; these are candidates for that port.

_STATES = ("accepted", "snoozed", "ignored")


def strict_autopsy_errors(text: str, facts: dict) -> list[str]:
    errs: list[str] = []
    t = text
    nud = facts["nudges"]
    for m in re.finditer(r"\b(\d+) (?:nudges? )?(?:was|were) (accepted|snoozed|ignored)\b", t, re.I):
        if int(m.group(1)) != nud[m.group(2).lower()]:
            errs.append("nudge_count_wrong")
    for m in re.finditer(r"\bnudge (?:was|got) (accepted|snoozed|ignored)\b", t, re.I):
        if nud[m.group(1).lower()] == 0:
            errs.append("nudge_state_wrong")
    v = facts["vs7Day"]
    if v is not None:
        for m in re.finditer(r"\b(\d+(?:\.\d+)?) (more|fewer) deep blocks?\b", t, re.I):
            if (m.group(2).lower() == "more") != (v["deepBlocksDelta"] > 0):
                errs.append("delta_sign_wrong")
        for m in re.finditer(r"\bdrain over allowance was (up|down)\b", t, re.I):
            if (m.group(1).lower() == "up") != (v["drainOverDelta"] > 0):
                errs.append("delta_sign_wrong")
    if not facts["drainOverAllowance"] and re.search(
            r"\b(exceeded|ran over|went over|over) (your|the) (\d+ minute )?allowance|\d+ minutes over\b", t, re.I):
        errs.append("claims_over_allowance")
    pairs = {(x["fromTerritory"].lower(), x["toTerritory"].lower()) for x in facts["topTriggers"]}
    for m in re.finditer(r"\b(?:moved|switched|going) from (.+?) to (.+?)(?:\s+\d+ times?|[.,]|\s+(?:at|in|during)\b)", t, re.I):
        if (m.group(1).strip().lower(), m.group(2).strip().lower()) not in pairs:
            errs.append("invented_trigger")
    return sorted(set(errs))


def naming_row(text: str, desc: dict, label: str | None) -> dict:
    obj, errs = parse_naming(text, desc, label)
    valid = obj is not None
    return {
        "valid_json": valid,
        "grounded": valid and "ungrounded_number" not in errs,
        "outside_browser": "outside_browser" in errs,
        "label_correct": bool(valid and obj["suggested_label"] == label),
        "clean": valid and not (set(errs) - {"label_mismatch"}),
        "errors": errs,
    }


def autopsy_row(text: str, facts: dict) -> dict:
    errs = check_autopsy(text, facts)
    e = set(errs)
    return {
        "valid_json": True,
        "length_ok": "word_count" not in e and "empty" not in e,
        "plain_text": "markdown" not in e and "empty" not in e,
        "grounded": not (e & GROUNDING),
        "outside_browser": "outside_browser" in e,
        "structure_ok": not (e & STRUCTURE),
        "clean": not errs,
        "strict_clean": not errs and not strict_autopsy_errors(text, facts),
        "errors": errs,
        "strict_errors": strict_autopsy_errors(text, facts),
        "words": len(text.split()),
    }


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    if not n:
        return {"n": 0}
    keys = [k for k in rows[0] if isinstance(rows[0][k], bool)]
    out = {"n": n, **{k: round(sum(r[k] for r in rows) / n, 3) for k in keys}}
    if "words" in rows[0]:
        out["words_mean"] = round(mean(r["words"] for r in rows), 1)
    return out


def load_eval(path: Path) -> list[dict]:
    items = []
    for line in path.read_text().splitlines():
        d = json.loads(line)
        user = d["messages"][0]["content"]
        inp = json.loads(user.split("\n\n", 1)[1])
        items.append({"id": d["id"], "task": d["task"], "persona": d["persona"], "meta": d["meta"],
                      "input": inp, "prompt": user, "teacher": d["messages"][1]["content"]})
    return items
