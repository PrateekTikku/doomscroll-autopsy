"""The shared contracts in ../shared must be valid JSON Schemas and accept the shared samples.

T1/T2 read these schemas directly; the extension uses the generated shared/types.ts.
"""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

SHARED = Path(__file__).resolve().parents[2] / "shared"
SCHEMAS = {p.name.removesuffix(".schema.json"): p for p in sorted(SHARED.glob("*.schema.json"))}
SAMPLES = sorted((SHARED / "samples").glob("*.sample.json"))


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(load(SCHEMAS[name]))


def test_expected_schemas_exist():
    assert set(SCHEMAS) == {"daily-facts", "naming-output", "observer-event", "personas", "territory-description"}


@pytest.mark.parametrize("name", sorted(SCHEMAS))
def test_schema_is_valid_draft_2020_12(name):
    schema = load(SCHEMAS[name])
    Draft202012Validator.check_schema(schema)
    assert schema["$id"].endswith(":v1")


@pytest.mark.parametrize("sample", SAMPLES, ids=lambda p: p.name)
def test_sample_validates(sample):
    data = load(sample)
    v = validator(sample.name.removesuffix(".sample.json"))
    for item in data if isinstance(data, list) else [data]:
        errors = list(v.iter_errors(item))
        assert not errors, [e.message for e in errors]


def test_every_non_persona_schema_has_a_sample():
    sampled = {p.name.removesuffix(".sample.json") for p in SAMPLES}
    assert sampled == set(SCHEMAS) - {"personas"}


def test_personas_validate():
    personas = load(SHARED / "personas.json")
    validator("personas").validate(personas)
    assert [p["id"] for p in personas["personas"]] == [
        "developer", "writer", "researcher", "designer", "student", "freelancer",
    ]


def test_corrupted_daily_facts_fail():
    facts = load(SHARED / "samples" / "daily-facts.sample.json")
    v = validator("daily-facts")

    bad = copy.deepcopy(facts)
    bad["deepBlocks"]["blocks"][0]["start"] = "9:42"  # not HH:MM
    assert not v.is_valid(bad)

    bad = copy.deepcopy(facts)
    del bad["residue"]
    assert not v.is_valid(bad)

    bad = copy.deepcopy(facts)
    bad["outsideBrowserMin"] = 120  # D-45: no such field, and no extras allowed
    assert not v.is_valid(bad)


def test_naming_output_limits():
    v = validator("naming-output")
    assert v.is_valid({"name": "Docs and deep reading", "suggested_label": "deep", "why": "Long dwell on docs."})
    assert not v.is_valid({"name": "one two three four five six seven", "suggested_label": "deep", "why": "x"})
    assert not v.is_valid({"name": "Docs", "suggested_label": "neutral", "why": "x"})


def test_observer_event_rejects_query_strings():
    v = validator("observer-event")
    assert v.is_valid({"type": "heartbeat", "ts": 1, "origin": "https://a.com", "path": "/p"})
    assert not v.is_valid({"type": "heartbeat", "ts": 1, "origin": "https://a.com", "path": "/p?q=secret"})
