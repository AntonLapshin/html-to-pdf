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

Fresh HTML → downloaded PDF in under a minute:

1. Ask an agent to produce a beautiful HTML guide (see the prompt snippet below).
2. Open the tool, **Upload HTML** — or drag & drop the file, **Paste HTML**, or pick a sample.
3. Tune **page size / margins / numbers / DPI / quality**; every card is a WYSIWYG page.
4. Click any page to expand (←/→ in modal, Esc to close), then **Download PDF**.
5. Your work autosaves to the browser; **Save project** exports a JSON backup.

## Upload

**Upload HTML** (click, drag & drop), **Paste HTML** (raw markup with
`.page` blocks), the **Samples gallery**, **Recent files** (last 5, one-click
reopen), or **Load project** (a saved `.html-to-pdf.json`). Large uploads
skip autosave past ~800KB — use **Save project** for backups.

## Settings

- **Page size**: A4 (210×297mm) or Letter (215.9×279.4mm). On upload the
  tool auto-detects the file's design (`@page { size: … }` or `.page`
  width/height) and switches to it.
- **Margins**: **From HTML** (default on upload — reuses the file's own
  `.page` padding), uniform slider, or per-edge (top/right/bottom/left),
  0–40mm. Browser-viewer rules (`@media screen` margins/shadows on `.page`)
  are always reset so they can't leak into the PDF.
- **Page numbers**: `N / total` overlay starting from a configurable number,
  positioned bottom-center/left/right (baked into the raster so preview == PDF).
- **DPI** (72–300): raster resolution via `scale = DPI/96`.
- **JPEG quality** (10–100%): re-encodes the raster to keep PDF size predictable.

## Preview

Every card renders through the single raster pipeline (`renderPageCanvas`),
so preview pixels == PDF pixels by construction. Cards show an **⚠ overflows**
badge when content exceeds the usable area; the expanded modal offers
**Crisp** (vector) vs **PDF pixels** (exact raster) modes, zoom 50–300%,
keyboard ←/→/Esc navigation and a thumbnail strip.

## PDF & Merge

**Download PDF** exports one full-bleed page per `.page` block
(`renderPageCanvas` → JPEG re-encode → `jsPDF`, see `src/core/pdf.ts`).
The **Merge PDFs** tab combines PDFs in the browser via `pdf-lib` (loaded on
demand): upload or drag & drop files, drag rows to reorder (↑ ↓ buttons work
too, ✕ removes), then **Download combined PDF** (`combined.pdf`, pages
concatenated in list order, each page keeping its original size).

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

## Showcases

Every component has a showcase under `src/showcases/` following
[AntonLapshin/showcase](https://github.com/AntonLapshin/showcase) convention
(`name` + variant components, `?file=..&showcase=..` deep links).
Open via **Showcases** in the header or `?view=showcase`.
The gallery is intentionally local: the upstream `showcase` repo still ships no
`dist/`, so a raw `github:` dependency cannot resolve at install time.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — module map, raster decision, data flow
- [Local rendering](docs/local-rendering.md) — WeasyPrint pipeline + baking local fonts/images
- [Troubleshooting](docs/troubleshooting.md) — blank pages, fonts, CORS, margins
- [Contributing](docs/CONTRIBUTING.md) — lint/test/build, coverage rule, conventions

## Scripts

- `npm run dev` — dev server on `0.0.0.0:5173`
- `npm run build` — type-check + production build (`dist/`)
- `npm run preview` — preview prod build on `0.0.0.0:4173`
- `npm run lint` — oxlint
- `npm run test` — vitest (core, component, hook tests)
- `npm run test:coverage` — vitest with enforced thresholds (see Contributing)
- `npm run pdf -- input.html [output.pdf]` — WeasyPrint render with defaults
  (see [Local rendering](docs/local-rendering.md))
- `pytest scripts/` — Python smoke tests (`scripts/requirements-dev.txt`)

## Deploy

Push to `main` → `.github/workflows/deploy-pages.yml` builds and deploys
`dist/` to GitHub Pages (project base `/html-to-pdf/`). Enable Pages:
repo Settings → Pages → Source: GitHub Actions. CI (`.github/workflows/ci.yml`)
runs lint + test + coverage + build plus pytest on every push/PR to `main`.

## Plan

Detailed 3-phase plan: [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) (the original
[`PLAN.md`](./PLAN.md) is superseded and kept for history).
