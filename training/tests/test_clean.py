import json
import random

import pytest

from clean import (clean_examples, nudge_eval_cases, nudge_paragraph_index, nudge_sentence, random_nudges,
                   replace_nudge_paragraph, rewrite_nudge_paragraph, errors_of, words)
from common import AUTOPSY, student_prompt

FACTS = {
    "date": "2026-10-08",
    "deepBlocks": {"count": 2, "longestMin": 64, "totalMin": 101, "blocks": [
        {"start": "09:40", "end": "10:44", "minutes": 64, "territory": "GitHub"},
        {"start": "13:05", "end": "13:42", "minutes": 37, "territory": "Python docs"}]},
    "residue": {"switchesOutOfDeep": 19, "meanMinBackToDeep": 4.2},
    "totalsMin": {"deep": 118, "shallow": 57, "drain": 41},
    "drainOverAllowance": [{"territory": "YouTube shorts", "allowanceMin": 15, "minutesOver": 18}],
    "topTriggers": [{"fromTerritory": "GitHub", "toTerritory": "YouTube shorts", "hour": 15, "count": 3}],
    "strongestStretch": {"territory": "GitHub", "start": "09:40", "end": "10:44", "minutes": 64},
    "nudges": {"shown": 3, "accepted": 2, "snoozed": 1, "ignored": 0, "medianReturnMin": 3.5},
    "vs7Day": None,
}
GOOD = (
    "You had 2 deep blocks today, the longest 64 minutes, adding up to 101 minutes of unbroken depth. "
    "You also switched out of deep work 19 times, and each return took about 4.2 minutes.\n\n"
    "Your strongest stretch was in GitHub, from 09:40 to 10:44: 64 minutes with no interruption worth "
    "naming. Over the whole day you spent 118 minutes in Deep territories, 57 in Shallow and 41 in Drain.\n\n"
    "Depth broke most often around 15:00, when you moved from GitHub to YouTube shorts, 3 times. "
    "YouTube shorts ran 18 minutes past your 15 minute allowance, which is where the evening drift started.\n\n"
    "3 nudges were shown. 2 brought you back to deep work, with a median return of 3.5 minutes, "
    "and 1 was snoozed.\n\n"
    "Tomorrow, try finishing the task you are in on GitHub before 15:00, and keep YouTube shorts for "
    "the gap right after your next deep block."
)


def row(rid="autopsy-1-0001", facts=FACTS, text=GOOD):
    return {"task": AUTOPSY, "id": rid, "persona": "developer", "meta": {},
            "messages": [{"role": "user", "content": student_prompt(AUTOPSY, facts)}, {"role": "assistant", "content": text}]}


def with_nudges(n):
    return {**FACTS, "nudges": n}


@pytest.mark.parametrize("variant", [0, 1, 2, 3])
@pytest.mark.parametrize("n", [
    {"shown": 0, "accepted": 0, "snoozed": 0, "ignored": 0, "medianReturnMin": None},
    {"shown": 1, "accepted": 0, "snoozed": 0, "ignored": 1, "medianReturnMin": None},
    {"shown": 1, "accepted": 1, "snoozed": 0, "ignored": 0, "medianReturnMin": 7.0},
    {"shown": 3, "accepted": 1, "snoozed": 1, "ignored": 1, "medianReturnMin": 2.5},
    {"shown": 4, "accepted": 0, "snoozed": 4, "ignored": 0, "medianReturnMin": None},
])
def test_every_nudge_state_gives_a_valid_paragraph(n, variant):
    f = with_nudges(n)
    new = replace_nudge_paragraph(GOOD, nudge_sentence(n, variant))
    assert new is not None
    assert errors_of(new, f) == [], (new, errors_of(new, f))


def test_good_fixture_is_clean_and_has_the_paragraph():
    assert errors_of(GOOD, FACTS) == []
    assert nudge_paragraph_index(GOOD) == 3


def test_no_replacement_when_the_paragraph_is_missing_or_elsewhere():
    assert replace_nudge_paragraph("one\n\ntwo", "x") is None
    moved = GOOD.split("\n\n")
    moved[3], moved[2] = moved[2], moved[3]
    assert replace_nudge_paragraph("\n\n".join(moved), "x") is None


