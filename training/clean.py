"""T3: corrected training data for the autopsy task (K-08, K-24).

    uv run python clean.py [--seed 3] [--augment 160]

Reads data/train.jsonl and data/eval.jsonl (T1) and writes
    data/train_v2.jsonl        dropped bad examples, canonical nudge paragraph, nudge-state variants
    data/eval_nudge/cases.json held-out prompts with ignored-heavy nudges (browser test page format)
    data/eval_nudge/facts.jsonl the same facts, for scoring

Why: the nudge sentence sits alone in paragraph 4 of the teacher autopsies, and the teacher (and then the
student) often attached the wrong state to it. Rewriting that one paragraph from `facts.nudges` makes
every kept example correct by construction, and varying `nudges` teaches the states real use produces
(mostly unanswered nudges), which the data under-represented. Nothing else in a text mentions nudges.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import AUTOPSY, compact_json, student_prompt  # noqa: E402
from eval.metrics import strict_autopsy_errors  # noqa: E402
from validators import check_autopsy  # noqa: E402

NUDGE_PARAGRAPH = 3  # zero-based: headline, stretch+totals, triggers, nudges, suggestion


def _plural(n: float, one: str, many: str | None = None) -> str:
    return f"{n:g} {one if n == 1 else (many or one + 's')}"


def nudge_sentence(n: dict, variant: int = 0) -> str:
    """Canonical text for the nudge paragraph, from facts.nudges. Always passes the strict checks."""
    if n["shown"] == 0:
        return "No nudges were shown today."
    shown = _plural(n["shown"], "nudge")
    a, s, i = n["accepted"], n["snoozed"], n["ignored"]
    if variant == 0:
        base = f"{shown} appeared: {a} accepted, {s} snoozed and {i} ignored."
    else:
        verb = "was" if a == 1 else "were"
        base = f"Of the {shown} shown, {a} {verb} accepted, {s} snoozed and {i} ignored."
    if n["medianReturnMin"] is not None and a > 0:
        base += f" After an accepted nudge you were back in deep work within a median of {_plural(n['medianReturnMin'], 'minute')}."
    return base


def nudge_paragraph_index(text: str) -> int | None:
    """Index of the one paragraph that mentions nudges, or None (zero or several)."""
    hits = [i for i, p in enumerate(text.split("\n\n")) if re.search(r"nudge", p, re.I)]
    return hits[0] if len(hits) == 1 and hits[0] == NUDGE_PARAGRAPH else None


def replace_nudge_paragraph(text: str, sentence: str) -> str | None:
    idx = nudge_paragraph_index(text)
    if idx is None:
        return None
    paras = text.split("\n\n")
    paras[idx] = sentence
    return "\n\n".join(paras)


def errors_of(text: str, facts: dict) -> list[str]:
    return sorted(set(check_autopsy(text, facts)) | set(strict_autopsy_errors(text, facts)))


def random_nudges(rng: random.Random) -> dict:
    """What real use produces: mostly unanswered nudges."""
    shown = rng.randint(1, 4)
    r = rng.random()
    if r < 0.40:
        a, s, i = 0, 0, shown
    elif r < 0.70:  # mixed
        a = rng.randint(0, shown)
        s = rng.randint(0, shown - a)
        i = shown - a - s
    elif r < 0.85:
        a, s, i = shown, 0, 0
    else:
        a, s, i = 0, shown, 0
    median = round(rng.uniform(1.0, 15.0), 1) if a > 0 else None
    return {"shown": shown, "accepted": a, "snoozed": s, "ignored": i, "medianReturnMin": median}


def split_user(content: str) -> tuple[str, dict]:
    head, body = content.split("\n\n", 1)
    return head, json.loads(body)


def clean_examples(rows: list[dict], rng: random.Random, augment: int) -> tuple[list[dict], dict]:
    """Returns (new rows, stats). Naming rows pass through untouched."""
    out: list[dict] = []
    stats = {"autopsy_in": 0, "dropped_strict": 0, "rewritten": 0, "kept_as_is": 0, "augmented": 0}
    bases: list[tuple[dict, dict, str]] = []
    for r in rows:
        if r["task"] != AUTOPSY:
            out.append(r)
            continue
        stats["autopsy_in"] += 1
        _, facts = split_user(r["messages"][0]["content"])
        text = r["messages"][1]["content"]
        if strict_autopsy_errors(text, facts):
            stats["dropped_strict"] += 1
            continue
        new = replace_nudge_paragraph(text, nudge_sentence(facts["nudges"], zlib.crc32(r["id"].encode()) % 2))
        if new is not None and not errors_of(new, facts):
            text = new
            stats["rewritten"] += 1
        else:
            stats["kept_as_is"] += 1
        row = {**r, "messages": [r["messages"][0], {"role": "assistant", "content": text}]}
        out.append(row)
        bases.append((row, facts, text))

    candidates = [b for b in bases if nudge_paragraph_index(b[2]) is not None]
    rng.shuffle(candidates)
    for row, facts, text in candidates:
        if stats["augmented"] >= augment:
            break
        for _ in range(8):
            nudges = random_nudges(rng)
            if nudges == facts["nudges"]:
                continue
            v = {**facts, "nudges": nudges}
            new = replace_nudge_paragraph(text, nudge_sentence(nudges, rng.randint(0, 1)))
            if new is None or errors_of(new, v):
                continue
            out.append({**row, "id": f"{row['id']}-n{stats['augmented']:03d}",
                        "meta": {**row.get("meta", {}), "augmented": "nudges"},
                        "messages": [{"role": "user", "content": student_prompt(AUTOPSY, v)}, {"role": "assistant", "content": new}]})
            stats["augmented"] += 1
            break
    return out, stats


def nudge_eval_cases(eval_rows: list[dict], rng: random.Random, n: int = 40) -> list[dict]:
    """Held-out prompts: eval autopsy facts with real-use-like (ignored-heavy) nudges."""
    base = [r for r in eval_rows if r["task"] == AUTOPSY]
    cases = []
    for k in range(n):
        r = base[k % len(base)]
        _, facts = split_user(r["messages"][0]["content"])
        nudges = {"shown": 1 + k % 3, "accepted": 0, "snoozed": 0, "ignored": 1 + k % 3, "medianReturnMin": None} if k % 4 else random_nudges(rng)
        v = {**facts, "nudges": nudges}
        cases.append({"id": f"nudge-{k:02d}-{r['id']}", "prompt": student_prompt(AUTOPSY, v), "maxNew": 400, "facts": v})
    return cases


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--augment", type=int, default=160)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    rows = read_jsonl(HERE / "data/train.jsonl")
    out, stats = clean_examples(rows, rng, args.augment)
    rng.shuffle(out)
    with (HERE / "data/train_v2.jsonl").open("w") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    cases = nudge_eval_cases(read_jsonl(HERE / "data/eval.jsonl"), rng)
    d = HERE / "data/eval_nudge"
    d.mkdir(exist_ok=True)
    (d / "cases.json").write_text(json.dumps([{k: c[k] for k in ("id", "prompt", "maxNew")} for c in cases], ensure_ascii=False))
    (d / "facts.jsonl").write_text("\n".join(json.dumps({"id": c["id"], "facts": c["facts"]}, ensure_ascii=False) for c in cases) + "\n")
    print(json.dumps({**stats, "train_in": len(rows), "train_out": len(out), "eval_nudge": len(cases)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
