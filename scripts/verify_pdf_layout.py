#!/usr/bin/env python3
"""Verify a rendered PDF's layout without a vision tool.

Per page (rendered via poppler pdftoppm): corner background color,
content-bottom % (how far down the page ink extends, excluding the
footer/page-number band), and blank-page detection.

Flags:
  - background differs from page 1  -> inconsistent bg (body-level bg bug;
    full-bleed backgrounds belong on `@page`, not `body`)
  - content ends below 60%          -> page looks underfilled
  - content ends above 93%          -> overflow risk (check page count too:
    each `.page` block must be exactly one PDF page, no spill pages)
  - page ink < 0.5%                 -> nearly blank page (previous section spilled)

Needs: poppler-utils (pdftoppm, pdfinfo) and Pillow.
Usage:  python3 verify_pdf_layout.py out.pdf [--dpi 100]
"""
import argparse
import glob
import os
import subprocess
import sys
import tempfile

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--dpi", type=int, default=100)
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"not found: {args.pdf}")

    # page count
    info = subprocess.run(["pdfinfo", args.pdf], capture_output=True, text=True).stdout
    pages = int([l.split(":")[1] for l in info.splitlines() if l.startswith("Pages")][0])
    print(f"pages: {pages}")

    with tempfile.TemporaryDirectory() as td:
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(args.dpi), args.pdf, os.path.join(td, "p")],
            check=True,
        )
        ref_bg = None
        for p in sorted(glob.glob(os.path.join(td, "p-*.png"))):
            img = Image.open(p).convert("RGB")
            w, h = img.size
            px = img.load()
            bg = px[10, 10]
            if ref_bg is None:
                ref_bg = bg
            # content bottom: last row with ink, excluding footer band (top 92%)
            last = 0
            for y in range(int(h * 0.92) - 1, -1, -1):
                if sum(1 for x in range(0, w, 2) if sum(px[x, y]) < 600) > 2:
                    last = y
                    break
            # ink % over whole page
            ink = 0
            for y in range(0, h, 4):
                for x in range(0, w, 4):
                    r, g, b = px[x, y]
                    if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 40:
                        ink += 1
            ink_pct = 100.0 * ink / ((w // 4) * (h // 4))
            bottom = round(last / h * 100, 1)
            flags = []
            if bg != ref_bg:
                flags.append("BG-DIFFERS")
            if ink_pct < 0.5:
                flags.append("NEARLY-BLANK")
            if bottom < 60:
                flags.append("UNDERFILLED")
            if bottom > 93:
                flags.append("OVERFLOW-RISK")
            print(
                f"  {os.path.basename(p)}: bg=#{bg[0]:02x}{bg[1]:02x}{bg[2]:02x} "
                f"content-bottom={bottom}% ink={ink_pct:.2f}%"
                + (f"  <-- {' '.join(flags)}" if flags else "")
            )


if __name__ == "__main__":
    main()
