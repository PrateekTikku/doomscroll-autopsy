"""LoRA fine-tune of Gemma 3 270M on T1's train.jsonl (PDD 10.3), merge, and save safetensors.

    uv run python finetune.py [--epochs 3] [--lr 2e-4] [--tag run1]

Uses the scripted Unsloth CLI from Unsloth Studio (MLX backend on Apple Silicon; spike S5). Writes
    data/runs/<tag>/adapter/   MLX LoRA adapter
    data/runs/<tag>/merged/    merged HF safetensors (input to export_onnx.py and eval)
    data/runs/<tag>/curve.csv  step,loss,grad,lr,tok_s
"""
import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
BASE = "unsloth/gemma-3-270m-it"
STEP = re.compile(r"Step (\d+)/(\d+) \| Loss: ([\d.]+) \| Grad: ([\d.]+) \| LR: ([\d.e+-]+) \| Tok/s: (\d+)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=Path, default=HERE / "data/train.jsonl")
    ap.add_argument("--tag", default="run1")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--alpha", type=int, default=32)
    ap.add_argument("--batch-size", type=int, default=4)
    ap.add_argument("--max-steps", type=int, default=-1)
    ap.add_argument("--seed", type=int, default=3407)
    args = ap.parse_args()

    run = HERE / "data/runs" / args.tag
    run.mkdir(parents=True, exist_ok=True)
    data = run / "train_messages.jsonl"
    with args.train.open() as src, data.open("w") as dst:
        for line in src:
            dst.write(json.dumps({"messages": json.loads(line)["messages"]}, ensure_ascii=False) + "\n")

    adapter = run / "adapter"
    cmd = ["unsloth", "train", "--model", BASE, "--local-dataset", str(data), "--format-type", "auto",
           "--training-type", "lora", "--max-seq-length", "2048", "--no-load-in-4bit",
           "--num-epochs", str(args.epochs), "--batch-size", str(args.batch_size),
           "--gradient-accumulation-steps", "1", "--learning-rate", str(args.lr),
           "--lora-r", str(args.rank), "--lora-alpha", str(args.alpha), "--random-seed", str(args.seed),
           "--train-on-completions", "--output-dir", str(adapter)]
    if args.max_steps > 0:
        cmd += ["--max-steps", str(args.max_steps)]
    print(" ".join(cmd), flush=True)
    with (run / "train.log").open("w") as log, (run / "curve.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["step", "loss", "grad", "lr", "tok_s"])
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        assert proc.stdout
        for line in proc.stdout:
            log.write(line)
            m = STEP.search(line)
            if m:
                w.writerow([m[1], m[3], m[4], m[5], m[6]])
                f.flush()
                if int(m[1]) % 25 == 0:
                    print(line.strip(), flush=True)
        if proc.wait() != 0:
            print("training failed; see", run / "train.log")
            return 1

    # Studio writes merged exports under ~/.unsloth/studio/exports/<output_dir as given>
    rel = Path("data/runs") / args.tag / "merged_studio"  # relative: Studio nests it under exports/
    exp = ["unsloth", "export", str(adapter), str(rel), "-f", "merged-16bit", "--no-load-in-4bit"]
    subprocess.run(exp, check=True, cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    studio = Path.home() / ".unsloth/studio/exports" / rel
    merged = run / "merged"
    if merged.exists():
        shutil.rmtree(merged)
    shutil.copytree(studio, merged)
    print("merged model:", merged)
    return 0


if __name__ == "__main__":
    sys.exit(main())
