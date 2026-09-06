#!/usr/bin/env bash
# Verify a WeasyPrint PDF against its HTML source (the non-negotiable part).
#   ./scripts/verify.sh input.html output.pdf
# Runs: pdfinfo (page count, no spill) + pdffonts (every font "emb yes",
# unexpected family = fallback bug) + per-page layout metrics + word-fidelity
# diff + pdftoppm raster spot-check for pixel comparison.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -lt 2 ]; then
  echo "usage: $0 input.html output.pdf" >&2
  exit 2
fi
SRC="$1"; PDF="$2"

pick_python() {
  if [ -x /tmp/pdfvenv/bin/python ]; then echo /tmp/pdfvenv/bin/python;
  elif command -v python3 >/dev/null 2>&1; then echo python3;
  else echo python; fi
}
PY="$(pick_python)"

echo "== pdfinfo (expect: Pages == .page blocks, A4/Letter size) =="
pdfinfo "$PDF" | grep -E "Pages|Page size"
echo
echo "== pdffonts (expect: every font 'emb yes', no surprise families) =="
pdffonts "$PDF"
echo
echo "== per-page layout metrics =="
"$PY" scripts/verify_pdf_layout.py "$PDF"
echo
echo "== word fidelity diff (expect: only page-number tokens ADDED) =="
"$PY" scripts/word_fidelity_diff.py "$SRC" "$PDF" | tail -20
echo
echo "== exotic glyph scan (fallback-font suspects) =="
"$PY" scripts/scan_glyphs.py "$PDF"
echo
echo "== raster spot-check (pdftoppm PNGs for pixel comparison) =="
TMP="$(mktemp -d)"
pdftoppm -png -r 60 "$PDF" "$TMP/p" >/dev/null
echo "$TMP: $(ls "$TMP" | wc -l) page(s) rendered (60dpi spot-check)"
