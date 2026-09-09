#!/usr/bin/env python3
"""Bake local image files into an HTML document as data: URLs.

Why: when HTML is uploaded into the html-to-pdf tool it is read as text, so
the browser can never resolve sibling image files (`cover-photo.jpg`,
`assets/hero.png`). Those `<img src>` / CSS `url(...)` references rasterize
blank in preview and PDF even though the file renders fine from disk (where
a base URL exists). Replacing them with `data:` URLs makes the file
self-contained: images render in preview and PDF with no CORS involved.

Usage:
    python3 scripts/inline-local-images.py guide.html
    python3 scripts/inline-local-images.py guide.html --img-dirs ./assets /mnt/hgfs/Shared/guide/one-page
    python3 scripts/inline-local-images.py guide.html --extra-img cover-photo.jpg=./cover-photo.jpg -o guide.inlined.html

Default output is `<name>.inlined.html` next to the input. Matching is by
basename (case-insensitive): `src="assets/Cover-Photo.JPG"` matches a file
named `cover-photo.jpg` found in any search dir. Unmatched references are
left untouched and reported.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inline_lib import basename, data_url, default_output, index_files_recursive, report_result

IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico"}

# <img src="..."> (quoted or unquoted)
IMG_SRC_RE = re.compile(
    r'(<img\b[^>]*?\bsrc\s*=\s*)(["\']?)([^"\'\s>]+)\2', re.IGNORECASE
)
# srcset="a.jpg 1x, b.jpg 2x"
SRCSET_RE = re.compile(r'(\bsrcset\s*=\s*)(["\'])([^"\']*)\2', re.IGNORECASE)
# CSS url(...) — only rewritten when the ref has an image extension
URL_RE = re.compile(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)", re.IGNORECASE)


def image_data_url(path: Path) -> str:
    override = "image/svg+xml" if path.suffix.lower() == ".svg" else None
    return data_url(path, override)


def is_remote(ref: str) -> bool:
    return bool(re.match(r"^(https?:)?//", ref, re.IGNORECASE))


def index_images(dirs: list[Path], extra: list[str]) -> dict[str, Path]:
    return index_files_recursive(dirs, extra, IMG_EXTS, "image")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html", help="Input HTML file")
    ap.add_argument("--img-dirs", nargs="*", default=[],
                    help="Extra directories to search for image files "
                         "(default: the HTML file's own directory, searched recursively)")
    ap.add_argument("--extra-img", action="append", default=[],
                    help="Explicit mapping Name.jpg=/path/to/file.jpg (repeatable)")
    ap.add_argument("-o", "--output", default=None,
                    help="Output file (default: <name>.inlined.html)")
    args = ap.parse_args()

    html_path = Path(args.html)
    if not html_path.is_file():
        print(f"error: no such file: {html_path}", file=sys.stderr)
        return 2

    search_dirs = [html_path.parent]
    search_dirs += [Path(d).expanduser() for d in args.img_dirs]
    index = index_images(search_dirs, args.extra_img)
    if not index:
        print("error: no image files found in " + ", ".join(str(d) for d in search_dirs), file=sys.stderr)
        return 2
    print(f"indexed {len(index)} image file(s): " + ", ".join(sorted(index)), file=sys.stderr)

    text = html_path.read_text(encoding="utf-8")
    cache: dict[str, str] = {}
    matched = 0
    missing: set[str] = set()

    def lookup(ref: str) -> str | None:
        base = basename(ref)
        if not base:
            return None
        img = index.get(base)
        if img is None:
            return None
        if base not in cache:
            cache[base] = image_data_url(img)
        return cache[base]

    def repl_img_src(m: re.Match[str]) -> str:
        nonlocal matched
        prefix, quote, ref = m.group(1), m.group(2), m.group(3).strip()
        if not ref or ref.startswith("data:") or ref.startswith("blob:") or is_remote(ref):
            return m.group(0)
        data = lookup(ref)
        if data is None:
            missing.add(ref)
            return m.group(0)
        matched += 1
        q = quote or '"'
        return f"{prefix}{q}{data}{q}"

    def repl_srcset(m: re.Match[str]) -> str:
        nonlocal matched
        prefix, quote, value = m.group(1), m.group(2), m.group(3)
        parts = []
        changed = False
        for part in value.split(","):
            tokens = part.strip().split()
            if not tokens:
                parts.append(part)
                continue
            u = tokens[0]
            if not u or u.startswith("data:") or u.startswith("blob:") or is_remote(u):
                parts.append(part.strip())
                continue
            data = lookup(u)
            if data is None:
                missing.add(u)
                parts.append(part.strip())
                continue
            changed = True
            matched += 1
            parts.append(" ".join([data, *tokens[1:]]))
        if not changed:
            return m.group(0)
        return f"{prefix}{quote}{', '.join(parts)}{quote}"

    def repl_url(m: re.Match[str]) -> str:
        nonlocal matched
        ref = m.group(2).strip()
        if not ref or ref.startswith("data:") or ref.startswith("#") or ref.startswith("blob:"):
            return m.group(0)
        if is_remote(ref):
            return m.group(0)  # remote — the tool auto-inlines CORS-enabled ones
        if Path(ref.split("?")[0].split("#")[0]).suffix.lower() not in IMG_EXTS:
            return m.group(0)  # fonts etc. belong to inline-local-fonts.py
        data = lookup(ref)
        if data is None:
            missing.add(ref)
            return m.group(0)
        matched += 1
        return f'url("{data}")'

    out = IMG_SRC_RE.sub(repl_img_src, text)
    out = SRCSET_RE.sub(repl_srcset, out)
    out = URL_RE.sub(repl_url, out)

    output = default_output(html_path, args.output)
    output.write_text(out, encoding="utf-8")
    report_result(matched, missing, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
