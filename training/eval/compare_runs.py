"""T3: compare two fine-tunes from their browser generations (onnx_test/run.mjs output).

    uv run python -m eval.compare_runs run1=<eval.json>,<nudge.json> run2=<eval.json>,<nudge.json> --out ../docs/showcase/T3/comparison.md

For each run: the 100 held-out eval prompts (T2's set; automatic metrics only) and the 40 ignored-heavy
nudge prompts (`clean.nudge_eval_cases`). Metrics are T1's validators plus the strict semantic checks.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from eval.metrics import autopsy_row, load_eval, naming_row, summarize  # noqa: E402


def texts(path: Path) -> dict[str, str]:
    return {r["id"]: r["text"] for r in json.loads(path.read_text())["runs"]}


def eval_rows(path: Path) -> tuple[list[dict], list[dict]]:
    items = {i["id"]: i for i in load_eval(HERE / "data/eval.jsonl")}
    out = texts(path)
    naming, autopsy = [], []
    for id_, text in out.items():
        it = items[id_]
        if it["task"] == "naming":
            naming.append(naming_row(text, it["input"], it["meta"].get("label")))
        else:
            autopsy.append(autopsy_row(text, it["input"]))
    return naming, autopsy


def nudge_rows(path: Path) -> list[dict]:
    facts = {json.loads(l)["id"]: json.loads(l)["facts"] for l in (HERE / "data/eval_nudge/facts.jsonl").read_text().splitlines() if l.strip()}
    return [autopsy_row(text, facts[id_]) for id_, text in texts(path).items()]


def pct(x) -> str:
    return "n/a" if x is None else f"{round(100 * x)}%"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="+", help="name=eval.json,nudge.json")
    ap.add_argument("--out", type=Path, default=HERE.parent / "docs/showcase/T3/comparison.md")
    args = ap.parse_args()
    lines = ["# T3: run1 vs run2 (automatic metrics, browser generations)", "",
             "| Run | Set | n | Valid | Grounded | Length OK | Outside-browser | Structure | Clean | Strict-clean |", "|---|---|---|---|---|---|---|---|---|---|"]
    detail: dict[str, dict] = {}
    for spec in args.runs:
        name, files = spec.split("=")
        ev, nd = files.split(",")
        naming, autopsy = eval_rows(Path(ev))
        nudge = nudge_rows(Path(nd))
        for label, rows in (("eval naming", naming), ("eval autopsy", autopsy), ("nudge-heavy autopsy", nudge)):
            s = summarize(rows)
            detail[f"{name}/{label}"] = s
            lines.append(f"| {name} | {label} | {s['n']} | {pct(s.get('valid_json'))} | {pct(s.get('grounded'))} | {pct(s.get('length_ok'))} | "
                         f"{pct(s.get('outside_browser'))} | {pct(s.get('structure_ok'))} | {pct(s.get('clean'))} | {pct(s.get('strict_clean'))} |")
        if naming:
            lines.append(f"| {name} | eval naming label correct | {len(naming)} | | | | | | {pct(sum(r['label_correct'] for r in naming) / len(naming))} | |")
        errs: dict[str, int] = {}
        for r in autopsy + nudge:
            for e in r["errors"] + r["strict_errors"]:
                errs[e] = errs.get(e, 0) + 1
        detail[f"{name}/errors"] = errs
    lines += ["", "## Error codes over eval autopsies + nudge-heavy autopsies", ""]
    for k, v in detail.items():
        if k.endswith("/errors"):
            lines.append(f"- {k.split('/')[0]}: {json.dumps(dict(sorted(v.items(), key=lambda x: -x[1])))}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines) + "\n")
    (args.out.with_suffix(".json")).write_text(json.dumps(detail, indent=1))
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
