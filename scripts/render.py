#!/usr/bin/env python3
"""Render a `.page`-split HTML file to PDF with WeasyPrint (no browser).

Each `<div class="page">` block becomes exactly one PDF page via
`page-break-after`, mirroring the app contract (one `.page` DOM tree =
exactly one PDF page). Page geometry and numbers live in `@page` rules:

- `@page { size: A4; margin: ...; background: ... }` — geometry + full-bleed
  background belong on `@page`, not `body` (a body background leaves some
  pages white).
- Numbers via `@page @bottom-center { content: ... }` — deterministic,
  native paged-media counters, no raster involved.
- Start offset via `@page:first { counter-reset: page N; }` (verified:
  `counter-reset` on `body`/`html` does NOT move the page counter, but
  `@page:first` does; `counter(pages)` stays the physical total, matching
  the app's `start + index / total` display).

Defaults mirror the app's DEFAULT_SETTINGS (see src/core/settings.ts):
A4, 10mm uniform margins, numbers ON (`N / total`, bottom-center) — for
fluid `.page` content. Full-sheet print designs (`.page` sized to a full
sheet with their own `@page { margin: 0 }` and footers) are auto-detected:
margins stay 0 and injected numbers switch off (override: --layout, --numbers).

Why WeasyPrint and not the browser pipeline: the app's html2canvas raster
is faithful by construction (preview pixels == PDF pixels) but NOT
pixel-identical to a live browser layout — canvas rasterization drops
blend modes / modern selectors and can misalign text. WeasyPrint is a
deterministic HTML/CSS-to-PDF renderer with native `@page` margins,
running elements and `counter(page)`, lighter than headless Chromium, and
the right tool for pixel-comparison against browser output.

Fallback: Playwright/Chromium print-to-PDF if a design needs CSS
WeasyPrint won't do (grid is shaky, `float` drop-caps crash it).

Usage:
  scripts/render.py input.html -o out.pdf
  scripts/render.py input.html --page-size letter --margin 12 --no-numbers
  scripts/render.py input.html --number-format dash --number-position bottom-right --start 3

Needs: weasyprint (see scripts/requirements.txt).
"""

import argparse
import pathlib
import re
import sys

PAGE_SIZES = ("a4", "letter")
NUMBER_POSITIONS = ("bottom-center", "bottom-left", "bottom-right")
NUMBER_FORMATS = ("slash", "dash")
LAYOUTS = ("auto", "content", "sheet")


def count_pages(html: str) -> int:
    """Count `.page` blocks (class attribute containing the token `page`)."""
    return len(
        re.findall(
            r'''class\s*=\s*["'][^"']*(?<![\w-])page(?![\w-])''', html, re.I
        )
    )


def detect_sheet_mode(html: str) -> bool:
    """Detect full-sheet print designs (e.g. guide_30.html).

    Screen-first samples have fluid `.page` content that needs supplied
    geometry (margins + breaks). Print-first sheets instead size `.page`
    to a full sheet (`height: 297mm`) with their own `@page { margin: 0 }`
    and their own footers — forcing 10mm margins there overflows every
    sheet (~20mm spill → blank second pages) and double-numbers them.
    """
    # Explicit full-sheet .page height (>= 270mm in any unit).
    for m in re.finditer(
        r"\.page\b[^{]*\{(?P<body>[^}]*)\}", html, re.I | re.S
    ):
        body = m.group("body")
        for hm in re.finditer(
            r"(?<![\w-])(?:min-)?height\s*:\s*([\d.]+)\s*(mm|cm|in|pt|px|q)",
            body, re.I,
        ):
            val, unit = float(hm.group(1)), hm.group(2).lower()
            mm = {"mm": 1, "cm": 10, "in": 25.4, "pt": 25.4 / 72,
                  "px": 25.4 / 96, "q": 0.25}[unit] * val
            if mm >= 270:
                return True
    # Author's own full-bleed @page.
    for m in re.finditer(r"@page\s*\{([^}]*)\}", html, re.I | re.S):
        if re.search(r"(?<![\w-])margin\s*:\s*0(\s|;|$|})", m.group(1)):
            return True
    return False


def build_print_css(
    page_size: str,
    margins: dict,
    show_numbers: bool,
    start: int,
    number_position: str,
    number_format: str,
) -> str:
    size = "A4" if page_size == "a4" else "Letter"
    margin = (
        f"{margins['top']}mm {margins['right']}mm "
        f"{margins['bottom']}mm {margins['left']}mm"
    )
    pos_rule = number_position.replace("bottom-", "bottom-")
    if number_format == "dash":
        # Slow-living style: "— N —" in sage, per autumn-sanctuary-guide.
        content = '"\\2014  " counter(page) " \\2014"'
        font = "font-size: 8pt; color: #A8B5A0; font-family: serif;"
    else:
        # App parity: "N / total".
        content = 'counter(page) " / " counter(pages)'
        font = "font-size: 9pt; color: #64748b; font-family: sans-serif;"
    lines = [
        "/* injected by scripts/render.py — do not hand-edit output HTML */",
        f"@page {{ size: {size}; margin: {margin}; background: #fff;",
    ]
    if show_numbers:
        lines.append(f"  @{pos_rule} {{ content: {content}; {font} }}")
    lines.append("}")
    if show_numbers and start != 1:
        lines.append(f"@page:first {{ counter-reset: page {start}; }}")
    lines += [
        # One `.page` block == exactly one PDF page. `break-after` is the
        # modern spelling; `page-break-after` keeps older engines happy.
        ".page { page-break-after: always; break-after: page; }",
        ".page:last-child { page-break-after: auto; break-after: auto; }",
    ]
    return "\n".join(lines)


