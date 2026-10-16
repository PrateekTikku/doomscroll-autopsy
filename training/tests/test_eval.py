"""Tests for the T2 evaluation harness (baselines, metrics, judge parsing, ONNX export helpers)."""
import json

import pytest

from common import read_jsonl, DATA
from eval.baselines import baseline_name, template_autopsy
from eval.judge import parse_scores
from eval.metrics import autopsy_row, load_eval, naming_row, summarize
from validators import check_autopsy

EVAL = DATA / "eval.jsonl"
pytestmark = pytest.mark.skipif(not EVAL.exists(), reason="T1 eval data not generated")


@pytest.fixture(scope="module")
def items():
    return load_eval(EVAL)


def test_baseline_name_uses_top_origin_and_topic():
    desc = {"origins": [{"origin": "https://www.reddit.com", "pathPrefix": "/r/all", "count": 40},
                        {"origin": "https://news.ycombinator.com", "pathPrefix": "/", "count": 5}],
            "sampleTitles": [], "topicTags": [{"tag": "memes", "score": 0.4}, {"tag": "cats", "score": 0.1}],
            "velocity": {"itemsPerMin": 9, "skipRate": 0.5, "meanDwellS": 3}, "minutesToday": 30}
    assert baseline_name(desc) == "reddit.com · memes"
    desc["topicTags"] = []
    assert baseline_name(desc) == "reddit.com · r"
    desc["origins"][0]["pathPrefix"] = "/"
    assert baseline_name(desc) == "reddit.com"


def test_template_autopsy_is_grounded_and_clean_of_outside_browser(items):
    for it in (i for i in items if i["task"] == "autopsy"):
        errs = set(check_autopsy(template_autopsy(it["input"]), it["input"]))
        assert not errs & {"ungrounded_number", "ungrounded_clock", "outside_browser", "unknown_territory",
                           "claims_7day", "claims_deep_block", "claims_nudges", "markdown"}, (it["id"], errs)


def test_teacher_outputs_pass_their_own_metrics(items):
    for it in items:
        row = naming_row(it["teacher"], it["input"], it["meta"]["label"]) if it["task"] == "naming" \
            else autopsy_row(it["teacher"], it["input"])
        assert row["clean"], (it["id"], row["errors"])


def test_metrics_catch_planted_errors(items):
    nm = next(i for i in items if i["task"] == "naming")
    assert not naming_row("not json", nm["input"], "drain")["valid_json"]
    bad = json.dumps({"name": "Scrolling 9999 items", "suggested_label": "drain", "why": "x"})
    assert not naming_row(bad, nm["input"], "drain")["grounded"]
    wrong = json.loads(nm["teacher"])
    wrong["suggested_label"] = "deep" if nm["meta"]["label"] != "deep" else "drain"
    assert not naming_row(json.dumps(wrong), nm["input"], nm["meta"]["label"])["label_correct"]
    au = next(i for i in items if i["task"] == "autopsy")
    row = autopsy_row(au["teacher"] + " You also spent 97% of the day on your phone.", au["input"])
    assert not row["clean"] and not row["grounded"] and row["outside_browser"]


def test_summarize_rates():
    s = summarize([{"clean": True, "words": 100}, {"clean": False, "words": 140}])
    assert s == {"n": 2, "clean": 0.5, "words_mean": 120.0}


def test_parse_scores():
    assert parse_scores('{"faithfulness": 5, "structure": 4, "voice": 3}') == \
        {"faithfulness": 5, "structure": 4, "voice": 3}
    assert parse_scores('Sure: {"faithfulness": 5, "structure": 4}') is None
    assert parse_scores('{"faithfulness": 6, "structure": 4, "voice": 3}') is None
    assert parse_scores("no json") is None


def test_export_helpers_collapse_and_strip():
    onnx = pytest.importorskip("onnx")
    from onnx import TensorProto, helper

    import export_onnx as ex

    n = [
        helper.make_node("Cast", ["x"], ["a"], name="/m/input_layernorm/Cast", to=TensorProto.FLOAT),
        helper.make_node("Neg", ["a"], ["b"], name="/m/input_layernorm/Neg"),
        helper.make_node("Cast", ["b"], ["h"], name="b_cast_to_fp16", to=TensorProto.FLOAT16),
        helper.make_node("Cast", ["h"], ["f"], name="h_cast_to_fp32", to=TensorProto.FLOAT),
        helper.make_node("Abs", ["f"], ["y"], name="/m/abs"),
    ]
    g = helper.make_graph(n, "g", [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1])],
                          [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1])])
    m = helper.make_model(g)
    assert ex.strip_norm_casts(m) == 1
    assert ex.collapse_cast_pairs(m) == 1
    ops = {x.name: list(x.input) for x in m.graph.node}
    assert ops["/m/input_layernorm/Neg"] == ["x"]
    assert ops["/m/abs"] == ["b"]


