#!/usr/bin/env bash
# Render a `.page`-split HTML file to PDF via WeasyPrint with default settings.
# Mirrors the app DEFAULT_SETTINGS: A4, 10mm uniform margins, N/total numbers.
#
# Usage:
#   ./scripts/render.sh input.html [output.pdf] [render.py options...]
#   ./scripts/render.sh public/sample/slowliving-sample.html
#   ./scripts/render.sh guide.html out/guide.pdf --number-format dash --margin 12
#   npm run pdf -- public/sample/slowliving-sample.html
set -euo pipefail
cd "$(dirname "$0")/.."

pick_python() {
  if [ -x /tmp/pdfvenv/bin/python ]; then
    echo /tmp/pdfvenv/bin/python
  elif command -v python3 >/dev/null 2>&1; then
    echo python3
  else
    echo python
  fi
}

PY="$(pick_python)"
INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  echo "usage: $0 input.html [output.pdf] [options...]" >&2
  exit 2
fi
shift

OUTPUT=""
if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
  OUTPUT="$1"
  shift
fi

if [ -z "$OUTPUT" ]; then
  "$PY" scripts/render.py "$INPUT" "$@"
else
  "$PY" scripts/render.py "$INPUT" -o "$OUTPUT" "$@"
fi
