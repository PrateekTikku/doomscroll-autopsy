import copy
import json

import pytest

from common import load_personas
from gen_inputs import make_facts
import random
from validators import check_autopsy, norm_num, parse_naming

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

DESC = {"origins": [{"origin": "https://www.reddit.com", "pathPrefix": "/r/all", "count": 212}],
        "sampleTitles": ["This cat has opinions"], "topicTags": [{"tag": "memes", "score": 0.61}],
        "velocity": {"itemsPerMin": 9.4, "skipRate": 0.46, "meanDwellS": 5.8}, "minutesToday": 37}


def test_good_autopsy_passes():
    assert check_autopsy(GOOD, FACTS) == []


@pytest.mark.parametrize("mutate,code", [
    (lambda t: t.replace("19 times", "23 times"), "ungrounded_number"),
    (lambda t: t.replace("15:00", "16:30"), "ungrounded_clock"),
    (lambda t: t.replace("Depth broke", "Away from the keyboard, depth broke"), "outside_browser"),
    (lambda t: t.replace("Tomorrow", "Next time"), "missing_suggestion"),
    (lambda t: t + " That was a lazy afternoon.", "tone"),
    (lambda t: t.replace("118 minutes", "118 minutes (62%)"), "percentage"),
    (lambda t: t.replace("3 nudges", "three nudges"), "spelled_number"),
    (lambda t: t.replace("YouTube shorts ran", 'The "Twitter feed" ran'), "unknown_territory"),
    (lambda t: "## Autopsy\n" + t, "markdown"),
    (lambda t: t.replace("You had 2 deep blocks", "You had 9 deep blocks"), "ungrounded_number"),
])
def test_planted_errors_are_caught(mutate, code):
    assert code in check_autopsy(mutate(GOOD), FACTS)


def test_word_count_bounds():
    assert "word_count" in check_autopsy("You had 2 deep blocks. Tomorrow, try again.", FACTS)
    assert "word_count" in check_autopsy(GOOD + " " + "word " * 80, FACTS)


def test_null_vs7day_cannot_claim_comparison():
    text = GOOD.replace("Tomorrow,", "That is better than usual. Tomorrow,")
    assert "claims_7day" in check_autopsy(text, FACTS)
    facts = copy.deepcopy(FACTS)
    facts["vs7Day"] = {"deepBlocksDelta": 1, "drainOverDelta": -4.0}
    assert "claims_7day" not in check_autopsy(text, facts)


def test_zero_nudges_cannot_claim_outcomes():
    facts = copy.deepcopy(FACTS)
    facts["nudges"] = {"shown": 0, "accepted": 0, "snoozed": 0, "ignored": 0, "medianReturnMin": None}
    text = GOOD.replace("3 nudges were shown. 2 brought", "Your nudges worked: 2 brought")
    assert "claims_nudges" in check_autopsy(text, facts)


def test_date_digits_are_not_allowed():
    assert "ungrounded_number" in check_autopsy(GOOD.replace("Tomorrow,", "On 2026 Tomorrow,"), FACTS)


def test_norm_num():
    assert norm_num("49.0") == norm_num("49") == "49"
    assert norm_num("0.71") == "0.71"


def test_naming_ok_and_canonicalised():
    text = '```json\n{"name":"Reddit meme scrolling","suggested_label":"drain","why":"9.4 items a minute, 0.46 skip rate."}\n```'
    obj, errs = parse_naming(text, DESC, "drain")
    assert errs == [] and list(obj) == ["name", "suggested_label", "why"]


@pytest.mark.parametrize("text,code", [
    ("not json", "bad_json"),
    ('{"name":"A","suggested_label":"maybe","why":"x"}', "schema"),
    ('{"name":"one two three four five six seven","suggested_label":"drain","why":"x"}', "schema"),
    ('{"name":"Reddit memes","suggested_label":"drain","why":"41 items a minute."}', "ungrounded_number"),
    ('{"name":"reddit.com/r/all","suggested_label":"drain","why":"x"}', "name_is_url"),
    ('{"name":"Reddit memes","suggested_label":"drain","why":"The ground truth label says so."}', "hint_leak"),
    ('{"name":"Reddit memes","suggested_label":"deep","why":"x"}', "label_mismatch"),
    ('{"name":"Reddit memes","suggested_label":"drain","why":"You wasted time."}', "tone"),
])
def test_naming_planted_errors(text, code):
    _, errs = parse_naming(text, DESC, "drain")
    assert code in errs


def test_naming_float_formatting_is_grounded():
    text = '{"name":"Reddit memes","suggested_label":"drain","why":"Skip rate 0.46 and 5.80 seconds dwell."}'
    _, errs = parse_naming(text, DESC, "drain")
    assert "ungrounded_number" not in errs


def test_seven_day_phrase_allowed_only_with_comparison_data():
    facts = copy.deepcopy(FACTS)
    facts["vs7Day"] = {"deepBlocksDelta": -1, "drainOverDelta": 14.2}
    text = GOOD.replace("Tomorrow,", "That is 1 fewer than your 7-day average. Tomorrow,")
    assert "ungrounded_number" not in check_autopsy(text, facts)
    assert "ungrounded_number" in check_autopsy(text, FACTS)  # vs7Day null: 7 is not a fact


def test_negative_deltas_are_grounded_by_magnitude():
    facts = copy.deepcopy(FACTS)
    facts["vs7Day"] = {"deepBlocksDelta": -1.5, "drainOverDelta": -14.3}
    text = GOOD.replace("Tomorrow,", "That is 1.5 fewer deep blocks and 14.3 fewer drain minutes than your recent average. Tomorrow,")
    assert "ungrounded_number" not in check_autopsy(text, facts)
