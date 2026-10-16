# Model size and speed (T2)
| Artifact | Size |
|---|---|
| Merged HF safetensors (bf16 weights, 268M params) | 536 MB |
| optimum ONNX fp16 (no quantisation) | 873 MB |
| optimum ONNX, 8-bit weights, fp16 activations (first candidate, superseded) | 622 MB |
| optimum ONNX, 4-bit weights (lossy) | 488 MB |
| **genai ONNX, 8-bit weights, fp16 activations, one shared 8-bit vocabulary table (shipped)** | **324 MB** (`model_fp16.onnx` 0.2 MB + `model_fp16.onnx_data` 323.8 MB) |
| published `onnx-community/gemma-3-270m-it-ONNX` q4f16 (base model, for reference) | 273 MB |

Where the 324 MB goes: vocabulary table 168 MB (262,144 x 640 at 8 bits, used for both the input lookup and the output layer), 18 transformer layers 100 MB at 8 bits, fp16 block scales about 50 MB, zero points 5 MB. The tied table is 168M of the 268M parameters, so it dominates every variant. The builder leaves it as a 336 MB fp16 lookup next to an 8-bit copy for the output layer; `export_onnx.py` (`share_embedding_8bit`) points the lookup at the 8-bit copy. Reconstruction error of that table on 20,000 sampled rows: mean relative error 0.7%, worst 1.3%, cosine similarity at least 0.9999.

Total download with EmbeddingGemma 2 q4f16 (255 MB): about **580 MB** (the PDD said about 530 MB).

Speed (headless Chrome, WebGPU, M4 Max, Transformers.js 4.3.1, greedy, 100 eval prompts, prompts up to 408 tokens):

| | genai 8-bit shared (shipped) | optimum 8-bit (superseded) |
|---|---|---|
| Load (cached files) | 1.2 s | 2.2 s |
| Median tokens/s (min to max) | **118 (83 to 156)** | 20.5 (19 to 27) |
| Median time per output | 0.45 s | 2.3 s |
| Slowest output | 3.2 s | 13.9 s |

Peak GPU or process memory during generation was not measured; M6 should record it (the vocabulary is 262k, so every step produces 262,144 logits).
Training: 732 steps in about 15 minutes, peak 2.1 GB.
