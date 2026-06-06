#!/usr/bin/env python3
"""Harmonize CLIENT app interactive/brand colors to orange (#FF4500 family).

Strategy (low-risk, surgical):
- Only touch lines that contain `text-white` together with a colored solid
  background (bg-<color>-<500..700>) — i.e. buttons, active tabs, icon circles,
  headers. Those are brand/interactive surfaces and should be orange.
- Also rewrite brand gradients `from-<c>-<s> ... to-<c>-<s>` to an orange gradient.
- Preserve route pickup/dropoff dots (bg-green-500 / bg-red-500 WITHOUT text-white),
  semantic reds/ambers/yellows, neutrals and the colorful decorative home tiles
  (pastel -50/-100 backgrounds with colored icon text but no text-white).
"""
import re
import sys
from pathlib import Path

ROOT = Path("/app/frontend/src")
TARGETS = ["teal", "cyan", "indigo", "sky", "blue", "emerald", "green", "violet"]
SHADES = ["400", "500", "600", "700", "800"]

# Files / globs to process (client surfaces only — NOT driver app)
DIRS = [ROOT / "pages" / "user"]
EXTRA_FILES = [
    ROOT / "components" / "ServiceListLayout.js",
    ROOT / "components" / "ServiceBookingFlow.js",
    ROOT / "components" / "ServiceBookingSheet.js",
]

color_shade = re.compile(r"-(?:%s)-(?:%s)\b" % ("|".join(TARGETS), "|".join(SHADES)))


def map_token(tok: str) -> str:
    """Replace the color name in a utility token with 'orange', keep shade."""
    for c in TARGETS:
        tok = re.sub(rf"\b{c}-(\d{{2,3}})\b", r"orange-\1", tok)
    return tok


def process_line(line: str) -> str:
    out = line
    has_white = "text-white" in out
    # 1) Solid interactive surfaces: only when text-white is present on the line.
    if has_white:
        # bg-, hover:bg-, active:bg-, border-, ring- of target colors (any shade)
        out = re.sub(
            r"((?:hover:|active:|focus:|group-hover:)?(?:bg|border|ring|from|to)-)(?:%s)-(\d{2,3})"
            % "|".join(TARGETS),
            lambda m: f"{m.group(1)}orange-{m.group(2)}",
            out,
        )
    # 2) Brand gradients (from-/to-/via-) -> orange, even without text-white.
    if "from-" in out or "to-" in out or "via-" in out:
        out = re.sub(
            r"((?:from|to|via)-)(?:%s)-(\d{2,3})" % "|".join(TARGETS),
            lambda m: f"{m.group(1)}orange-{m.group(2)}",
            out,
        )
    return out


def process_file(p: Path) -> int:
    txt = p.read_text()
    new = "\n".join(process_line(l) for l in txt.split("\n"))
    if new != txt:
        p.write_text(new)
        return 1
    return 0


def iter_files():
    for d in DIRS:
        yield from d.rglob("*.js")
        yield from d.rglob("*.jsx")
    for f in EXTRA_FILES:
        if f.exists():
            yield f


def main():
    changed = 0
    for f in iter_files():
        changed += process_file(f)
    print(f"Files changed: {changed}")


if __name__ == "__main__":
    main()
