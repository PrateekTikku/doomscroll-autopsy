"""Merged HF safetensors -> ONNX folder that Transformers.js loads (PDD 10.5).

    uv run --group export python export_onnx.py <merged_dir> <out_dir> [--builder genai|optimum] [--bits 8|4]

`--builder genai` (default, 324 MB, ~120 tok/s in the browser): onnxruntime-genai's model builder
(fused GroupQueryAttention, fp16 activations, 8-bit MatMulNBits), then one graph edit: the builder
leaves the 262k x 640 vocabulary table as a 336 MB fp16 lookup next to an 8-bit copy for the output
layer; `share_embedding_8bit` replaces the lookup with a GatherBlockQuantized over the 8-bit copy.
Written to `onnx/model_fp16.onnx` (+ `.onnx_data`), loaded with `dtype: "fp16"`.

`--builder optimum` (622 MB, ~21 tok/s): optimum fp32 export, fp16 conversion with norms and residual
adds kept in fp32 (Gemma 3 overflows fp16 otherwise), then MatMulNBits. Kept for comparison.

`--bits 4` loses too much quality with either builder (docs/showcase/T2/s5-notes.md).
"""
import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper
from onnxruntime.transformers.float16 import convert_float_to_float16
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer


def export_fp32(merged: Path, work: Path) -> Path:
    subprocess.run(
        ["optimum-cli", "export", "onnx", "--model", str(merged),
         "--task", "text-generation-with-past", str(work)],
        check=True,
    )
    return work / "model.onnx"


def quantize(src: Path, dst: Path, bits: int = 8, block_size: int = 32) -> None:
    model = onnx.load(str(src))
    quant = MatMulNBitsQuantizer(model, bits=bits, block_size=block_size, is_symmetric=True, accuracy_level=4)
    quant.process()
    quant.model.save_model_to_file(str(dst), use_external_data_format=False)


def strip_norm_casts(model: onnx.ModelProto) -> int:
    """Remove the identity Cast(to=float32) nodes around each RMSNorm.

    In the fp32 graph they do nothing, but the fp16 converter rewrites them to Cast(to=fp16),
    which makes the squared activations overflow.
    """
    drop = {n.output[0]: n.input[0] for n in model.graph.node
            if n.op_type == "Cast" and "norm" in n.name.lower()
            and any(a.name == "to" and a.i == onnx.TensorProto.FLOAT for a in n.attribute)}
    for n in model.graph.node:
        for i, name in enumerate(n.input):
            while name in drop:
                name = drop[name]
            n.input[i] = name
    keep = [n for n in model.graph.node if not (n.op_type == "Cast" and n.output[0] in drop)]
    del model.graph.node[:]
    model.graph.node.extend(keep)
    return len(drop)


def collapse_cast_pairs(model: onnx.ModelProto) -> int:
    """Collapse fp32 -> Cast(fp16) -> Cast(fp32) into the original fp32 tensor.

    The converter wraps every blocked node in its own casts; between two blocked nodes the value
    would otherwise be squeezed through fp16 and overflow again.
    """
    FP16, FP32 = onnx.TensorProto.FLOAT16, onnx.TensorProto.FLOAT
    to = lambda n: next((a.i for a in n.attribute if a.name == "to"), None)
    by_out = {n.output[0]: n for n in model.graph.node if n.op_type == "Cast"}
    alias = {}
    for n in model.graph.node:
        if n.op_type == "Cast" and to(n) == FP32:
            up = by_out.get(n.input[0])
            if up is not None and to(up) == FP16:
                alias[n.output[0]] = up.input[0]
    for n in model.graph.node:
        for i, name in enumerate(n.input):
            if name in alias:
                n.input[i] = alias[name]
    # drop casts that are no longer used
    used = {i for n in model.graph.node for i in n.input} | {o.name for o in model.graph.output}
    keep = [n for n in model.graph.node if not (n.op_type == "Cast" and n.output[0] not in used)]
    del model.graph.node[:]
    model.graph.node.extend(keep)
    # the converter can emit identical casts that define one tensor more than once: keep the first
    defined: set[str] = set()
    uniq = []
    for n in model.graph.node:
        if n.op_type == "Cast" and n.output[0] in defined:
            continue
        defined.update(n.output)
        uniq.append(n)
    del model.graph.node[:]
    model.graph.node.extend(uniq)
    seen: set[str] = set()
    for n in model.graph.node:
        base, k = n.name, 1
        while n.name in seen:
            n.name = f"{base}_dup{k}"
            k += 1
        seen.add(n.name)
    return len(alias)


