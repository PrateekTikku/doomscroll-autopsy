"""Write data/eval_out/{baseline,teacher}.jsonl from eval.jsonl (the other systems come from gen_hf / the browser)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval.baselines import baseline_name, template_autopsy  # noqa: E402
from eval.metrics import load_eval  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data/eval_out"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    items = load_eval(Path(__file__).resolve().parent.parent / "data/eval.jsonl")
    with (OUT / "baseline.jsonl").open("w") as b, (OUT / "teacher.jsonl").open("w") as t:
        for it in items:
            if it["task"] == "naming":
                text = json.dumps({"name": baseline_name(it["input"]), "suggested_label": None, "why": ""})
            else:
                text = template_autopsy(it["input"])
            b.write(json.dumps({"id": it["id"], "task": it["task"], "text": text}) + "\n")
            t.write(json.dumps({"id": it["id"], "task": it["task"], "text": it["teacher"]}) + "\n")
    print(f"wrote {len(items)} items to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
