# html-to-pdf

Pure-UI tool: upload any HTML already split into `.page` blocks → accurate
per-page PDF preview (click to expand) → tune margins / page numbers / DPI →
download a PDF where **each `.page` DOM tree is exactly one PDF page**.

Live demo: https://antonlapshin.github.io/html-to-pdf

## Quickstart

```bash
npm install
npm run dev      # vite --host 0.0.0.0 --port 5173 (LAN-reachable)
```

Typical workflow (under a minute):

1. Ask an agent to produce a beautiful HTML guide (see the prompt snippet below).
2. Open the tool, **Upload HTML** — or drag & drop the file, **Paste HTML**, or pick a sample.
3. Tune **page size / margins / numbers / DPI / quality**; every card is a WYSIWYG page.
4. Click any page to expand (←/→ in modal, Esc to close), then **Download PDF**.
5. Your work autosaves to the browser; **Save project** exports a JSON backup.

## Merge PDFs

Switch to the **Merge PDFs** tab to combine PDFs: **Upload PDFs** (or drag &
drop them), drag rows to reorder (↑ ↓ buttons work too, ✕ removes), then
**Download combined PDF** (`combined.pdf`, pages concatenated in list order).
Merging runs fully in the browser via `pdf-lib` (loaded on demand) and
preserves each page's original size.

## Samples gallery

| Sample | File | Contents |
| --- | --- | --- |
| Slow-living guide | `public/sample/slowliving-sample.html` | calm cover, morning + evening routines |
| Recipe book | `public/sample/recipe-book-sample.html` | pasta + crumble with ingredient lists |
| Travel journal | `public/sample/travel-journal-sample.html` | Lisbon mini-journal with day entries |

Open them from the **Samples gallery** panel in the sidebar (or `Load sample`
in the upload zone).

## Agent prompt snippet

Copy this into any agent session to generate compatible HTML (also shown in
the app with a one-click **Copy** button):

```text
Generate a beautiful standalone HTML document with plain
inline <style> CSS (no external files, no Tailwind classes).
Split the content into <div class="page">…</div> sections —
each .page block becomes exactly one A4 PDF page.
Keep every page short enough to fit one A4 page at 10mm margins.
```

## Project save / load

- **Save project** downloads `<name>.html-to-pdf.json` containing the raw HTML
  source + all settings (ported from `AntonLapshin/book`'s
  `saveProject`/`loadProject`, but self-contained in one file).
- **Load project** restores a saved JSON file.
- **Autosave**: source + settings persist to `localStorage` on every change
  (debounced 500ms, skipped for uploads over ~800KB) and restore on reload.
- **Recent files**: the last 5 opened documents are listed in the upload zone
  for one-click reopening.

## Settings reference

- **Page size**: A4 (210×297mm) or Letter (215.9×279.4mm). On upload the
  tool auto-detects the file's design (`@page { size: … }` or `.page`
  width/height) and switches to it.
- **Margins**: **From HTML** (default on upload — reuses the file's own
  `.page` padding, e.g. `padding: 48pt 51pt …` → ~17/18/19/18mm), uniform
  slider, or per-edge (top/right/bottom/left), 0–40mm. The browser-viewer
  rules (`@media screen` margins/shadows on `.page`) are always reset so
  they can't leak into the PDF.
- **Page numbers**: `N / total` overlay starting from a configurable number,
  positioned bottom-center/left/right (baked into the raster so preview == PDF).
- **DPI** (72–300): raster resolution via `scale = DPI/96`.
- **JPEG quality** (10–100%): re-encodes the raster like book's `reencodeImage`
  to keep PDF size predictable.

## Showcases

