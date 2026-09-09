# Local rendering (WeasyPrint)

The browser raster is faithful by construction (preview pixels == PDF
pixels), but it is **not** pixel-identical to live browser layout —
`html2canvas` drops blend modes / modern selectors and can misalign text.
For pixel comparison, `scripts/` renders the same `.page`-split HTML with
[WeasyPrint](https://weasyprint.org/) (no browser involved): deterministic
output with native `@page` margins and `counter(page)` numbers, lighter
than headless Chromium.

Simple command with default settings (A4, 10mm margins, `N / total` numbers):

```bash
pip install -r scripts/requirements.txt   # one-time (or reuse /tmp/pdfvenv)
./scripts/render.sh public/sample/slowliving-sample.html
# → out/slowliving-sample.pdf (one PDF page per `.page` block)
npm run pdf -- public/sample/slowliving-sample.html out/custom.pdf  # same via npm
```

Options (all optional, defaults mirror the app's `DEFAULT_SETTINGS`):

```bash
./scripts/render.sh guide.html out/guide.pdf --page-size letter --margin 12 --no-numbers
./scripts/render.sh guide.html --number-format dash --number-position bottom-right --start 3
./scripts/render.sh guide.html --margin-top 12 --margin-bottom 14
./scripts/render.sh guide.html --layout sheet --numbers  # force sheet/content handling
./scripts/render.sh guide.html --extra-css scripts/compat/guide_30.css
```

Two layouts: `content` (default for fluid samples — supplied 10mm geometry
+ `N / total` numbers) vs `sheet` (auto-detected when `.page` is sized to
a full sheet or the file has its own `@page { margin: 0 }`: margins stay 0
and injected numbers switch off because sheets carry their own footers —
forcing content geometry there overflows every sheet into blank spill
pages and double-numbers them). `--extra-css` appends an override file
last in the cascade for WeasyPrint workarounds; `scripts/compat/`
collects them per document.

Technique: `render.py` injects a print block before rendering — `@page`
carries size/margin/background (a `body` background leaves pages white),
numbers come from `@page @bottom-center { content: ... }` (`slash` for app
parity, `dash` for the slow-living `— N —` look), start offset via
`@page:first { counter-reset: page N; }`, and `.page` blocks are pinned to
one PDF page each via `page-break-after`. `base_url` is the input file's
directory, so relative assets and local `@font-face` TTFs resolve; prefer
local fonts over CDN (everything embedded, no network dependency).

Verify afterwards (non-negotiable — no vision tool here):

```bash
./scripts/verify.sh public/sample/slowliving-sample.html out/slowliving-sample.pdf
```

which runs `pdfinfo` (page count == `.page` blocks, no spill), `pdffonts`
(every font `emb yes`; a surprise family means glyph fallback — e.g. Lora
lacks some hyphens/unicode fractions and silently pulls in Noto),
`verify_pdf_layout.py` (per-page background + content-bottom %,
catches near-blank pages from one-line overflows), `word_fidelity_diff.py`
(word-multiset diff of PDF text vs source HTML, catches dropped
paragraphs), `scan_glyphs.py`, and a `pdftoppm` raster spot-check whose
PNGs are the pixel-comparison input. Short samples legitimately flag
`UNDERFILLED` — that heuristic is tuned for full guide pages.

Gotchas: grid layout is shaky in WeasyPrint and `float` drop-caps crash it
(the script auto-neutralizes `float` on `::first-letter`; `guide_30.html`
additionally needed its 2-column timeline grids swapped to flex via
`scripts/compat/guide_30.css` — grid silently dropped trailing rows).
Playwright/Chromium print-to-PDF is the fallback if a design ever needs
those. The word diff normalizes case and letter-spaced caps, but wide
tracking still scrambles some tokens (expect fragments around kickers /
colophon) and CSS-generated content (list discs, `::before` dashes,
`decimal-leading-zero` counters, the file's own folios) legitimately shows
as ADDED — classify the residual rather than chasing zero.

## Baking local files into the HTML

An uploaded file is read as text, so the browser can never resolve sibling
font/image files. Bake them offline (stdlib only, no dependencies):

```bash
python3 scripts/inline-local-fonts.py guide.html [--font-dirs DIR …] [--extra-font Name.ttf=/path/to.ttf] [-o out.html]
# → guide.inlined.html (local @font-face files as data: URLs)

python3 scripts/inline-local-images.py guide.html [--img-dirs DIR …] [--extra-img Name.jpg=/path/to.jpg] [-o out.html]
# → guide.inlined.html (<img src> / CSS images as data: URLs)
```

Matching is by basename (case-insensitive); unmatched references are left
untouched and reported. Shared logic lives in `scripts/inline_lib.py`
(twin of `src/core/embed.ts`); smoke tests in `scripts/test_scripts.py`.
