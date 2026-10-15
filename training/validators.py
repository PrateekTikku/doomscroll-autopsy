"""Validators for teacher outputs (PDD 9.4, 9.8, 10.2). Pure functions, no I/O.

Shared by T1 (filtering), T2 (evaluation) and ported to TypeScript in M6.
Each check returns a list of error codes; an empty list means the output passes.
"""

from __future__ import annotations

import json
import re

from common import schema_validator

AUTOPSY_MIN_WORDS = 120
AUTOPSY_MAX_WORDS = 180
# Numbers that are product constants (deep block = 25 min, interruption = 2 min), allowed anywhere.
CONSTANT_NUMBERS = {"25", "2"}

# Phrases that talk about time outside the browser (D-45). Territory names are stripped first.
OUTSIDE_BROWSER = re.compile(
    r"\b(offline|off[- ]?screen|off the (screen|browser|computer)|away from (the |your )?"
    r"(keyboard|screen|computer|browser|desk)|time away|while (you were )?away|"
    r"outside (of )?(the |your )?(browser|chrome|computer)|phone|smartphone|mobile|tablet|"
    r"other apps?|desktop apps?|in person|commut\w*|meetings?|lunch|dinner|sleep\w*|"
    r"touch grass|go outside|take a walk|walk\b|exercis\w*|gym)\b",
    re.IGNORECASE,
)

# Coach voice (PDD 4.2): calm, factual, non-judgemental.
BANNED_TONE = re.compile(
    r"\b(lazy|laziness|wasted?|waste of|failure|failed|pathetic|addict\w*|guilt\w*|shame\w*|"
    r"terrible|awful|bad day|you should have|you must|stupid|disappoint\w*|worthless)\b",
    re.IGNORECASE,
)

SEVEN_DAY = re.compile(r"\b(7[- ]day|seven[- ]day|weekly average|last week|past week|than usual|"
                       r"compared (to|with) (your|the) (usual|average|typical))\b", re.IGNORECASE)
SPELLED_NUMBER = re.compile(
    r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|"
    r"sixty|hundred)\b", re.IGNORECASE)
MARKDOWN = re.compile(r"(^\s*[-*•]\s)|(^\s*#{1,6}\s)|(\*\*)|(^\s*\d+\.\s)", re.MULTILINE)
CLOCK = re.compile(r"\b\d{1,2}:\d{2}\b")
NUMBER = re.compile(r"\d+(?:\.\d+)?")


# --------------------------------------------------------------------------- helpers