def _tiny_tied_model(vocab=4, blocks=2, block=32):
    import numpy as np
    from onnx import TensorProto, helper, numpy_helper

    rng = np.random.default_rng(0)
    q = rng.integers(0, 256, size=(vocab, blocks, block), dtype=np.uint8)
    scales = rng.uniform(0.01, 0.05, size=(vocab, blocks)).astype(np.float16)
    table = ((q.astype(np.float32) - 128) * scales[:, :, None].astype(np.float32)).reshape(vocab, -1).astype(np.float16)
    g = helper.make_graph(
        [helper.make_node("Gather", ["model.embed_tokens.weight", "ids"], ["emb"], name="/model/embed_tokens/Gather")],
        "g", [helper.make_tensor_value_info("ids", TensorProto.INT64, [1, 2])],
        [helper.make_tensor_value_info("emb", TensorProto.FLOAT16, [1, 2, blocks * block])],
        initializer=[numpy_helper.from_array(table, "model.embed_tokens.weight"),
                     numpy_helper.from_array(q, "lm_head.MatMul.weight_Q8"),
                     numpy_helper.from_array(scales, "lm_head.MatMul.weight_scales")])
    return helper.make_model(g, opset_imports=[helper.make_opsetid("", 21), helper.make_opsetid("com.microsoft", 1)]), table


def test_share_embedding_8bit_rewrites_graph():
    pytest.importorskip("onnx")
    import numpy as np
    from onnx import numpy_helper

    import export_onnx as ex

    m, table = _tiny_tied_model()
    removed = ex.share_embedding_8bit(m)
    assert removed == table.size * 2
    assert "model.embed_tokens.weight" not in {t.name for t in m.graph.initializer}
    ops = [n.op_type for n in m.graph.node]
    assert ops == ["Reshape", "GatherBlockQuantized"]
    gq = m.graph.node[1]
    attrs = {a.name: a.i for a in gq.attribute}
    assert attrs == {"bits": 8, "block_size": 32, "gather_axis": 0, "quantize_axis": 1}
    zp = numpy_helper.to_array(next(t for t in m.graph.initializer if t.name == "emb_q_zp"))
    assert zp.shape == (4, 2) and (zp == 128).all()
    assert list(gq.output) == ["emb"]
    # the lookup must reproduce the original fp16 table: dequantise by hand the way the op does
    q = numpy_helper.to_array(next(t for t in m.graph.initializer if t.name == "lm_head.MatMul.weight_Q8")).reshape(4, 64)
    s = numpy_helper.to_array(next(t for t in m.graph.initializer if t.name == "lm_head.MatMul.weight_scales"))
    deq = ((q.astype(np.float32) - 128) * np.repeat(s.astype(np.float32), 32, axis=1)).astype(np.float16)
    assert np.array_equal(deq, table)


def test_pin_kv_dim():
    onnx = pytest.importorskip("onnx")
    from onnx import TensorProto, helper

    import export_onnx as ex

    vi = helper.make_tensor_value_info("past", TensorProto.FLOAT16, ["b", 1, "past_len", "kv_cache_dim"])
    out = helper.make_tensor_value_info("present", TensorProto.FLOAT16, ["b", 1, "total", "kv_cache_dim"])
    m = helper.make_model(helper.make_graph([helper.make_node("Identity", ["past"], ["present"])], "g", [vi], [out]))
    assert ex.pin_kv_dim(m, 256) == 2
    dims = [d.dim_value for d in m.graph.input[0].type.tensor_type.shape.dim]
    assert dims[-1] == 256 and m.graph.input[0].type.tensor_type.shape.dim[2].dim_param == "past_len"


def test_patched_builder_compiles(tmp_path):
    pytest.importorskip("onnxruntime_genai")
    import export_onnx as ex

    builder = ex._patched_builder(tmp_path / "models")
    base = (tmp_path / "models/builders/base.py").read_text()
    assert "from transformers import (" not in base and "(rope_scaling or {})" in base
    compile(base, "base.py", "exec")
    compile(builder.read_text(), "builder.py", "exec")


def _facts(**over):
    f = {"deepBlocks": {"count": 1, "blocks": [], "longestMin": 30, "totalMin": 30},
         "nudges": {"shown": 4, "accepted": 0, "snoozed": 1, "ignored": 3, "medianReturnMin": None},
         "vs7Day": {"deepBlocksDelta": 1.5, "drainOverDelta": -10.0},
         "drainOverAllowance": [], "topTriggers": [{"fromTerritory": "GitHub", "toTerritory": "YouTube", "hour": 14, "count": 3}]}
    f.update(over)
    return f


def test_strict_checks_catch_semantic_slips():
    from eval.metrics import strict_autopsy_errors as strict

    f = _facts()
    assert strict("4 nudges were shown. 3 were snoozed and 1 was ignored.", f) == ["nudge_count_wrong"]
    assert strict("4 nudges were shown. 1 was snoozed and 3 were ignored.", f) == []
    assert strict("This nudge was accepted.", f) == ["nudge_state_wrong"]
    assert strict("This is 1.5 fewer deep blocks than your recent average.", f) == ["delta_sign_wrong"]
    assert strict("This is 1.5 more deep blocks than your recent average.", f) == []
    assert strict("Your drain over allowance was up 10 minutes.", f) == ["delta_sign_wrong"]
    assert strict("Your drain over allowance was down 10 minutes.", f) == []
    assert strict("Your time in Drain exceeded your allowance.", f) == ["claims_over_allowance"]
    assert strict("You moved from GitHub to YouTube 3 times.", f) == []
    assert strict("You moved from GitHub to Linear 3 times.", f) == ["invented_trigger"]
    assert strict("Nothing to check here.", _facts(vs7Day=None)) == []


def test_template_autopsy_passes_strict_checks(items):
    from eval.metrics import strict_autopsy_errors

    for it in [i for i in items if i["task"] == "autopsy"]:
        assert strict_autopsy_errors(template_autopsy(it["input"]), it["input"]) == []