def test_clean_examples_drops_strict_failures_and_rewrites_the_rest():
    f = with_nudges({"shown": 1, "accepted": 0, "snoozed": 0, "ignored": 1, "medianReturnMin": None})
    wrong_state = GOOD.replace("3 nudges were shown. 2 brought you back to deep work, with a median return of 3.5 minutes, and 1 was snoozed.",
                               "1 nudge was shown. This nudge was snoozed.")
    rows = [row("a", FACTS, GOOD), row("b", f, wrong_state), {"task": "naming", "id": "n1", "messages": []}]
    out, stats = clean_examples(rows, random.Random(1), augment=0)
    ids = [r["id"] for r in out]
    assert ids == ["a", "n1"]  # b has a wrong nudge state: dropped
    assert stats["dropped_strict"] == 1 and stats["rewritten"] == 1
    assert "appeared" in out[0]["messages"][1]["content"] or "Of the" in out[0]["messages"][1]["content"]


def test_augmentation_changes_only_the_nudge_paragraph_and_stays_valid():
    rows = [row(f"a{i}") for i in range(6)]
    out, stats = clean_examples(rows, random.Random(2), augment=6)
    aug = [r for r in out if r["meta"].get("augmented")]
    assert stats["augmented"] == 6 and len(aug) == 6
    base = GOOD.split("\n\n")
    for r in aug:
        facts = json.loads(r["messages"][0]["content"].split("\n\n", 1)[1])
        text = r["messages"][1]["content"]
        assert errors_of(text, facts) == []
        paras = text.split("\n\n")
        assert paras[:3] == base[:3] and paras[4:] == base[4:]
        assert facts["nudges"] != FACTS["nudges"]
        # the prompt is exactly what the student will see at runtime
        assert r["messages"][0]["content"] == student_prompt(AUTOPSY, facts)


def test_real_use_distribution_is_mostly_unanswered():
    rng = random.Random(5)
    draws = [random_nudges(rng) for _ in range(2000)]
    all_ignored = sum(1 for d in draws if d["ignored"] == d["shown"])
    assert 0.35 < all_ignored / len(draws) < 0.55
    assert all(d["medianReturnMin"] is None or d["accepted"] > 0 for d in draws)


def test_nudge_eval_cases_are_ignored_heavy_and_deterministic():
    eval_rows = [row(f"e{i}") for i in range(5)]
    a = nudge_eval_cases(eval_rows, random.Random(1), 12)
    b = nudge_eval_cases(eval_rows, random.Random(1), 12)
    assert a == b and len(a) == 12
    assert sum(1 for c in a if c["facts"]["nudges"]["ignored"] == c["facts"]["nudges"]["shown"]) >= 9
    for c in a:
        assert c["prompt"].startswith("Write tonight's autopsy")


def test_rewrite_picks_the_shortest_valid_wording():
    for n in ({"shown": 1, "accepted": 0, "snoozed": 0, "ignored": 1, "medianReturnMin": None},
              {"shown": 2, "accepted": 1, "snoozed": 0, "ignored": 1, "medianReturnMin": 4.0}):
        f = with_nudges(n)
        new = rewrite_nudge_paragraph(GOOD, f, n)
        assert new is not None and errors_of(new, f) == []
        sizes = [words(replace_nudge_paragraph(GOOD, nudge_sentence(n, v))) for v in range(4)]
        assert words(new) == min(sizes)


def test_overlong_texts_are_dropped_from_training():
    long_text = GOOD.replace("Tomorrow,", "Tomorrow, " + "and also " * 20 + "")
    rows = [row("keep", FACTS, GOOD), row("long", FACTS, long_text)]
    out, stats = clean_examples(rows, random.Random(1), augment=0)
    assert [r["id"] for r in out] == ["keep"] and stats["dropped_long"] <= 1


def test_zero_nudge_variants():
    n = {"shown": 0, "accepted": 0, "snoozed": 0, "ignored": 0, "medianReturnMin": None}
    assert nudge_sentence(n, 0) == "No nudges were shown today."
    assert nudge_sentence(n, 2).startswith("No nudges were shown today, so")
