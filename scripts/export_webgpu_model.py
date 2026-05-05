#!/usr/bin/env python3
"""
W20.H.4-pre — Patch YOLOv8n ONNX for WebGPU (ONNX Runtime Web) compatibility.

Problem:
  YOLOv8's DFL head exports a Softmax with axis=1 on a [1, 16, N] tensor.
  ONNX Runtime WebGPU only supports Softmax on the LAST (innermost) axis.
  Result: the session loads fine but the first inference call throws:
    "Softmax: axis=1 not supported on WebGPU EP — only last axis is valid"

Fix (option A — transpose wrap):
  Insert Transpose([0,2,1]) → Softmax(axis=-1) → Transpose([0,2,1]) around
  each offending Softmax node.  Mathematically identical; WebGPU happy.

Fix (option B — simple axis=-1):
  If the Softmax tensor only has 2 meaningful dimensions (batch squeezed),
  flipping axis to -1 is equivalent.  We try B first (cheaper), fall back to A.

Usage:
    pip install onnx onnxsim requests
    python scripts/export_webgpu_model.py
    # outputs: public/models/yolov8n_webgpu.onnx

Advanced:
    python scripts/export_webgpu_model.py \\
        --input  path/to/yolov8n.onnx \\
        --output path/to/yolov8n_webgpu.onnx \\
        --no-sim          # skip onnxsim simplification pass
        --strategy B      # force simple-axis strategy (skip transpose wrap)

After patching, host the file in Supabase Storage / CDN and update
YOLO_MODEL_URL in ProStudioBench.jsx + useOnnxInference.js.
"""

import argparse
import copy
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_MODEL_URL = (
    "https://cdn.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/"
    "public/model/yolov8n.onnx"
)
DEFAULT_OUTPUT = Path(__file__).parent.parent / "public" / "models" / "yolov8n_webgpu.onnx"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {url} …", end="", flush=True)
    urllib.request.urlretrieve(url, dest)
    size_mb = dest.stat().st_size / 1_048_576
    print(f" {size_mb:.1f} MB")


def inspect_softmax_nodes(model) -> list:
    """Return list of (node_index, node) for every Softmax node, with axis info."""
    results = []
    for i, node in enumerate(model.graph.node):
        if node.op_type == "Softmax":
            axis = next((a.i for a in node.attribute if a.name == "axis"), 1)
            results.append((i, node, axis))
    return results


def ndim_of_output(model, output_name: str) -> int | None:
    """Best-effort rank lookup from value_info + output list."""
    import onnx
    for vi in list(model.graph.value_info) + list(model.graph.output):
        if vi.name == output_name:
            t = vi.type.tensor_type
            if t.HasField("shape"):
                return len(t.shape.dim)
    return None


def strategy_b(model) -> tuple[object, int]:
    """Try simple axis flip: axis=1 → axis=-1.  Only safe on 2-D tensors."""
    import onnx
    patched = 0
    m = copy.deepcopy(model)
    for node in m.graph.node:
        if node.op_type != "Softmax":
            continue
        axis_attr = next((a for a in node.attribute if a.name == "axis"), None)
        current_axis = axis_attr.i if axis_attr else 1
        if current_axis == -1 or current_axis == (
            ndim_of_output(m, node.output[0]) or 999
        ) - 1:
            continue  # already last axis
        # Check rank — only flip if 2D
        rank = ndim_of_output(m, node.input[0])
        if rank == 2:
            if axis_attr is None:
                axis_attr = m.graph.node[list(m.graph.node).index(node)].attribute.add()
                axis_attr.name = "axis"
                axis_attr.i = -1
            else:
                axis_attr.i = -1
            patched += 1
    return m, patched


