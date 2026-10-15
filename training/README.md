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

## Tests

`uv run pytest`
