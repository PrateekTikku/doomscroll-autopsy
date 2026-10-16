"""Generate eval outputs with a Hugging Face checkpoint (greedy, fp32).

    uv run --group export python -m eval.gen_hf <model_dir_or_id> <out.jsonl> [--limit N]

Same prompt and decoding as the browser (apply the chat template to the user turn, greedy).
Resumable: ids already in out.jsonl are skipped.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval.metrics import load_eval  # noqa: E402

MAX_NEW = {"naming": 120, "autopsy": 400}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("out", type=Path)
    ap.add_argument("--eval", type=Path, default=Path(__file__).resolve().parent.parent / "data/eval.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--device", default="mps")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.float32).to(args.device).eval()
    items = load_eval(args.eval)
    if args.limit:
        items = items[: args.limit]
    done = {json.loads(l)["id"] for l in args.out.read_text().splitlines()} if args.out.exists() else set()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("a") as f:
        for it in items:
            if it["id"] in done:
                continue
            ids = tok.apply_chat_template([{"role": "user", "content": it["prompt"]}],
                                          add_generation_prompt=True, return_tensors="pt", return_dict=True)
            ids = {k: v.to(args.device) for k, v in ids.items()}
            t0 = time.time()
            with torch.no_grad():
                out = model.generate(**ids, max_new_tokens=MAX_NEW[it["task"]], do_sample=False)
            new = out[0, ids["input_ids"].shape[1]:]
            text = tok.decode(new, skip_special_tokens=True).strip()
            f.write(json.dumps({"id": it["id"], "task": it["task"], "text": text,
                                "tokens": int(new.shape[0]), "seconds": round(time.time() - t0, 2)},
                               ensure_ascii=False) + "\n")
            f.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