def strategy_a(model) -> tuple[object, int]:
    """
    Transpose-wrap strategy: for each Softmax(axis=k) where k != last dim,
    insert Transpose → Softmax(axis=-1) → Transpose.

    Supports 3-D tensors [B, C, N] with axis=1.
    """
    import onnx
    from onnx import helper, TensorProto

    m = copy.deepcopy(model)
    nodes_to_replace: list[tuple[int, object]] = []

    for idx, node in enumerate(m.graph.node):
        if node.op_type != "Softmax":
            continue
        axis_attr = next((a for a in node.attribute if a.name == "axis"), None)
        axis = axis_attr.i if axis_attr else 1
        rank = ndim_of_output(m, node.input[0]) or 3

        last_axis = rank - 1
        if axis == -1 or axis == last_axis:
            continue  # already fine

        # For [B, C, N] axis=1 → perm [0,2,1] → softmax(axis=-1) → perm [0,2,1]
        if rank == 3 and axis == 1:
            perm = [0, 2, 1]
        elif rank == 4 and axis == 1:
            perm = [0, 2, 3, 1]
        else:
            print(f"  ⚠ Unsupported rank={rank} axis={axis} on node {node.name!r} — skipped")
            continue

        nodes_to_replace.append((idx, node, perm))

    if not nodes_to_replace:
        return m, 0

    # Build replacement node list (we rebuild the whole list to preserve order)
    new_nodes = []
    replace_at = {idx: (orig, perm) for idx, orig, perm in nodes_to_replace}
    uid = 0

    for idx, node in enumerate(m.graph.node):
        if idx not in replace_at:
            new_nodes.append(node)
            continue

        orig, perm = replace_at[idx]
        base = orig.name or f"softmax_{uid}"
        uid += 1
        t1 = f"{base}_pre_T"
        sm = f"{base}_sm_out"

        # Transpose in
        pre = helper.make_node("Transpose", [orig.input[0]], [t1],
                               name=f"{base}_preT", perm=perm)
        # Softmax on last axis
        sf = helper.make_node("Softmax", [t1], [sm],
                              name=f"{base}_sfmax", axis=-1)
        # Transpose back
        post = helper.make_node("Transpose", [sm], [orig.output[0]],
                                name=f"{base}_postT", perm=perm)
        new_nodes.extend([pre, sf, post])

    del m.graph.node[:]
    m.graph.node.extend(new_nodes)
    return m, len(nodes_to_replace)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Patch YOLOv8n ONNX for WebGPU")
    ap.add_argument("--input",    default=None,
                    help="Path to source ONNX.  Downloads from CDN if omitted.")
    ap.add_argument("--output",   default=str(DEFAULT_OUTPUT))
    ap.add_argument("--no-sim",   action="store_true",
                    help="Skip onnxsim simplification pass")
    ap.add_argument("--strategy", choices=["A", "B", "auto"], default="auto",
                    help="Patch strategy: B=axis flip, A=transpose-wrap, auto=B then A")
    args = ap.parse_args()

    try:
        import onnx
    except ImportError:
        sys.exit("Install onnx first:  pip install onnx")

    # ---- Load ----
    src_path = Path(args.input) if args.input else Path(__file__).parent / "_yolov8n_src.onnx"
    if not src_path.exists():
        if args.input:
            sys.exit(f"Input not found: {args.input}")
        download(DEFAULT_MODEL_URL, src_path)

    print(f"Loading {src_path} …")
    model = onnx.load(str(src_path))

    nodes = inspect_softmax_nodes(model)
    print(f"Found {len(nodes)} Softmax node(s):")
    for _, n, ax in nodes:
        print(f"  {n.name!r:40s}  axis={ax}  input={n.input[0]!r}")

    non_last = [(i, n, ax) for i, n, ax in nodes if ax not in (-1,)]
    if not non_last:
        print("No non-last-axis Softmax nodes — model is already WebGPU-compatible.")
    else:
        print(f"\n{len(non_last)} node(s) need patching …")

        patched_model, count = None, 0

        if args.strategy in ("B", "auto"):
            patched_model, count = strategy_b(model)
            if count:
                print(f"  Strategy B (axis flip): patched {count} node(s)")
            else:
                print("  Strategy B: no 2-D Softmax found")

        remaining = [
            n for n in inspect_softmax_nodes(patched_model or model)
            if n[2] not in (-1,)
        ]
        if remaining and args.strategy in ("A", "auto"):
            patched_model, count_a = strategy_a(patched_model or model)
            count += count_a
            print(f"  Strategy A (transpose-wrap): patched {count_a} node(s)")

        if not count:
            print("  No patches applied — check model manually.")
            sys.exit(1)

        model = patched_model

    # ---- Optional simplification ----
    if not args.no_sim:
        try:
            from onnxsim import simplify as onnxsim
            print("Running onnxsim …")
            model, ok = onnxsim(model)
            print(f"  onnxsim: {'OK' if ok else 'skipped (not simplified)'}")
        except ImportError:
            print("  onnxsim not installed — skipping (pip install onnxsim for smaller output)")

    # ---- Validate ----
    onnx.checker.check_model(model)
    print("ONNX checker: OK")

    # ---- Save ----
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(out))
    size_mb = out.stat().st_size / 1_048_576
    print(f"\nSaved → {out}  ({size_mb:.1f} MB)")
    print("\nNext steps:")
    print("  1. Upload yolov8n_webgpu.onnx to Supabase Storage or CDN")
    print("  2. Update YOLO_MODEL_URL in:")
    print("       src/pages/admin/ProStudioBench.jsx")
    print("       src/lib/proStudio/useOnnxInference.js")
    print("  3. Re-run ProStudioBench — WebGPU EP should now load successfully")


if __name__ == "__main__":
    main()
