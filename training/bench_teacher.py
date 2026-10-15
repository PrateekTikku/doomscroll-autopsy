"""Spike S4: teacher throughput at 1, 2 and 4 concurrent requests.

    TEACHER_API_KEY=... uv run python -m bench_teacher --out ../docs/showcase/T1/s4-throughput.md

Uses fresh synthetic inputs (seed 99, separate from the pilot). tok/s is estimated from
streamed content chunks (the server reports zero usage); llama.cpp emits ~1 chunk per token,
and with MTP possibly fewer chunks than tokens, so treat it as a lower bound.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import gen_inputs
from common import AUTOPSY, NAMING
from gen_teacher import DEFAULT_URL, make_chat, teacher_prompt, validate


def run_level(chat, prompts, concurrency):
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        results = list(ex.map(chat, prompts))
    wall = time.time() - t0
    chunks = sum(r[1] for r in results)
    return {"concurrency": concurrency, "requests": len(prompts), "wall_s": round(wall, 1),
            "chunks": chunks, "aggregate_tok_s": round(chunks / wall, 1),
            "per_request_tok_s": round(sum(r[1] / max(r[2], 1e-6) for r in results) / len(results), 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.environ.get("TEACHER_URL", DEFAULT_URL))
    ap.add_argument("--out", type=Path)
    ap.add_argument("--n", type=int, default=4, help="requests per level (per task)")
    args = ap.parse_args()
    chat = make_chat(args.base_url, os.environ.get("TEACHER_API_KEY"), 0.7, 600)
    recs = gen_inputs.generate(NAMING, args.n, 99) + gen_inputs.generate(AUTOPSY, args.n, 99)
    prompts = [teacher_prompt(r["task"], r) for r in recs]
    chat(prompts[0])  # warm up
    levels = [run_level(chat, prompts, c) for c in (1, 2, 4)]
    print(json.dumps(levels, indent=1))
    # quality sample from last level
    ok = 0
    for r, p in zip(recs, prompts):
        text, _, _ = chat(p)
        ok += validate(r["task"], r, text)[0] is not None
    print(f"validator pass on {len(recs)} bench prompts: {ok}/{len(recs)}")
    if args.out:
        rows = "\n".join(f"| {l['concurrency']} | {l['requests']} | {l['wall_s']} | {l['chunks']} | "
                         f"{l['aggregate_tok_s']} | {l['per_request_tok_s']} |" for l in levels)
        args.out.write_text(
            "# S4: teacher throughput\n\n| concurrency | requests | wall s | chunks | aggregate tok/s | per-request tok/s |\n"
            f"|---|---|---|---|---|---|\n{rows}\n\nValidator pass on bench prompts: {ok}/{len(recs)}\n")


if __name__ == "__main__":
    main()
