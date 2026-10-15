"""Turn raw teacher outputs into train/eval JSONL (PDD 10.2).

    uv run python -m filter --inputs data/pilot/inputs --raw data/pilot/raw --out data/pilot --pilot
    uv run python -m filter                      # full run: 900/100 split to data/train.jsonl, eval.jsonl

Re-validates every output with the shared validators, drops near-duplicate inputs and
over-repeated outputs, and writes Gemma-chat-format examples. `--pilot` keeps everything in
one file without splitting.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from common import DATA, NAMING, TASKS, read_jsonl, student_prompt
from gen_teacher import validate

EVAL_SHARE = {NAMING: 60, "autopsy": 40}
# Same site -> same sensible name is legitimate for naming; autopsies should never repeat.
MAX_SAME_OUTPUT = {NAMING: 12, "autopsy": 1}


def build_examples(inputs_dir: Path, raw_dir: Path):
    """Returns (examples, failures Counter, dropped Counter)."""
    examples, failures, dropped = [], Counter(), Counter()
    for task in TASKS:
        inputs = {r["id"]: r for r in read_jsonl(inputs_dir / f"{task}.jsonl")}
        seen_inputs, seen_outputs = set(), Counter()
        for raw in read_jsonl(raw_dir / f"{task}.jsonl"):
            rec = inputs.get(raw["id"])
            if rec is None:
                dropped["unknown_input"] += 1
                continue
            final = next((a for a in reversed(raw["attempts"]) if "output" in a), None)
            if final is None:
                failures[f"{task}:no_output"] += 1
                continue
            # always re-validate with the current rules, whatever the generation-time verdict was
            target, errs = validate(task, rec, final["output"])
            if target is None:
                for e in errs:
                    failures[f"{task}:{e}"] += 1
                continue
            key = hashlib.sha1(json.dumps(rec["input"], sort_keys=True).encode()).hexdigest()
            if key in seen_inputs:
                dropped["duplicate_input"] += 1
                continue
            seen_inputs.add(key)
            if seen_outputs[target] >= MAX_SAME_OUTPUT[task]:
                dropped["repeated_output"] += 1
                continue
            seen_outputs[target] += 1
            examples.append({
                "task": task, "id": rec["id"], "persona": rec["persona"], "meta": rec["meta"],
                "messages": [
                    {"role": "user", "content": student_prompt(task, rec["input"])},
                    {"role": "assistant", "content": target},
                ],
            })
    return examples, failures, dropped


def split(examples: list[dict], seed: int = 7):
    """Stratified by task, then persona and edge tag; eval sizes follow EVAL_SHARE."""
    rng = random.Random(seed)
    train, ev = [], []
    for task in TASKS:
        items = [e for e in examples if e["task"] == task]
        groups = defaultdict(list)
        for e in items:
            groups[(e["persona"], e["meta"].get("edge", ""))].append(e)
        for g in groups.values():
            rng.shuffle(g)
        # round-robin across groups so the eval slice covers as many strata as possible
        order = []
        while any(groups.values()):
            for k in sorted(groups):
                if groups[k]:
                    order.append(groups[k].pop())
        n_eval = min(EVAL_SHARE[task], len(order) // 10 or 0)
        ev += order[:n_eval]
        train += order[n_eval:]
    rng.shuffle(train)
    return train, ev


def write(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", type=Path, default=DATA / "inputs")
    ap.add_argument("--raw", type=Path, default=DATA / "raw")
    ap.add_argument("--out", type=Path, default=DATA)
    ap.add_argument("--pilot", action="store_true", help="no split; write pilot.jsonl")
    ap.add_argument("--partial", action="store_true", help="write train.partial.jsonl (no eval)")
    args = ap.parse_args()

    examples, failures, dropped = build_examples(args.inputs, args.raw)
    print(f"kept {len(examples)} examples; failures={dict(failures)}; dropped={dict(dropped)}")
    for task in TASKS:
        print(f"  {task}: {sum(1 for e in examples if e['task'] == task)}")
    if args.pilot:
        write(args.out / "pilot.jsonl", examples)
    elif args.partial:
        write(args.out / "train.partial.jsonl", examples)
    else:
        train, ev = split(examples)
        write(args.out / "train.jsonl", train)
        write(args.out / "eval.jsonl", ev)
        print(f"train={len(train)} eval={len(ev)}")


if __name__ == "__main__":
    main()
