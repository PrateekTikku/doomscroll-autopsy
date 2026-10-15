import json
import random

from common import AUTOPSY, NAMING, load_personas, schema_validator
import gen_inputs as g


def test_generators_schema_valid_across_seeds():
    for seed in (1, 2, 3):
        for rec in g.generate(NAMING, 120, seed):
            assert not list(schema_validator("territory-description").iter_errors(rec["input"]))
        for rec in g.generate(AUTOPSY, 120, seed):
            assert not list(schema_validator("daily-facts").iter_errors(rec["input"]))
            g.check_facts_consistency(rec["input"])


def test_deterministic_for_seed():
    assert g.generate(AUTOPSY, 10, 5) == g.generate(AUTOPSY, 10, 5)
    assert g.generate(NAMING, 10, 5) != g.generate(NAMING, 10, 6)


def test_edge_cases_present():
    edges = {r["meta"]["edge"] for r in g.generate(AUTOPSY, 300, 1)}
    assert {"zero-deep", "great-day", "drain-heavy", "no-nudges", "new-user", "single-long-block"} <= edges
    zero = [r["input"] for r in g.generate(AUTOPSY, 300, 1) if r["meta"]["edge"] == "zero-deep"]
    assert all(f["deepBlocks"]["count"] == 0 for f in zero)
    assert any(f["vs7Day"] is None for f in zero)


def test_naming_covers_all_labels_and_personas():
    recs = g.generate(NAMING, 300, 1)
    assert {r["meta"]["label"] for r in recs} == {"deep", "shallow", "drain"}
    assert {r["persona"] for r in recs} == {p["id"] for p in load_personas()}


def test_no_query_strings_in_origins():
    for rec in g.generate(NAMING, 100, 2):
        for o in rec["input"]["origins"]:
            assert "?" not in o["pathPrefix"] and "#" not in o["pathPrefix"]
