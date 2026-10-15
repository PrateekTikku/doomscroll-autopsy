import json

from common import AUTOPSY, NAMING, STUDENT_INSTRUCTION, compact_json, student_prompt
import filter as flt
import gen_inputs as g
import gen_teacher as gt
from common import append_jsonl


def test_student_prompt_golden():
    obj = {"origins": [{"origin": "https://x.com", "pathPrefix": "/home", "count": 3}], "sampleTitles": [],
           "topicTags": [], "velocity": {"itemsPerMin": 9.4, "skipRate": 0.46, "meanDwellS": 5.8},
           "minutesToday": 12}
    assert student_prompt(NAMING, obj) == (
        STUDENT_INSTRUCTION[NAMING] + "\n\n"
        '{"origins":[{"origin":"https://x.com","pathPrefix":"/home","count":3}],"sampleTitles":[],'
        '"topicTags":[],"velocity":{"itemsPerMin":9.4,"skipRate":0.46,"meanDwellS":5.8},"minutesToday":12}'
    )
    assert compact_json({"a": [1, 2]}) == '{"a":[1,2]}'


def _stub_chat(rec_by_prompt):
    calls = []

    def chat(prompt):
        calls.append(prompt)
        return rec_by_prompt(prompt), 10, 0.1
    return chat, calls


def test_gen_teacher_resumes_and_retries(tmp_path):
    inputs = g.generate(NAMING, 4, 1)
    out = tmp_path / "raw.jsonl"
    state = {"n": 0}

    def reply(prompt):
        state["n"] += 1
        if state["n"] == 1:
            return "garbage"  # first attempt of first item fails, retry succeeds
        label = next(r for r in inputs if r["meta"]["label"] in prompt)["meta"]["label"]
        for r in inputs:
            if json.dumps(r["input"], separators=(",", ":"), ensure_ascii=False) in prompt:
                label = r["meta"]["label"]
        return json.dumps({"name": "Some territory", "suggested_label": label, "why": "Steady pace."})

    chat, calls = _stub_chat(reply)
    stats = gt.run(NAMING, inputs[:2], out, chat, concurrency=1)
    assert stats["done"] == 2 and stats["ok"] == 2
    first = [json.loads(l) for l in out.read_text().splitlines()]
    assert len(first[0]["attempts"]) == 2  # retried once
    # resume: only the remaining inputs are processed
    n_calls = len(calls)
    gt.run(NAMING, inputs, out, chat, concurrency=1)
    assert len(calls) - n_calls == 2
    assert len(out.read_text().splitlines()) == 4


def test_filter_split_is_stratified_and_sized():
    examples = []
    for task, n in ((NAMING, 600), (AUTOPSY, 400)):
        for r in g.generate(task, n, 11):
            examples.append({"task": task, "id": r["id"], "persona": r["persona"], "meta": r["meta"],
                             "messages": []})
    train, ev = flt.split(examples)
    assert len(ev) == 100 and len(train) == 900
    assert sum(e["task"] == NAMING for e in ev) == 60
    assert sum(e["task"] == AUTOPSY for e in ev) == 40
    assert not {e["id"] for e in train} & {e["id"] for e in ev}
    assert len({e["persona"] for e in ev}) == 6
