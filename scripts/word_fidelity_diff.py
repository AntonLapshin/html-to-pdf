#!/usr/bin/env python3
"""Word-multiset fidelity diff between source HTML and a rendered PDF.

Catches dropped/changed content after an HTML->PDF rebuild. Compares the
word multiset of the source HTML (tags/scripts/styles stripped) against
`pdftotext` output of the PDF; every difference is printed. A clean result
shows ONLY intentional diffs (page-number tokens, label casing) — anything
else is a content bug (this once caught a dropped paragraph).

Normalization applied to both sides: page-number lines ("— N —", "N / total",
"– N –"), letter-spacing artifacts ("D AY N" -> "DAY N"), whitespace collapsing.

Usage:
  python3 word_fidelity_diff.py source.html out.pdf
  python3 word_fidelity_diff.py source.html out.pdf --drop "GUIDED|ACTIVITY"
  (aleftover .txt path also works as the first arg for pre-extracted text)
"""
import argparse
import html as htmlmod
import pathlib
import re
import subprocess
import sys
from collections import Counter


def source_text(path: str) -> str:
    p = pathlib.Path(path)
    raw = p.read_text(encoding="utf-8", errors="replace")
    if p.suffix.lower() != ".html":
        return raw
    # Head metadata (<title>, <meta>) never renders to the PDF body.
    h = re.sub(r"<head\b.*?</head>", " ", raw, flags=re.S | re.I)
    h = re.sub(r"<svg\b.*?</svg>|<script\b.*?</script>|<style\b.*?</style>",
               " ", h, flags=re.S | re.I)
    h = re.sub(r"<[^>]+>", " ", h)
    h = htmlmod.unescape(h)  # &amp; -> & so entities don't read as words
    return re.sub(r"\s+", " ", h).strip()


def words(text: str) -> Counter:
    return Counter(re.findall(r"[a-zA-Z0-9'’\-–—•]+", text))


def normalize(text: str, drop: str) -> str:
    text = re.sub(r"[—–]\s*\d+\s*[—–]", "", text)  # "— N —" numbers
    text = re.sub(r"\b\d+\s*/\s*\d+\b", "", text)  # "N / total" numbers
    text = re.sub(r"D AY (\d)", r"DAY \1", text)    # letter-spaced kickers
    if drop:
        text = re.sub(drop, "", text)
    return re.sub(r"\s+", " ", text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="source .html (or pre-extracted .txt)")
    ap.add_argument("pdf")
    ap.add_argument("--drop", default="",
                    help="regex of words to ignore (e.g. label-casing noise)")
    args = ap.parse_args()

    orig = source_text(args.source)
    pdf_text = subprocess.run(
        ["pdftotext", args.pdf, "-"], capture_output=True, text=True
    ).stdout

    a = words(normalize(orig, args.drop))
    b = words(normalize(pdf_text, args.drop))

    only_orig = a - b
    only_new = b - a
    print("MISSING from PDF (content dropped — investigate!):")
    print(dict(only_orig) or "  none")
    print("ADDED in PDF (verify these are intentional):")
    print(dict(only_new) or "  none")
    if only_orig:
        sys.exit(1)


if __name__ == "__main__":
    main()
