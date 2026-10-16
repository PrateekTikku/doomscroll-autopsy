# T2 capture list (owner)
- Terminal: `unsloth train` progress lines (loss falling from ~1.2 to ~0.25) or a plot of `training-curve.csv`.
- Browser: `cd training && HEADED=1 DTYPE=fp16 node onnx_test/run.mjs data/runs/run1/onnx_final data/runs/run1/cases_eval.json /tmp/out.json` and screenshot the generation (about 120 tok/s: a whole autopsy appears in 1-3 s).
- Side-by-side from `training/eval/review_20.md`: one naming and one autopsy where the template baseline, the fine-tuned model and the teacher differ. Best story: `autopsy-1-0336` (the model invents a trigger that the facts do not contain) next to a clean one.
- The comparison table in `docs/showcase/T2/eval-table.md` and the build sweep in `s5-notes.md` ("a 270M model is too small for plain 4-bit; the same model got 6x faster by changing the export path").
