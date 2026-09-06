#!/usr/bin/env python3
"""Scan a PDF's extracted text for exotic glyphs (font-fallback check).

Complements `pdffonts`: an unexpected family in `pdffonts` output (e.g.
Noto Sans alongside the designed Playfair/Lora/Karla) usually means a
glyph the body font lacks — Lora is missing hyphen-like chars and unicode
fractions, which silently pulls in a fallback. This scan lists every
non-ASCII char above U+2000 so the culprit is visible.

Usage:  python3 scan_glyphs.py out.pdf
"""
import argparse
import subprocess
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    args = ap.parse_args()
    txt = subprocess.run(
        ["pdftotext", args.pdf, "-"], capture_output=True, text=True
    ).stdout
    chars = sorted({c for c in txt if ord(c) > 0x2000})
    print("exotic:", chars or "none")
    print("count:", sum(1 for c in txt if ord(c) > 0x2000))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
