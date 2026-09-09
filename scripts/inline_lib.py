"""Shared helpers behind `inline-local-fonts.py` / `inline-local-images.py`.

Both scripts bake sibling files into an HTML document as `data:` URLs by
matching references on basename (case-insensitive) — the TS twin is
`src/core/assets.ts:buildAssetMap`. Import from here instead of
copy-pasting: `basename`, `data_url`, `index_files`, `parse_extra_specs`.
"""

from __future__ import annotations

import base64
import mimetypes
import sys
from pathlib import Path


def basename(ref: str) -> str:
    """Lowercased basename of a URL/path, ignoring query/hash and backslashes."""
    return ref.split("?")[0].split("#")[0].replace("\\", "/").rsplit("/", 1)[-1].lower()


def data_url(path: Path, mime_override: str | None = None) -> str:
    """Encode a file as a `data:` URL."""
    mime = mime_override or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    blob = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{blob}"


def index_files(dirs: list[Path], extra: list[str], extensions: set[str], kind: str) -> dict[str, Path]:
    """Map lowercase basename → file for every matching file under `dirs`.

    First file wins; `extra` entries (`Name=path` or plain paths) override.
    Mirrors `buildAssetMap` in `src/core/assets.ts`.
    """
    index: dict[str, Path] = {}
    for d in dirs:
        if not d.is_dir():
            print(f"warn: {kind} dir not found: {d}", file=sys.stderr)
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in extensions:
                index.setdefault(p.name.lower(), p)
    for spec in extra:
        if "=" in spec:
            _name, path = spec.split("=", 1)
        else:
            _name, path = Path(spec).name, spec
        p = Path(path).expanduser()
        if not p.is_file():
            print(f"warn: {kind} file not found: {path}", file=sys.stderr)
            continue
        index[p.name.lower()] = p
    return index


def index_files_recursive(
    dirs: list[Path], extra: list[str], extensions: set[str], kind: str
) -> dict[str, Path]:
    """Like `index_files` but searches directories recursively (images)."""
    index: dict[str, Path] = {}
    for d in dirs:
        if not d.is_dir():
            print(f"warn: {kind} dir not found: {d}", file=sys.stderr)
            continue
        for p in sorted(d.rglob("*")):
            if p.is_file() and p.suffix.lower() in extensions:
                index.setdefault(p.name.lower(), p)
    for spec in extra:
        if "=" in spec:
            _name, path = spec.split("=", 1)
        else:
            _name, path = Path(spec).name, spec
        p = Path(path).expanduser()
        if not p.is_file():
            print(f"warn: {kind} file not found: {path}", file=sys.stderr)
            continue
        index[p.name.lower()] = p
    return index


def default_output(html_path: Path, output: str | None) -> Path:
    """Resolve the output path (`<name>.inlined.html` next to the input)."""
    return Path(output) if output else html_path.with_name(f"{html_path.stem}.inlined.html")


def report_result(matched: int, missing: set[str], output: Path) -> None:
    """Print the shared `inlined N reference(s)` + unmatched summary."""
    print(f"inlined {matched} reference(s) → {output}", file=sys.stderr)
    if missing:
        print("unmatched (left as-is):", file=sys.stderr)
        for ref in sorted(missing):
            print(f"  {ref}", file=sys.stderr)
