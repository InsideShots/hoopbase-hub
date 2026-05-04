#!/usr/bin/env python3
"""
W20.H.9 — Gemini second-opinion auditor.

Reads target files (and optionally a git diff vs main) and prints them in a
single Markdown blob ready to paste into Gemini for an independent review.

Use case: Pro Studio generates non-trivial code (FFmpeg concat command
construction, perspective-transform math, ONNX tensor layout). Mark wants
a non-Claude second pair of eyes to verify the math + spot inefficiencies
before shipping.

Usage:
  python scripts/gemini_helper.py path/to/file1.js path/to/file2.py
  python scripts/gemini_helper.py --diff src/lib/proStudio/   # diff vs origin/main
  python scripts/gemini_helper.py --w20-h-3                   # canned set: FFmpeg pipeline files

Outputs to stdout. Pipe to clip:
  python scripts/gemini_helper.py src/hooks/useHomography.js | clip   # Windows
  python scripts/gemini_helper.py src/hooks/useHomography.js | pbcopy # macOS
"""

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Canned bundles for common audits — extend as new W20.H tasks ship.
BUNDLES = {
    "w20-h-3": [
        "src/pages/ProStudioBench.jsx",         # FFmpeg.wasm concat usage
        "docs/PRO_STUDIO.md",
    ],
    "w20-h-6": [
        "src/hooks/useHomography.js",
        "docs/PRO_STUDIO.md",
    ],
    "w20-h-2": [
        "src/lib/proStudio/quarterBucket.js",
        "supabase/migrations/032_pro_studio_quarter_buckets.sql",
    ],
}

PROMPT_TEMPLATE = """You are a senior engineer reviewing code for an Australian basketball video-analysis tool that runs entirely in the browser (zero server cost).

Project context: docs/PRO_STUDIO.md (architecture). Stack: React, Vite, Supabase, FFmpeg.wasm, ONNX Runtime Web, OpenCV.js.

Please audit the files below for:
1. Correctness — esp. math (homography, tensor layouts, FFmpeg arg order, coordinate systems)
2. Memory / perf footprint (must run on a 16 GB MacBook Air)
3. Failure modes not handled
4. Anything brittle, over-engineered, or that should be simpler

Be specific. Quote line numbers. Don't restate what the code does — only flag concerns.

---

"""


def run_git(*args):
    res = subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        print(f"[git error] {res.stderr.strip()}", file=sys.stderr)
        return ""
    return res.stdout


def file_block(path: Path) -> str:
    rel = path.relative_to(REPO_ROOT) if path.is_absolute() else path
    lang = {"py": "python", "js": "javascript", "jsx": "jsx", "ts": "typescript",
            "tsx": "tsx", "sql": "sql", "md": "markdown"}.get(path.suffix.lstrip("."), "")
    try:
        body = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"### {rel}\n\n_(binary or non-UTF8, skipped)_\n\n"
    return f"### {rel}\n\n```{lang}\n{body}\n```\n\n"


def diff_block(path_or_dir: str) -> str:
    diff = run_git("diff", "origin/main", "--", path_or_dir)
    if not diff.strip():
        return f"### diff {path_or_dir} vs origin/main\n\n_(no changes)_\n\n"
    return f"### diff {path_or_dir} vs origin/main\n\n```diff\n{diff}\n```\n\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("targets", nargs="*", help="Files or globs")
    parser.add_argument("--diff", action="store_true", help="Emit git diff vs origin/main instead of full files")
    for bundle in BUNDLES:
        parser.add_argument(f"--{bundle}", action="store_true", help=f"Canned bundle: {', '.join(BUNDLES[bundle])}")
    args = parser.parse_args()

    paths = list(args.targets)
    for bundle, files in BUNDLES.items():
        if getattr(args, bundle.replace("-", "_"), False):
            paths.extend(files)

    if not paths:
        parser.print_help()
        sys.exit(1)

    print(PROMPT_TEMPLATE, end="")

    for p in paths:
        target = (REPO_ROOT / p).resolve() if not Path(p).is_absolute() else Path(p)
        if args.diff:
            print(diff_block(str(target.relative_to(REPO_ROOT))), end="")
        elif target.is_file():
            print(file_block(target), end="")
        elif target.is_dir():
            for f in sorted(target.rglob("*")):
                if f.is_file() and f.suffix in {".js", ".jsx", ".ts", ".tsx", ".py", ".sql", ".md"}:
                    print(file_block(f), end="")
        else:
            print(f"### {p}\n\n_(not found)_\n\n")


if __name__ == "__main__":
    main()