# WeasyPrint compat: `float` on ::first-letter crashes layout
# (AssertionError in float_layout — verified on guide_30.html's
# `.dropcap::first-letter { float: left }`). The `!important` wins over the
# author's non-important float; the initial simply stays inline.
COMPAT_CSS = "*::first-letter { float: none !important; }"


def has_first_letter_float(html: str) -> bool:
    """Detect `float` inside any `::first-letter` rule in the source."""
    for m in re.finditer(r"::first-letter\s*\{([^}]*)\}", html, re.I):
        if re.search(r"(?<![\w-])float\s*:", m.group(1), re.I):
            return True
    return False


def inject_css(html: str, css: str) -> str:
    tag = f"<style>\n{css}\n</style>"
    if "</head>" in html:
        return html.replace("</head>", tag + "\n</head>", 1)
    if "<body" in html:
        return html.replace("<body", tag + "\n<body", 1)
    return tag + "\n" + html


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Render .page-split HTML to PDF via WeasyPrint."
    )
    ap.add_argument("input", help="input HTML file with .page blocks")
    ap.add_argument("-o", "--output", default="",
                    help="output PDF path (default: out/<stem>.pdf)")
    ap.add_argument("--page-size", choices=PAGE_SIZES, default="a4")
    ap.add_argument("--margin", type=float, default=10.0,
                    help="uniform margin in mm (0-40, default 10)")
    ap.add_argument("--margin-top", type=float, default=None)
    ap.add_argument("--margin-right", type=float, default=None)
    ap.add_argument("--margin-bottom", type=float, default=None)
    ap.add_argument("--margin-left", type=float, default=None)
    ap.add_argument("--no-numbers", action="store_true",
                    help="omit page numbers")
    ap.add_argument("--numbers", action="store_true",
                    help="force page numbers on (default on, except sheet mode)")
    ap.add_argument("--layout", choices=LAYOUTS, default="auto",
                    help="content = fluid .page blocks get supplied geometry "
                         "(default margins); sheet = print-ready full-size "
                         "sheets kept as-is (@page margin 0, no injected "
                         "numbers unless --numbers); auto detects sheets by "
                         ".page height >= 270mm or author @page margin 0")
    ap.add_argument("--extra-css", default="",
                    help="path to a CSS file appended after all other styles "
                         "(wins the cascade; for WeasyPrint workarounds — "
                         "see scripts/compat/)")
    ap.add_argument("--start", type=int, default=1,
                    help="first printed page number (default 1)")
    ap.add_argument("--number-position", choices=NUMBER_POSITIONS,
                    default="bottom-center")
    ap.add_argument("--number-format", choices=NUMBER_FORMATS, default="slash",
                    help="slash = 'N / total' (app parity), "
                         "dash = slow-living '— N —'")
    args = ap.parse_args()

    src = pathlib.Path(args.input)
    if not src.is_file():
        print(f"not found: {src}", file=sys.stderr)
        return 2
    out = (pathlib.Path(args.output) if args.output
           else pathlib.Path("out") / (src.stem + ".pdf"))

    def clamp(v: float) -> float:
        return min(40.0, max(0.0, v))

    m = args.margin
    margins = {
        "top": clamp(args.margin_top if args.margin_top is not None else m),
        "right": clamp(args.margin_right if args.margin_right is not None else m),
        "bottom": clamp(args.margin_bottom if args.margin_bottom is not None else m),
        "left": clamp(args.margin_left if args.margin_left is not None else m),
    }

    html = src.read_text(encoding="utf-8")
    n = count_pages(html)
    if args.layout == "sheet":
        sheet = True
    elif args.layout == "content":
        sheet = False
    else:
        sheet = detect_sheet_mode(html)
    if args.no_numbers:
        show_numbers = False
    elif args.numbers:
        show_numbers = True
    else:
        show_numbers = not sheet
    if sheet:
        margins = {"top": 0.0, "right": 0.0, "bottom": 0.0, "left": 0.0}
        print("note: full-sheet print design detected — "
              "@page margin 0, injected numbers off "
              "(sheets carry their own footers; override with "
              "--layout content / --numbers)", file=sys.stderr)
    if has_first_letter_float(html):
        print("note: ::first-letter float detected — "
              "neutralizing (WeasyPrint crashes on floated initials; "
              "initial stays inline)", file=sys.stderr)
    css = build_print_css(
        args.page_size, margins,
        show_numbers=show_numbers,
        start=max(1, args.start),
        number_position=args.number_position,
        number_format=args.number_format,
    ) + "\n" + COMPAT_CSS
    if args.extra_css:
        extra = pathlib.Path(args.extra_css)
        if not extra.is_file():
            print(f"not found: {extra}", file=sys.stderr)
            return 2
        css += "\n/* --extra-css */\n" + extra.read_text(encoding="utf-8")
    final = inject_css(html, css)

    try:
        from weasyprint import HTML
    except ImportError:
        print("weasyprint not installed: pip install -r scripts/requirements.txt",
              file=sys.stderr)
        return 3

    out.parent.mkdir(parents=True, exist_ok=True)
    # base_url = input dir so relative assets / local TTF @font-face resolve.
    HTML(string=final, base_url=str(src.resolve().parent)).write_pdf(str(out))
    print(f"rendered {out} ({n} .page block(s), layout={'sheet' if sheet else 'content'}, "
          f"{args.page_size.upper()} {margins['top']}mm/{margins['right']}mm/"
          f"{margins['bottom']}mm/{margins['left']}mm, "
          f"numbers={'off' if not show_numbers else args.number_format + ' ' + args.number_position + ' from ' + str(max(1, args.start))})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