def to_fp16(src: Path, dst: Path) -> None:
    model = onnx.load(str(src))
    print(f"stripped {strip_norm_casts(model)} norm casts")
    # Gemma's residual stream and RMSNorm squares exceed the fp16 range, so every norm and every
    # residual add stays in fp32 (the converter inserts casts around blocked nodes).
    residual = re.compile(r"^/model/layers\.\d+/Add(_\d+)?$")
    norm_nodes = [n.name for n in model.graph.node
                  if "norm" in n.name.lower() or (n.op_type == "Add" and residual.match(n.name))]
    model = convert_float_to_float16(model, keep_io_types=False, disable_shape_infer=False,
                                     node_block_list=norm_nodes)
    print(f"collapsed {collapse_cast_pairs(model)} cast pairs")
    onnx.save(model, str(dst))


# --------------------------------------------------------------------------- genai builder

def _patched_builder(dst: Path) -> Path:
    """Copy onnxruntime-genai's builder scripts to `dst` and patch them for transformers 4.57.

    0.18.0 imports model classes that only exist in transformers 5 (needed for other architectures,
    never touched for Gemma 3) and iterates `config.rope_scaling`, which is null for Gemma 3 270M.
    The installed package is not modified.
    """
    spec = importlib.util.find_spec("onnxruntime_genai")
    src = Path(spec.submodule_search_locations[0]) / "models"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
    base = dst / "builders" / "base.py"
    text = base.read_text()
    m = re.search(r"from transformers import \((.*?)\n\)\n", text, re.S)
    names = [n.strip().rstrip(",") for n in m.group(1).split("\n") if n.strip()]
    stub = "import transformers as _t\n" + "".join(
        f"{n} = getattr(_t, '{n}', type('{n}', (), {{}}))\n" for n in names)
    text = text.replace(m.group(0), stub).replace("for key in rope_scaling:", "for key in (rope_scaling or {}):")
    base.write_text(text)
    mistral = dst / "builders" / "mistral.py"
    mistral.write_text(mistral.read_text().replace(
        "from transformers import Mistral3ForConditionalGeneration",
        "import transformers as _t\nMistral3ForConditionalGeneration = getattr(_t, 'Mistral3ForConditionalGeneration', type('M', (), {}))"))
    return dst / "builder.py"


def build_genai(merged: Path, work: Path, bits: int) -> Path:
    with tempfile.TemporaryDirectory() as tmp:
        builder = _patched_builder(Path(tmp) / "models")
        subprocess.run([sys.executable, str(builder), "-m", str(merged), "-o", str(work),
                        "-p", f"int{bits}", "-e", "webgpu", "-c", str(Path(tmp) / "hf_cache")], check=True)
    return work / "model.onnx"


