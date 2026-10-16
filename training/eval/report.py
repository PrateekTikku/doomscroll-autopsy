"""Build eval/report.md and eval/review_20.md from data/eval_out/*.jsonl and judge.jsonl.

    uv run python -m eval.report [--systems baseline base ft ft_onnx teacher]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval.metrics import autopsy_row, load_eval, naming_row, summarize  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data/eval_out"
LABELS = {"baseline": "Baseline (template / `origin · topic`)", "base": "Base 270M", "ft": "Fine-tuned 270M (fp32)",
          "ft_onnx_q4": "Fine-tuned 270M (optimum ONNX, 4-bit, 488 MB)",
          "ft_onnx": "Fine-tuned 270M (optimum ONNX, 8-bit, 622 MB, superseded)",
          "ft_onnx_final": "**Fine-tuned 270M (genai ONNX, 8-bit, 324 MB, as shipped)**",
          "teacher": "Teacher 31B (ceiling)"}
REVIEW_SYSTEMS = ["baseline", "ft_onnx_final", "teacher"]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return (c - h) / d, (c + h) / d


def load_sys(name: str) -> dict[str, str]:
    p = OUT / f"{name}.jsonl"
    return {r["id"]: r["text"] for r in map(json.loads, p.read_text().splitlines())} if p.exists() else {}


def pct(x) -> str:
    return "–" if x is None else f"{100 * x:.0f}%"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--systems", nargs="+", default=["baseline", "base", "ft", "ft_onnx_q4", "ft_onnx", "ft_onnx_final", "teacher"])
    args = ap.parse_args()
    items = load_eval(HERE.parent / "data/eval.jsonl")
    outputs = {s: load_sys(s) for s in args.systems}
    outputs = {s: o for s, o in outputs.items() if o}

    judge = defaultdict(list)
    jp = OUT / "judge.jsonl"
    if jp.exists():
        for r in map(json.loads, jp.read_text().splitlines()):
            if "faithfulness" in r:
                judge[(r["system"], r["task"])].append(r)

    rows: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for s, o in outputs.items():
        for it in items:
            if it["id"] not in o:
                continue
            if it["task"] == "naming" and s == "baseline":
                # the baseline is a name derived from the input: no JSON, no label, grounded by construction
                rows[(s, "naming")].append({"valid_json": True, "grounded": True, "outside_browser": False,
                                            "label_correct": False, "clean": True, "errors": []})
            elif it["task"] == "naming":
                rows[(s, "naming")].append(naming_row(o[it["id"]], it["input"], it["meta"].get("label")))
            else:
                rows[(s, "autopsy")].append(autopsy_row(o[it["id"]], it["input"]))

    md = ["# T2 evaluation report", "",
          f"100 held-out examples ({sum(i['task']=='naming' for i in items)} naming, "
          f"{sum(i['task']=='autopsy' for i in items)} autopsy). Greedy decoding. Judge: Gemma 4 31B, blind, "
          "rubric in `training/eval/rubric.md`. The teacher wrote the reference outputs and judges them, so its "
          "judge score is biased upward (self-preference); the 20 manual reviews are the check.", ""]
    summary: dict = {}
    for task in ("naming", "autopsy"):
        md += [f"## {task}", ""]
        if task == "naming":
            md += ["| System | n | Valid JSON | Grounded | Outside-browser | Label correct | Clean | Judge faith. | Judge struct. | Judge voice | Judge mean |",
                   "|---|---|---|---|---|---|---|---|---|---|---|"]
        else:
            md += ["| System | n | Length 120-180 | Plain text | Grounded | Outside-browser | Structure | Clean | Strict-clean | Words | Judge faith. | Judge struct. | Judge voice | Judge mean |",
                   "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for s in outputs:
            r = rows.get((s, task), [])
            if not r:
                continue
            sm = summarize(r)
            j = judge.get((s, task), [])
            jm = {d: round(mean(x[d] for x in j), 2) for d in ("faithfulness", "structure", "voice")} if j else {}
            jmean = round(mean(jm.values()), 2) if jm else None
            summary[(s, task)] = {**sm, **jm, "judge_mean": jmean}
            jc = [f"{jm.get(d, '–')}" for d in ("faithfulness", "structure", "voice")] + [f"{jmean if jmean else '–'}"]
            if task == "naming":
                md.append(f"| {LABELS[s]} | {sm['n']} | {pct(sm['valid_json'])} | {pct(sm['grounded'])} | "
                          f"{pct(sm['outside_browser'])} | {'–' if s == 'baseline' else pct(sm['label_correct'])} | {pct(sm['clean'])} | " + " | ".join(jc) + " |")
            else:
                md.append(f"| {LABELS[s]} | {sm['n']} | {pct(sm['length_ok'])} | {pct(sm['plain_text'])} | "
                          f"{pct(sm['grounded'])} | {pct(sm['outside_browser'])} | {pct(sm['structure_ok'])} | "
                          f"{pct(sm['clean'])} | {pct(sm['strict_clean'])} | {sm['words_mean']} | " + " | ".join(jc) + " |")
        md.append("")

    md += ["## Ship bar (PDD 10.4)", "",
           "| Criterion | Fine-tuned (fp32) | Optimum 8-bit (622 MB) | **Shipped: genai 8-bit (324 MB)** |", "|---|---|---|---|"]
    def bar(s: str) -> list[str]:
        n, a = summary.get((s, "naming")), summary.get((s, "autopsy"))
        if not n or not a:
            return ["n/a"] * 6
        validity = min(n["valid_json"], a["plain_text"])
        grounding = min(n["grounded"], a["grounded"])
        jm = [x["judge_mean"] for x in (n, a) if x.get("judge_mean")]
        jmean = round(mean(jm), 2) if jm else None
        base = [summary.get(("baseline", t), {}).get("judge_mean") for t in ("naming", "autopsy")]
        base = [b for b in base if b]
        beats = (jmean is not None and base and jmean > mean(base))
        out = max(n["outside_browser"], a["outside_browser"])
        ok = lambda c: "✅" if c else "❌"
        return [f"{pct(validity)} {ok(validity >= .95)}", f"{pct(grounding)} {ok(grounding >= .90)}",
                f"{jmean} {ok(jmean is not None and jmean >= 3.5)}" if jmean else "–",
                f"{ok(beats)}" if jmean else "–", f"{pct(out)} {ok(out == 0)}", ""]
    labels = ["≥ 95% valid output (JSON for naming, plain text for autopsy; worst task)",
              "≥ 90% grounding pass (worst task)", "Judge mean ≥ 3.5 (mean of both tasks)",
              "Beats baseline on judge mean", "Outside-browser mentions = 0%"]
    b1, b2, b3 = bar("ft"), bar("ft_onnx"), bar("ft_onnx_final")
    for i, l in enumerate(labels):
        md.append(f"| {l} | {b1[i]} | {b2[i]} | {b3[i]} |")

    # confidence intervals and the worst cases for the shipped system
    S = "ft_onnx_final"
    if S in outputs:
        md += ["", "## Shipped system: 95% confidence intervals (Wilson) and worst cases", "",
               "| Measure | Passed | n | Rate | 95% CI |", "|---|---|---|---|---|"]
        for task, keys in (("naming", ("valid_json", "grounded", "label_correct", "clean")),
                           ("autopsy", ("length_ok", "grounded", "structure_ok", "clean"))):
            r = rows.get((S, task), [])
            for k in keys:
                if not r:
                    continue
                ok = sum(bool(x[k]) for x in r)
                lo, hi = wilson(ok, len(r))
                md.append(f"| {task} {k} | {ok} | {len(r)} | {pct(ok / len(r))} | {100 * lo:.0f}% to {100 * hi:.0f}% |")
        jrows = [x for t in ("naming", "autopsy") for x in judge.get((S, t), [])]
        if jrows:
            low = sorted(jrows, key=lambda x: sum(x[d] for d in ("faithfulness", "structure", "voice")))[:8]
            md += ["", "Lowest judge totals (id, faithfulness/structure/voice):", ""]
            for x in low:
                md.append(f"- `{x['id']}`: {x['faithfulness']}/{x['structure']}/{x['voice']}")
            allv = [x[d] for x in jrows for d in ("faithfulness", "structure", "voice")]
            md += ["", f"Judge scores of 3 or less: {sum(v <= 3 for v in allv)} of {len(allv)} ({100 * sum(v <= 3 for v in allv) / len(allv):.1f}%)."]
        # paired comparison with the superseded optimum 8-bit build
        old = outputs.get("ft_onnx", {})
        if old:
            same = [i for i in outputs[S] if i in old]
            eq = sum(outputs[S][i] == old[i] for i in same)
            md += ["", f"Identical output text to the optimum 8-bit build: {eq} of {len(same)} prompts.", ""]
            jo = {(x["id"]): x for t in ("naming", "autopsy") for x in judge.get(("ft_onnx", t), [])}
            jn = {(x["id"]): x for x in jrows}
            both = [i for i in jn if i in jo]
            if both:
                tot = lambda x: sum(x[d] for d in ("faithfulness", "structure", "voice")) / 3
                diffs = [tot(jn[i]) - tot(jo[i]) for i in both]
                md.append(f"Paired judge difference (genai minus optimum, n={len(both)}): mean {mean(diffs):+.2f}, "
                          f"better on {sum(d > 0 for d in diffs)}, worse on {sum(d < 0 for d in diffs)}, same on {sum(d == 0 for d in diffs)}.")
    (HERE / "report.md").write_text("\n".join(md) + "\n")

    # 20 side by side for the owner's manual review
    rnd = random.Random(7)
    pick = {t: rnd.sample([i for i in items if i["task"] == t], 10) for t in ("naming", "autopsy")}
    rv = ["# 20 side-by-side examples for manual review", "",
          "For each: the input, then each system's output. Mark which you would ship (and flag anything wrong).", ""]
    n = 0
    for t in ("naming", "autopsy"):
        for it in pick[t]:
            n += 1
            rv += [f"## {n}. {t} · {it['id']} · {it['persona']} · {it['meta']}", "",
                   "```json", json.dumps(it["input"], ensure_ascii=False, indent=1)[:2500], "```", ""]
            for s in REVIEW_SYSTEMS:
                if s in outputs and it["id"] in outputs[s]:
                    rv += [f"**{LABELS[s]}**", "", f"> {outputs[s][it['id']]}".replace("\n", "\n> "), ""]
    (HERE / "review_20.md").write_text("\n".join(rv) + "\n")
    print("\n".join(md))
    return 0


if __name__ == "__main__":
    sys.exit(main())
