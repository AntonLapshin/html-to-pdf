# html-to-pdf — 3-Phase Plan

Pure-UI tool (no backend). Workflow: an agent generates a beautiful HTML doc
(e.g. a slow-living guide) already split into `<div class="page">…</div>`
blocks → user runs `npm run dev` (host `0.0.0.0`) → uploads the HTML →
tunes margins / page numbers → checks the accurate per-page preview
(click to expand) → downloads the PDF.

Stack: Vite + React + TypeScript + TailwindCSS.
PDF reference: `AntonLapshin/book` (`src/state.jsx` `createPdf`: jsPDF +
image re-encode at DPI/quality, `containedSize`, page-number overlay,
margin/gap math, project save/load).
Showcase reference: `AntonLapshin/showcase` (registry `{ name, showcases }`,
sidebar + canvas + `?file=..&showcase=..` deep-linking, core/UI split).
Architecture: Atomic Design (`atoms → molecules → organisms → templates`),
pure `src/core` (no React/DOM except raster step), every component has a
showcase file under `src/showcases/`.

Live URL (after Pages enable): `https://antonlapshin.github.io/html-to-pdf/`

---

## Phase 1 — Foundation & First PDF (MVP shell)

Goal: repo builds, deploys to GitHub Pages, and the end-to-end loop works:
upload → preview grid → settings → download.

1. **Project bootstrap** (done in initial commit)
   - Vite React-TS + Tailwind v4 (`@tailwindcss/vite`), `base: "/html-to-pdf/"`,
     `dev: vite --host 0.0.0.0 --port 5173`.
   - Deps: `jspdf`, `html2canvas`. Dev: `typescript`, `oxlint`.
   - Folders: `src/core/` (pure logic), `src/components/atoms|molecules|organisms/`,
     `src/showcases/`, `src/ui/`, `public/sample/`.
   - `.github/workflows/deploy-pages.yml` + `ci.yml` (Node 20, `npm ci`,
     build `dist/`, official Pages actions). Default branch `main`.
2. **Core: HTML → pages**
   - `src/core/parseHtml.ts`: `DOMParser` → extract all `.page` innerHTML in
     order + concatenated `<style>` blocks; `buildPageSrcDoc()` wraps one page
     with styles + margin padding + optional page-number div.
   - Contract: **one `.page` DOM tree = exactly one PDF page**; content must
     never spill across pages (each page rasterized independently).
   - Error path: zero `.page` blocks → friendly message telling the agent
     prompt to split into `<div class="page">`.
3. **Core: PDF export** (`src/core/pdf.ts`, ported from `book`)
   - Hidden 794px stage (≈210mm @96dpi) → per page `html2canvas(scale: 2)` →
     `jsPDF({ portrait, mm, a4 })` → `addImage` full-bleed A4 → `doc.text`
     page number bottom-center → `doc.save()`.
   - Progress callback `Rendering i/n…` on the Download button.
4. **UI (Atomic)**
   - Atoms: `Button` (primary/secondary/ghost), `Slider`, `Toggle`.
   - Molecules: `UploadZone` (file input + Load sample), `SettingsPanel`
     (margin mm slider, show/hide numbers + start number), `PageCard`
     (A4-ratio thumbnail iframe, click → expand).
   - Organisms: `AppHeader` (title, count, Showcases link, Download),
     `PreviewGrid`, `PageModal` (prev/next, fullscreen accurate preview).
   - Preview fidelity rule: preview iframe `srcDoc` and PDF raster share the
     same HTML + styles + margin + number text.
5. **Showcases**
   - Convention identical to `AntonLapshin/showcase`: each file exports
     `name` + variant components; registry in `src/showcases/index.ts`.
   - Current: local `ShowcaseGallery` (`?view=showcase`, `?file=&showcase=`
     deep links). Task before Phase 1 exit: switch to the real lib
     (`"showcase": "github:AntonLapshin/showcase"`, then
     `import { Showcase } from "showcase"`), once its `dist/` publish path
     works — today the repo has no `dist/`, so a raw git dep cannot resolve.
   - Required showcases: `Button`, `UploadZone`, `SettingsPanel`, `PageCard`.
