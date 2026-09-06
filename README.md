# html-to-pdf

Pure-UI tool: upload any HTML already split into `.page` blocks → accurate
per-page PDF preview (click to expand) → tune margin / page numbers →
download an A4 PDF where **each `.page` DOM tree is exactly one PDF page**.

Live demo: `https://antonlapshin.github.io/html-to-pdf/` (after enabling Pages)

## Quickstart

```bash
npm install
npm run dev      # vite --host 0.0.0.0 --port 5173 (LAN-reachable)
```

Typical workflow:

1. Ask an agent to produce a beautiful HTML guide (e.g. slow living) and
   instruct it to split content into `<div class="page">…</div>` sections
   with a plain `<style>` block.
2. Open the tool, **Upload HTML** (or **Load sample**).
3. Tune **Margin** and **Show page numbers**; every card is a WYSIWYG page.
4. Click any page to expand (←/→ in modal), then **Download PDF**.

## Showcases

Every component has a showcase under `src/showcases/` following
[AntonLapshin/showcase](https://github.com/AntonLapshin/showcase) convention
(`name` + variant components, `?file=..&showcase=..` deep links).
Open via **Showcases** in the header or `?view=showcase`.

## PDF reference

Export pipeline is ported from
[AntonLapshin/book](https://github.com/AntonLapshin/book) (`createPdf`):
`html2canvas` per `.page` at full A4 width → `jsPDF` portrait A4
`addImage` → drawn page numbers → `doc.save()`. See `src/core/pdf.ts`.

## Plan

Detailed 3-phase plan: [`PLAN.md`](./PLAN.md)

## Scripts

- `npm run dev` — dev server on `0.0.0.0:5173`
- `npm run build` — type-check + production build (`dist/`)
- `npm run preview` — preview prod build on `0.0.0.0:4173`
- `npm run lint` — oxlint

## Deploy

Push to `main` → `.github/workflows/deploy-pages.yml` builds and deploys
`dist/` to GitHub Pages (project base `/html-to-pdf/`). Enable Pages:
repo Settings → Pages → Source: GitHub Actions.