def strip_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```$", t, re.DOTALL)
    return m.group(1).strip() if m else t


def numbers_in(obj) -> set[str]:
    """Every number (as written) found in a JSON-like object, including inside strings."""
    out: set[str] = set()

    def walk(v):
        if isinstance(v, bool) or v is None:
            return
        if isinstance(v, (int, float)):
            out.add(_num_str(abs(v)))  # deltas are written as magnitudes ("1 fewer"); sign is not graded
        elif isinstance(v, str):
            # clocks and dates are graded as wholes, so their digits don't count as free numbers
            stripped = re.sub(r"\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b", " ", v)
            out.update(norm_num(n) for n in NUMBER.findall(stripped))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(obj)
    return out


def _num_str(v) -> str:
    return norm_num(str(v))


def norm_num(s: str) -> str:
    """Normalise a numeric token so 49, 49.0 and 49.00 compare equal."""
    try:
        f = float(s)
    except ValueError:
        return s
    return str(int(f)) if f.is_integer() else repr(round(f, 6))


def _fact_clocks(facts: dict) -> set[str]:
    clocks: set[str] = set()

    def walk(v):
        if isinstance(v, str) and re.fullmatch(r"\d{2}:\d{2}", v):
            clocks.add(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(facts)
    for t in facts.get("topTriggers", []):
        clocks.add(f"{t['hour']:02d}:00")
    return clocks


def territory_names(facts: dict) -> set[str]:
    names: set[str] = set()
    for b in facts["deepBlocks"]["blocks"]:
        names.add(b["territory"])
    for d in facts["drainOverAllowance"]:
        names.add(d["territory"])
    for t in facts["topTriggers"]:
        names.add(t["fromTerritory"])
        names.add(t["toTerritory"])
    if facts["strongestStretch"]:
        names.add(facts["strongestStretch"]["territory"])
    return names


def _remove_names(text: str, names: set[str]) -> str:
    for n in sorted(names, key=len, reverse=True):
        text = re.sub(re.escape(n), " ", text, flags=re.IGNORECASE)
    return text


# --------------------------------------------------------------------------- naming

def parse_naming(text: str, description: dict, expected_label: str | None = None):
    """Validate a naming output. Returns (canonical_obj_or_None, errors)."""
    errors: list[str] = []
    raw = strip_fences(text)
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None, ["bad_json"]
    if not isinstance(obj, dict):
        return None, ["bad_json"]
    errs = list(schema_validator("naming-output").iter_errors(obj))
    if errs:
        return None, ["schema"]
    # canonical key order
    obj = {"name": obj["name"], "suggested_label": obj["suggested_label"], "why": obj["why"]}

    allowed = numbers_in(description)
    for field in ("name", "why"):
        if {norm_num(n) for n in NUMBER.findall(obj[field])} - allowed:
            errors.append("ungrounded_number")
            break
    if re.search(r"://|/", obj["name"]):
        errors.append("name_is_url")
    if re.search(r"ground[- ]?truth|i was told|hint|as instructed|provided label", obj["why"], re.I):
        errors.append("hint_leak")
    if OUTSIDE_BROWSER.search(obj["name"] + " " + obj["why"]):
        errors.append("outside_browser")
    if BANNED_TONE.search(obj["name"] + " " + obj["why"]):
        errors.append("tone")
    if expected_label and obj["suggested_label"] != expected_label:
        errors.append("label_mismatch")
    return obj, errors


# --------------------------------------------------------------------------- autopsy

def check_autopsy(text: str, facts: dict) -> list[str]:
    errors: list[str] = []
    t = text.strip()
    if not t:
        return ["empty"]
    if MARKDOWN.search(t) or "```" in t:
        errors.append("markdown")

    words = len(t.split())
    if words < AUTOPSY_MIN_WORDS or words > AUTOPSY_MAX_WORDS:
        errors.append("word_count")

    names = territory_names(facts)
    plain = _remove_names(t, names)
    if facts["vs7Day"] is not None:
        plain = re.sub(r"\b7[- ]day\b", " ", plain, flags=re.IGNORECASE)  # the phrase, not a number

    # number grounding
    # the date's digits are not allowed: the autopsy has no reason to quote them
    allowed_nums = numbers_in({k: v for k, v in facts.items() if k != "date"}) | CONSTANT_NUMBERS
    allowed_clocks = _fact_clocks(facts)
    clocks = CLOCK.findall(plain)
    for c in clocks:
        if c not in allowed_clocks:
            errors.append("ungrounded_clock")
            break
    no_clocks = CLOCK.sub(" ", plain)
    for n in NUMBER.findall(no_clocks):
        if norm_num(n) not in allowed_nums:
            errors.append("ungrounded_number")
            break
    if "%" in t:
        errors.append("percentage")
    if SPELLED_NUMBER.search(plain):
        errors.append("spelled_number")

    # invented territory names: quoted strings must be real names
    for q in re.findall(r"[\"“]([^\"”]{2,80})[\"”]", t):
        if q not in names:
            errors.append("unknown_territory")
            break

    if OUTSIDE_BROWSER.search(plain):
        errors.append("outside_browser")
    if BANNED_TONE.search(t):
        errors.append("tone")

    # null / zero consistency
    if facts["vs7Day"] is None and SEVEN_DAY.search(t):
        errors.append("claims_7day")
    if facts["deepBlocks"]["count"] == 0 and re.search(
        r"\b(\d+|a|the longest|your longest) deep blocks?\b", t, re.I
    ) and not re.search(r"\b(0|no|zero) deep blocks?\b", t, re.I):
        errors.append("claims_deep_block")
    if facts["nudges"]["shown"] == 0 and re.search(r"\bnudges? (worked|helped|were accepted)\b", t, re.I):
        errors.append("claims_nudges")

    # required structure (verifiable parts of PDD 4.6)
    text_ints = {norm_num(n) for n in re.findall(r"\d+", t)}
    if str(facts["deepBlocks"]["count"]) not in text_ints and not (
        facts["deepBlocks"]["count"] == 0 and re.search(r"\bno deep blocks?\b", t, re.I)
    ):
        errors.append("missing_headline_blocks")
    if str(facts["residue"]["switchesOutOfDeep"]) not in text_ints and not (
        facts["residue"]["switchesOutOfDeep"] == 0 and re.search(r"\b(no|zero) switches\b", t, re.I)
    ):
        errors.append("missing_headline_residue")
    if facts["strongestStretch"] and str(facts["strongestStretch"]["minutes"]) not in text_ints:
        errors.append("missing_strongest_stretch")
    if facts["topTriggers"] and not any(
        tr["fromTerritory"].lower() in t.lower() or tr["toTerritory"].lower() in t.lower()
        for tr in facts["topTriggers"]
    ):
        errors.append("missing_triggers")
    if not re.search(r"\btomorrow\b", t, re.I):
        errors.append("missing_suggestion")
    return sorted(set(errors))
