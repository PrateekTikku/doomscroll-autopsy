# training/

Teacher data, fine-tuning, evaluation and ONNX export for Doomscroll Autopsy (PDD section 10). T1 covers teacher data.

## T1 pipeline

```
gen_inputs.py  →  gen_teacher.py  →  filter.py  →  data/train.jsonl, data/eval.jsonl
(synthetic        (Gemma 4 31B via     (re-validate, dedupe,
 inputs)           OpenAI-style API)    900/100 split)
```

1. **Serve the teacher** (local, 127.0.0.1 only) with raw `llama-server` plus the **MTP drafter** (spike S4: 17 tok/s vs 10 without). The drafter is a separate 515 MB file and is not in the HF cache by default:
   ```
   mkdir -p data/models && curl -L -o data/models/mtp-gemma-4-31B-it-Q8_0.gguf \
     https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/MTP/mtp-gemma-4-31B-it-Q8_0.gguf
   G=$(ls ~/.cache/huggingface/hub/models--unsloth--gemma-4-31B-it-GGUF/snapshots/*/gemma-4-31B-it-UD-Q4_K_XL.gguf)
   ~/.unsloth/llama.cpp/build/bin/llama-server -m "$G" --model-draft data/models/mtp-gemma-4-31B-it-Q8_0.gguf \
     --spec-type draft-mtp --spec-draft-n-max 3 --host 127.0.0.1 --port 8889 -np 1 -c 8192 \
     --flash-attn on --jinja --chat-template-kwargs '{"enable_thinking": false}'
   ```
   Stop it with `pkill -f "llama-server -m"`. Unsloth Studio works too once updated to 2026.10.5 (see S4 for the update workaround): `unsloth run -m unsloth/gemma-4-31B-it-GGUF --gguf-variant UD-Q4_K_XL --disable-tools` auto-downloads the drafter and enables MTP (17 tok/s); set `TEACHER_API_KEY` to the key it prints and `TEACHER_URL=http://127.0.0.1:8888/v1`.
2. `uv run python -m gen_inputs --naming 660 --autopsy 440 --seed 1 --out data/inputs`
3. `TEACHER_URL=http://127.0.0.1:8889/v1 uv run python -m gen_teacher --inputs data/inputs --out data/raw --concurrency 1` (resumable: rerun the same command).
4. `uv run python -m filter` (`--partial` for a train-only snapshot while the run is in progress, `--pilot` for the 10-example pilot).

Pilot: same commands with `--out data/pilot/...`; see `docs/showcase/T1/pilot-report.md`.

## Contracts other lanes depend on

- **Student prompt** (`common.student_prompt`): `STUDENT_INSTRUCTION[task]` + blank line + the input as compact JSON (`separators=(",",":")`, keys in the schema's property order, `ensure_ascii=False`). M6 must build exactly this string at runtime. Pinned by `tests/test_pipeline.py::test_student_prompt_golden`.
- **Targets:** naming = compact JSON `{"name","suggested_label","why"}`; autopsy = plain text, 120-180 words, no markdown.
- **Validators** (`validators.py`): `parse_naming`, `check_autopsy`. Reused by T2 (evaluation) and ported to TypeScript in M6 (K-01: no runtime Ajv).
- **Example format** (`train.jsonl` / `eval.jsonl`): `{"task","id","persona","meta","messages":[{"role":"user",...},{"role":"assistant",...}]}`.

## T2 pipeline (fine-tune, evaluate, export)

```
finetune.py  →  data/runs/<tag>/merged   →  export_onnx.py  →  onnx_test/run.mjs (browser check)
                       │                                              │
              eval.gen_hf (fp32)                         data/eval_out/ft_onnx_final.jsonl
                       └→ eval.build_outputs / eval.judge / eval.report → eval/report.md, eval/review_20.md
```

1. `uv run python finetune.py --tag run1` (scripted Unsloth CLI from Studio; MLX backend; ~15 min for 732 steps; writes `curve.csv` and the merged HF model). Needs Unsloth Studio 2026.10.5 on PATH (`unsloth`).
2. `uv run --group export python export_onnx.py data/runs/run1/merged data/runs/run1/onnx_final` (default `--builder genai`: onnxruntime-genai builder, 8-bit weights, one shared 8-bit vocabulary table; 324 MB, `onnx/model_fp16.onnx`). `--builder optimum` is the older 622 MB route; `--bits 4` loses too much quality with either (see S5 in `experiments/spikes.md`).
3. `DTYPE=fp16 node onnx_test/run.mjs data/runs/run1/onnx_final data/runs/run1/cases_eval.json out.json` loads the ONNX in headless Chrome on WebGPU (Transformers.js 4.3.1 from `extension/node_modules`) and generates all 100 eval prompts (about 118 tok/s).
4. Eval: `uv run --group export python -m eval.build_outputs`, `... -m eval.gen_hf <model> data/eval_out/<system>.jsonl`; turn the browser output into `data/eval_out/ft_onnx_final.jsonl` (`{id, task, text}` per line); serve the 31B (command above) and `uv run python -m eval.judge --systems baseline base ft ft_onnx_final teacher`, then `uv run python -m eval.report`.

Generation settings that were evaluated (M6 must use the same): chat template applied to the single user turn, greedy decoding, `max_new_tokens` 120 (naming) / 400 (autopsy).

## Tests

`uv run pytest`
