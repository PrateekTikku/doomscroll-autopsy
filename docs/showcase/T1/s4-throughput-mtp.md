# S4: teacher throughput with the MTP drafter

`llama-server`, UD-Q4_K_XL target + `mtp-gemma-4-31B-it-Q8_0.gguf` drafter, `--spec-type draft-mtp`, `-np 1`, concurrency 1, 4 naming + 4 autopsy prompts.

| `--spec-draft-n-max` | wall s | chunks | tok/s | draft acceptance (typical) |
|---|---|---|---|---|
| 3 | 70.5 | 1207 | **17.1** | 0.62-0.82, mean accepted run ~3 |
| 4 | 87.1 | 1206 | 13.9 | n/a |
| (no MTP, for reference) | 119.0 | 1197 | 10.1 | n/a |

Validators passed on all MTP outputs (6/6 on the validity re-check).

## Unsloth Studio 2026.10.5 (after the manual update)

`unsloth run -m unsloth/gemma-4-31B-it-GGUF --gguf-variant UD-Q4_K_XL --disable-tools`: 17.2 tok/s at concurrency 1 and 17.3 at concurrency 4 (same 8 prompts). Studio auto-downloads the drafter and launches with `draft-mtp` (chained with ngram-mod). Thinking off works per request via `chat_template_kwargs`. Output passed the validators.
