"""31B judge (PDD 10.4): scores each output 1-5 on faithfulness, structure and voice.

    TEACHER_URL=http://127.0.0.1:8889/v1 uv run python -m eval.judge --systems baseline base ft teacher

Blind: the judge sees only the task, the input and one candidate; never the system name. Greedy decoding.
Resumable: data/eval_out/judge.jsonl holds {system, id, faithfulness, structure, voice}.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval.metrics import load_eval  # noqa: E402
from gen_teacher import make_chat  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data/eval_out"
DIMS = ("faithfulness", "structure", "voice")


def judge_prompt(task: str, inp: dict, candidate: str) -> str:
    rubric = (HERE / "rubric.md").read_text()
    return (f"{rubric}\n\n## Task\n{task}\n\n## Input\n{json.dumps(inp, ensure_ascii=False)}\n\n"
            f"## Candidate output\n{candidate}\n\nReply with JSON only.")


def parse_scores(text: str) -> dict | None:
    m = re.search(r"\{.*?\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        scores = {d: int(obj[d]) for d in DIMS}
    except (ValueError, KeyError, TypeError):
        return None
    return scores if all(1 <= v <= 5 for v in scores.values()) else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--systems", nargs="+", required=True)
    ap.add_argument("--url", default=os.environ.get("TEACHER_URL", "http://127.0.0.1:8889/v1"))
    ap.add_argument("--out", type=Path, default=OUT / "judge.jsonl")
    args = ap.parse_args()

    chat = make_chat(args.url, os.environ.get("TEACHER_API_KEY"), 0.0, 60)
    items = {it["id"]: it for it in load_eval(HERE.parent / "data/eval.jsonl")}
    done = set()
    if args.out.exists():
        done = {(r["system"], r["id"]) for r in map(json.loads, args.out.read_text().splitlines())}
    jobs = []
    for sysname in args.systems:
        for line in (OUT / f"{sysname}.jsonl").read_text().splitlines():
            r = json.loads(line)
            if (sysname, r["id"]) not in done:
                jobs.append((sysname, r))

    def run(job):
        sysname, r = job
        it = items[r["id"]]
        prompt = judge_prompt(it["task"], it["input"], r["text"])
        for _ in range(2):
            text, _, _ = chat(prompt)
            s = parse_scores(text)
            if s:
                return {"system": sysname, "id": r["id"], "task": it["task"], **s}
        return {"system": sysname, "id": r["id"], "task": it["task"], "error": "unparsed"}

    with ThreadPoolExecutor(1) as ex, args.out.open("a") as f:  # one slot: parallel decode does not help (S4)
        for n, res in enumerate(ex.map(run, jobs), 1):
            f.write(json.dumps(res) + "\n")
            f.flush()
            if n % 20 == 0:
                print(f"judged {n}/{len(jobs)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