def share_embedding_8bit(model: onnx.ModelProto) -> int:
    """Replace the fp16 embedding Gather by a GatherBlockQuantized over the output layer's 8-bit weights.

    Gemma ties the input and output embeddings. MatMulNBits stores the head as uint8 [V, K/32, 32]
    with fp16 scales [V, K/32] and an implicit zero point of 128; the lookup reads the same bytes
    reshaped to [V, K]. Returns the number of bytes removed from the weights.
    """
    g = model.graph
    gather = next(n for n in g.node if n.name == "/model/embed_tokens/Gather")
    table = next(t for t in g.initializer if t.name == gather.input[0])
    head = next(t for t in g.initializer if t.name == "lm_head.MatMul.weight_Q8")
    scales = next(t for t in g.initializer if t.name == "lm_head.MatMul.weight_scales")
    vocab, blocks = scales.dims
    k = head.dims[1] * head.dims[2]
    g.initializer.extend([
        numpy_helper.from_array(np.array([vocab, k], dtype=np.int64), "emb_q_shape"),
        numpy_helper.from_array(np.full((vocab, blocks), 128, dtype=np.uint8), "emb_q_zp"),
    ])
    new = [
        helper.make_node("Reshape", [head.name, "emb_q_shape"], ["emb_q"], name="/model/embed_tokens/ReshapeQ"),
        helper.make_node("GatherBlockQuantized", ["emb_q", gather.input[1], scales.name, "emb_q_zp"], list(gather.output),
                         name="/model/embed_tokens/GatherBlockQuantized", domain="com.microsoft",
                         bits=8, block_size=k // blocks, gather_axis=0, quantize_axis=1),
    ]
    nodes = list(g.node)
    i = nodes.index(gather)
    nodes[i:i + 1] = new
    del g.node[:]
    g.node.extend(nodes)
    removed = vocab * k * 2
    keep = [t for t in g.initializer if t.name != table.name]
    del g.initializer[:]
    g.initializer.extend(keep)
    return removed


def pin_kv_dim(model: onnx.ModelProto, head_dim: int) -> int:
    """The builder leaves the KV head size as a named dimension; Transformers.js then feeds 0 for it."""
    n = 0
    for v in list(model.graph.input) + list(model.graph.output) + list(model.graph.value_info):
        for d in v.type.tensor_type.shape.dim:
            if d.dim_param == "kv_cache_dim":
                d.dim_value = head_dim
                n += 1
    return n


def finish_genai(built: Path, final: Path, head_dim: int, bits: int) -> None:
    model = onnx.load(str(built))  # pulls in the external weights
    print(f"pinned {pin_kv_dim(model, head_dim)} kv dims")
    if bits == 8:
        print(f"shared embedding: removed {share_embedding_8bit(model) / 1e6:.0f} MB fp16 table")
    onnx.save(model, str(final), save_as_external_data=True, all_tensors_to_one_file=True,
              location=final.name + "_data", size_threshold=1024)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("merged", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--keep-work", action="store_true")
    ap.add_argument("--bits", type=int, choices=(4, 8), default=8)
    ap.add_argument("--builder", choices=("genai", "optimum"), default="genai")
    args = ap.parse_args()

    work = args.out / "_work"
    work.mkdir(parents=True, exist_ok=True)
    onnx_dir = args.out / "onnx"
    onnx_dir.mkdir(exist_ok=True)

    if args.builder == "genai":
        built = build_genai(args.merged, work, args.bits)
        cfg = json.loads((args.merged / "config.json").read_text())
        final = onnx_dir / ("model_fp16.onnx" if args.bits == 8 else "model_q4f16.onnx")
        finish_genai(built, final, cfg.get("head_dim", 256), args.bits)
        src = args.merged
        extra = final.with_name(final.name + "_data")
    else:
        fp32 = export_fp32(args.merged, work)
        # fp16 first, then quantise: the MatMulNBits contrib op then takes fp16 activations directly.
        fp16 = work / "model_fp16.onnx"
        to_fp16(fp32, fp16)
        final = onnx_dir / ("model_fp16.onnx" if args.bits == 8 else "model_q4f16.onnx")
        quantize(fp16, final, bits=args.bits)
        src = work
        extra = None

    for name in ("config.json", "generation_config.json", "tokenizer.json",
                 "tokenizer_config.json", "special_tokens_map.json", "chat_template.jinja"):
        if (work / name).exists():
            shutil.copy(work / name, args.out / name)
        elif (src / name).exists():
            shutil.copy(src / name, args.out / name)
    # Transformers.js reads the chat template from tokenizer_config.json, not chat_template.jinja.
    tpl = args.out / "chat_template.jinja"
    cfg_path = args.out / "tokenizer_config.json"
    if tpl.exists() and cfg_path.exists():
        data = json.loads(cfg_path.read_text())
        data["chat_template"] = tpl.read_text()
        cfg_path.write_text(json.dumps(data, ensure_ascii=False))
    if args.builder == "genai":
        # the KV cache is fp16 (the activations are), which Transformers.js must be told
        mc = json.loads((args.out / "config.json").read_text())
        mc["transformers.js_config"] = {"use_external_data_format": True,
                                        "kv_cache_dtype": {"fp16": "float16", "q4f16": "float16"}}
        (args.out / "config.json").write_text(json.dumps(mc, indent=2))
    if not args.keep_work:
        shutil.rmtree(work)
    size = (final.stat().st_size + (extra.stat().st_size if extra else 0)) / 1e6
    print(f"wrote {final} ({size:.0f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
