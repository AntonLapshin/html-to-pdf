#!/usr/bin/env python3
"""Bake local font files into an HTML document as data: URLs.

Why: when HTML is uploaded into the html-to-pdf tool it is read as text, so
the browser can never resolve sibling font files (`_fonts/*.ttf`) or machine
paths (`C:/Windows/Fonts/…`). Replacing those `url(…)` references with
`data:` URLs makes the file self-contained: fonts render in preview and PDF
with no CORS involved at all.

Usage:
    python3 scripts/inline-local-fonts.py guide.html
    python3 scripts/inline-local-fonts.py guide.html --font-dirs ./_fonts /mnt/hgfs/Shared/fonts
    python3 scripts/inline-local-fonts.py guide.html --extra-font NotoSerif-Regular.ttf=~/fonts/Noto.ttf -o guide.inlined.html

Default output is `<name>.inlined.html` next to the input. Matching is by
basename (case-insensitive): `url("_fonts/NotoSerif-Regular.ttf")` matches a
file named `NotoSerif-Regular.ttf` found in any search dir. Unmatched
references are left untouched and reported.
"""

from __future__ import annotations

import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path

URL_RE = re.compile(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)", re.IGNORECASE)

MIME_OVERRIDES = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".eot": "application/vnd.ms-fontobject",
}


def data_url(path: Path) -> str:
    mime = MIME_OVERRIDES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    blob = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{blob}"


def index_fonts(dirs: list[Path], extra: list[str]) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for d in dirs:
        if not d.is_dir():
            print(f"warn: font dir not found: {d}", file=sys.stderr)
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in MIME_OVERRIDES:
                index.setdefault(p.name.lower(), p)
    for spec in extra:
        if "=" in spec:
            _name, path = spec.split("=", 1)
        else:
            _name, path = Path(spec).name, spec
        p = Path(path).expanduser()
        if not p.is_file():
            print(f"warn: font file not found: {path}", file=sys.stderr)
            continue
        index[p.name.lower()] = p
    return index


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html", help="Input HTML file")
    ap.add_argument("--font-dirs", nargs="*", default=[],
                    help="Extra directories to search for font files "
                         "(default: the HTML file's own directory + _fonts/ next to it)")
    ap.add_argument("--extra-font", action="append", default=[],
                    help="Explicit mapping Name.ttf=/path/to/file.ttf (repeatable)")
    ap.add_argument("-o", "--output", default=None,
                    help="Output file (default: <name>.inlined.html)")
    args = ap.parse_args()

    html_path = Path(args.html)
    if not html_path.is_file():
        print(f"error: no such file: {html_path}", file=sys.stderr)
        return 2

    search_dirs = [html_path.parent, html_path.parent / "_fonts"]
    search_dirs += [Path(d).expanduser() for d in args.font_dirs]
    index = index_fonts(search_dirs, args.extra_font)
    if not index:
        print("error: no font files found in " + ", ".join(str(d) for d in search_dirs), file=sys.stderr)
        return 2
    print(f"indexed {len(index)} font file(s): " + ", ".join(sorted(index)), file=sys.stderr)

    text = html_path.read_text(encoding="utf-8")
    cache: dict[str, str] = {}
    matched = 0
    missing: set[str] = set()

    def repl(m: re.Match[str]) -> str:
        nonlocal matched
        ref = m.group(2).strip()
        if ref.startswith("data:") or ref.startswith("#"):
            return m.group(0)
        if re.match(r"^(https?:)?//", ref, re.IGNORECASE):
            return m.group(0)  # remote — the tool auto-inlines CORS-enabled ones
        base = ref.split("?")[0].split("#")[0].replace("\\", "/").rsplit("/", 1)[-1].lower()
        if not base:
            return m.group(0)
        font = index.get(base)
        if font is None:
            missing.add(ref)
            return m.group(0)
        if base not in cache:
            cache[base] = data_url(font)
        matched += 1
        return f'url("{cache[base]}")'

    out = URL_RE.sub(repl, text)

    output = Path(args.output) if args.output else html_path.with_name(f"{html_path.stem}.inlined.html")
    output.write_text(out, encoding="utf-8")
    print(f"inlined {matched} reference(s) → {output}", file=sys.stderr)
    if missing:
        print("unmatched (left as-is):", file=sys.stderr)
        for ref in sorted(missing):
            print(f"  {ref}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