Every component has a showcase under `src/showcases/` following
[AntonLapshin/showcase](https://github.com/AntonLapshin/showcase) convention
(`name` + variant components, `?file=..&showcase=..` deep links).
Open via **Showcases** in the header or `?view=showcase`.
The gallery is intentionally local: the upstream `showcase` repo still ships no
`dist/`, so a raw `github:` dependency cannot resolve at install time.

## PDF reference

Export pipeline is ported from
[AntonLapshin/book](https://github.com/AntonLapshin/book) (`createPdf`):
`renderPageCanvas` per `.page` at the configured DPI → JPEG re-encode →
`jsPDF` portrait `addImage` full-bleed → `doc.save()`. The same canvas feeds
the preview thumbnails, so preview pixels == PDF pixels by construction.
See `src/core/render.ts` and `src/core/pdf.ts`.

## Local Python rendering (WeasyPrint)

The browser raster above is faithful by construction, but it is **not**
pixel-identical to live browser layout — `html2canvas` drops blend modes /
modern selectors and can misalign text. For pixel comparison,
`scripts/` renders the same `.page`-split HTML with
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

## Troubleshooting

- **"No .page blocks found"** — the HTML must contain
  `<div class="page">…</div>` sections. Re-prompt the agent with the snippet above.
- **Blank preview/PDF but the HTML looks fine in the browser** — the file
  probably hides pages until a scroll-reveal script runs (e.g.
  `.page{opacity:0}` + `.page.seen{opacity:1}` via `IntersectionObserver`).
  Uploaded scripts never run in the raster pipeline, so the tool hoists
  `@media print` rules to the screen and forces the page shell visible
  (`opacity:1`, no transform/transition). No action needed — just re-upload.
- **Margins gone after upload** — shouldn't happen anymore: the tool adopts
  the file's `.page` padding as margins and its `@page`/`.page` geometry as
  page size (blue "Using margins from HTML…" notice). If you see 10mm
  defaults instead, the file has no `.page` padding — pick specific margins
  in General settings.
- **Blank images/fonts in preview or PDF** — two different causes, the app
  warning tells them apart:
  - *Local images* (`cover-photo.jpg`, `assets/hero.png`): an uploaded
    file is read as text, so the browser can never resolve sibling image
    files — these **always** rasterize blank until inlined, even though the
    file renders fine from disk. Three fixes (pick one): click
    **Attach images…** under the warning and pick the referenced image
    files; bake them offline with
    `python3 scripts/inline-local-images.py guide.html` (→
    `guide.inlined.html`); or paste an already-inlined file.
  - *Remote URLs* (`https://…`): `html2canvas` needs CORS-enabled URLs
    (`Access-Control-Allow-Origin`). The raster pipeline auto-inlines
    CORS-fetchable remote images, font files, and whole linked stylesheets
    (e.g. Google Fonts) to `data:` URLs before rasterizing, and waits for
    webfonts/images (`document.fonts.ready` + image decode, bounded ~5s).
    Anything left blank (non-CORS hosts) must be inlined as `data:` URLs or
    self-hosted. CORS bypasses that work: serve the assets from the same
    origin, add `Access-Control-Allow-Origin: *` on the asset host, or
    download the files and reference/inline them locally.
  - *Local font files* (`_fonts/*.ttf`, `C:\Windows\Fonts\…`): an uploaded
    file is read as text, so the browser can never see sibling font files —
    these **always** render as fallback fonts until inlined. Three fixes
    (pick one): click **Attach font files…** under the warning and pick the
    referenced `.ttf/.otf/.woff2` files; bake them offline with
    `python3 scripts/inline-local-fonts.py guide.html` (→
    `guide.inlined.html`); or swap the `@font-face` blocks for a Google
    Fonts `<link>` (e.g. Noto Serif) — linked stylesheets are re-injected
    per page and auto-inlined at render time.
- **⚠ overflows badge** — the page content is taller than the usable area at
  current margins and will be clipped. Shorten the content or lower the margins.
- **Tailwind classes in uploaded HTML don't render** — uploaded pages only get
  the document's own `<style>` blocks (scoped per page), not the app's Tailwind
  build. Ask the agent for plain `<style>` CSS (the samples demonstrate this).
- **Advanced CSS looks off** — `html2canvas` doesn't support blend modes and
  some modern selectors. Simplify the CSS or lower the DPI and retry.
- **Autosave didn't restore** — private-mode storage, quota limits (huge files
  are skipped), or a cleared site-data cache. Use **Save project** for backups.
- **Large documents are slow** — lower DPI (72–150) while editing, raise it
  back (192–300) for the final export.

## Scripts

- `npm run dev` — dev server on `0.0.0.0:5173`
- `npm run build` — type-check + production build (`dist/`)
- `npm run preview` — preview prod build on `0.0.0.0:4173`
- `npm run lint` — oxlint
- `npm run test` — vitest (`src/core/*.test.ts`: parse, numbering, settings,
  CSS scoping, project save/load, autosave/recents)
- `npm run pdf -- input.html [output.pdf]` — WeasyPrint render with defaults
  (see "Local Python rendering" above)
- `python3 scripts/inline-local-fonts.py guide.html [--font-dirs DIR …]
  [--extra-font Name.ttf=/path/to.ttf] [-o out.html]` — bake local
  `@font-face` files into the HTML as `data:` URLs (fixes blank/wrong fonts
  after upload; no dependencies, stdlib only)
- `python3 scripts/inline-local-images.py guide.html [--img-dirs DIR …]
  [--extra-img Name.jpg=/path/to.jpg] [-o out.html]` — bake local
  `<img src>` / CSS image files into the HTML as `data:` URLs (fixes blank
  images after upload; no dependencies, stdlib only)

## Deploy

Push to `main` → `.github/workflows/deploy-pages.yml` builds and deploys
`dist/` to GitHub Pages (project base `/html-to-pdf/`). Enable Pages:
repo Settings → Pages → Source: GitHub Actions. CI (`.github/workflows/ci.yml`)
runs lint + test + build on every push/PR to `main`.

## Contributing

- Keep business logic in pure `src/core/` (no React/DOM except the raster and
  measurement passes); components stay in `src/components/` (Atomic Design).
- Every component needs a showcase file under `src/showcases/` registered in
  `src/showcases/index.ts`.
- Add/extend `src/core/*.test.ts` for core changes; keep `npm run lint`,
  `npm run test`, and `npm run build` green before pushing.

## Plan

Detailed 3-phase plan: [`PLAN.md`](./PLAN.md)