6. **Sample + docs**: `public/sample/slowliving-sample.html` (3 `.page`
   blocks with `<style>`), README quickstart.

Exit criteria: `npm install && npm run lint && npm run build` green;
`npm run dev` reachable on LAN; upload sample → 3 thumbnails → expand modal
→ Download PDF with 3 A4 pages + numbers; Pages site live.

## Phase 2 — Accurate (WYSIWYG) Preview & Settings

Goal: preview pixels == PDF pixels; settings feel live and precise.

1. **Single raster pipeline**: extract one `renderPage(page, settings): canvas`
   used by both preview thumbnails and PDF export (preview uses downscaled
   data-URL, PDF uses full-res). Eliminate iframe-vs-canvas divergence.
2. **Render isolation**: uploaded `<style>` scoped per page (prefix or Shadow
   DOM / sandboxed iframe measurement pass) so one page's CSS can't leak;
   inline external fonts/images handled with `useCORS` + CORS warnings.
3. **Overflow guard**: detect `.page` content taller than A4 usable area at
   current margin → warn badge on the card ("content overflows, will be
   scaled/clipped") instead of silent clipping.
4. **Expand modal upgrade**: zoom 50–200%, keyboard ←/→/Esc, thumbnail strip,
   render-status per page (pending/ready/error).
5. **Settings upgrade** (generalize from book): page size A4/Letter, margin
   per-edge or uniform mm, number position (bottom-center/corner), start
   number, DPI (72–300) + JPEG quality — reuse book's `reencodeImage` idea.
6. **Showcases**: add `PreviewGrid`, `PageModal`, `Slider`, `Toggle`
   showcases; wire gallery to real `showcase` lib; keep core/UI split
   (no business logic in components).

Exit criteria: side-by-side preview vs PDF screenshot indistinguishable at
same margin/numbers; overflow + CORS errors surfaced; all components have
showcases; deep links shareable.

## Phase 3 — Polish, Samples & Docs

Goal: delightful daily driver for agent-generated guides.

1. **Upload UX**: drag-and-drop, paste-HTML option, recent-file history,
   project save/load JSON (port book's `saveProject`/`loadProject`: pages as
   data-URLs + settings), `localStorage` autosave.
2. **Samples gallery**: 2–3 prompt-generated examples (slow-living guide,
   recipe book, travel journal) + the exact agent prompt snippet that produces
   `.page`-split HTML.
3. **A11y + responsive**: keyboard-navigable grid/modal, focus trap in modal,
   mobile single-column, print stylesheet not required (PDF is the output).
4. **Quality gates**: vitest for `src/core` (parse, numbering, settings),
   100% core coverage goal per showcase repo convention; oxlint clean;
   CI runs lint + test + build.
5. **Docs**: README with screenshots/GIF, troubleshooting (fonts, images,
   Tailwind in uploaded HTML, page-count limits), Pages link, showcase link,
   contribution notes.

Exit criteria: full workflow from a fresh agent HTML to downloaded PDF in
under a minute; docs let a new user reproduce it; CI green; repo public at
`github.com/AntonLapshin/html-to-pdf`.

---

## Risks & decisions

- `html2canvas` supports most CSS but not everything (blend modes, some
  modern selectors) → alternative `html-to-image` (foreignObject SVG) kept
  as fallback; decision logged in Phase 2.
- Uploaded HTML may include Tailwind classes without Tailwind loaded →
  Phase 2 inlines a Tailwind browser build or instructs agents to use plain
  `<style>` CSS (sample demonstrates the safe path).
- `showcase` lib has no published `dist/` yet → local gallery now, real lib
  import in Phase 1 exit (tracked task, not a blocker).
