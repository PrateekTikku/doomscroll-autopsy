"""Run the teacher (Gemma 4 31B behind an OpenAI-compatible server) over generated inputs.

    export TEACHER_API_KEY=...        # printed by `unsloth run`; llama-server needs none
    uv run python -m gen_teacher --inputs data/pilot/inputs --out data/pilot/raw --concurrency 2

Resumable: records are appended to <out>/<task>.jsonl keyed by input id; ids already present
are skipped. Each output is validated immediately and regenerated once on failure (PDD 9.8).
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from common import AUTOPSY, DATA, NAMING, ROOT, TASKS, append_jsonl, compact_json, read_jsonl
from validators import check_autopsy, parse_naming

DEFAULT_URL = "http://127.0.0.1:8888/v1"
# (text, n_stream_chunks, seconds); n_stream_chunks approximates completion tokens
ChatFn = Callable[[str], tuple[str, int, float]]


def teacher_prompt(task: str, rec: dict) -> str:
    template = (ROOT / "prompts" / f"{task}_teacher.txt").read_text()
    out = template.replace("{input_json}", compact_json(rec["input"]))
    if task == NAMING:
        out = out.replace("{label}", rec["meta"]["label"])
    return out


def make_chat(base_url: str, api_key: str | None, temperature: float, max_tokens: int) -> ChatFn:
    def chat(prompt: str) -> tuple[str, int, float]:
        body = {
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "top_p": 0.95,
            "max_tokens": max_tokens,
            "stream": True,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        req = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json",
                     **({"Authorization": f"Bearer {api_key}"} if api_key else {})},
        )
        t0 = time.time()
        parts: list[str] = []
        chunks = 0
        with urllib.request.urlopen(req, timeout=600) as resp:
            for raw in resp:
                line = raw.decode().strip()
                if not line.startswith("data:") or line.endswith("[DONE]"):
                    continue
                choices = json.loads(line[5:]).get("choices") or [{}]  # final usage chunk has none
                delta = choices[0].get("delta", {})
                piece = delta.get("content")
                if piece:
                    parts.append(piece)
                    chunks += 1
        return "".join(parts), chunks, time.time() - t0

    return chat


def validate(task: str, rec: dict, text: str) -> tuple[str | None, list[str]]:
    """Returns (canonical target or None, errors)."""
    if task == NAMING:
        obj, errs = parse_naming(text, rec["input"], rec["meta"]["label"])
        return (compact_json(obj) if obj and not errs else None), errs
    errs = check_autopsy(text, rec["input"])
    return (text.strip() if not errs else None), errs


def process(task: str, rec: dict, chat: ChatFn, retries: int = 1) -> dict:
    prompt = teacher_prompt(task, rec)
    attempts = []
    for _ in range(retries + 1):
        try:
            text, chunks, secs = chat(prompt)
        except Exception as e:  # network / server hiccup: record and retry
            attempts.append({"error": f"request_failed: {e}", "chunks": 0, "seconds": 0})
            continue
        target, errs = validate(task, rec, text)
        attempts.append({"output": text, "errors": errs, "chunks": chunks, "seconds": round(secs, 2)})
        if target is not None:
            return {"id": rec["id"], "task": task, "ok": True, "target": target, "attempts": attempts}
    return {"id": rec["id"], "task": task, "ok": False, "target": None, "attempts": attempts}


def run(task: str, inputs: list[dict], out_path: Path, chat: ChatFn, concurrency: int,
        limit: int | None = None) -> dict:
    done = {r["id"] for r in read_jsonl(out_path)}
    todo = [r for r in inputs if r["id"] not in done]
    if limit:
        todo = todo[:limit]
    lock = threading.Lock()
    stats = {"done": 0, "ok": 0, "chunks": 0, "gen_seconds": 0.0, "wall_start": time.time()}

    def work(rec):
        res = process(task, rec, chat)
        with lock:
            append_jsonl(out_path, res)
            stats["done"] += 1
            stats["ok"] += int(res["ok"])
            for a in res["attempts"]:
                stats["chunks"] += a.get("chunks", 0)
                stats["gen_seconds"] += a.get("seconds", 0)
            wall = time.time() - stats["wall_start"]
            print(f"[{task}] {stats['done']}/{len(todo)} ok={stats['ok']} "
                  f"~{stats['chunks'] / max(wall, 1e-6):.1f} chunks/s aggregate", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        list(ex.map(work, todo))
    stats["wall_seconds"] = round(time.time() - stats["wall_start"], 1)
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", type=Path, default=DATA / "inputs")
    ap.add_argument("--out", type=Path, default=DATA / "raw")
    ap.add_argument("--task", choices=[*TASKS, "both"], default="both")
    ap.add_argument("--base-url", default=os.environ.get("TEACHER_URL", DEFAULT_URL))
    ap.add_argument("--concurrency", type=int, default=1)
    ap.add_argument("--temperature", type=float, default=0.7)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    key = os.environ.get("TEACHER_API_KEY")
    for task in TASKS:
        if args.task not in (task, "both"):
            continue
        inputs = read_jsonl(args.inputs / f"{task}.jsonl")
        if not inputs:
            continue
        chat = make_chat(args.base_url, key, args.temperature, 700 if task == AUTOPSY else 300)
        stats = run(task, inputs, args.out / f"{task}.jsonl", chat, args.concurrency, args.limit)
        print(json.dumps({"task": task, **stats}))


if __name__ == "__main__":
    main()
