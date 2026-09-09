# Troubleshooting

- **"No .page blocks found"** — the HTML must contain
  `<div class="page">…</div>` sections. Re-prompt the agent with the snippet
  in the README.
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
