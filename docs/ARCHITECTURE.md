# Architecture

One rule drives this codebase: **one `.page` DOM tree = exactly one PDF page**.
Every module below exists to protect that contract.

## Data flow

```
upload / paste / sample / recent / project / autosave
  → useProjectSource ── parseHtmlPages (.page blocks + <style> + <link>)
  → settings (size, margins incl. "from HTML", numbers, DPI, quality)
  → usePageRenders ── renderPageCanvas per page (THE single raster pipeline)
      ├── preview thumbnails (canvasToPreviewUrl, 768px)
      ├── expanded modal (canvasToDetailUrl, 1500px, or vector srcDoc)
      └── generatePdf (full-res canvas → JPEG → jsPDF full-bleed)
  → Merge PDFs tab ── mergePdfBytes (pdf-lib, pages concatenated, sizes kept)
```

Preview pixels == PDF pixels by construction: thumbnails, modal raster mode
and PDF export all consume the same `renderPageCanvas` output.

## `src/core` module map (pure logic, no React)

| Module | Owns | Key exports |
|---|---|---|
| `parseHtml.ts` | Upload parsing: `.page` blocks, `<style>` concat, `<link>` keep-list, vector `srcDoc` | `parseHtmlPages`, `buildPageSrcDoc` |
| `settings.ts` | Sizes, margins (incl. `.page`-padding adoption), DPI/quality, clamping | `DEFAULT_SETTINGS`, `clampSettings`, `effectiveMargins`, `extractPagePadding`, `detectPageSize` |
| `pageNumbers.ts` | `N / total` text + overlay style (cycle-free home both sides import) | `pageNumberText`, `numberOverlayStyle` |
| `cssScope.ts` | Per-page CSS scoping, print hoisting, reveal safety, shell reset, bg extract | `scopeCss`, `extractPrintCss`, `extractPageBackground`, `REVEAL_OVERRIDE`, `SHELL_RESET` |
| `assets.ts` | Remote inlining (CORS bypass): stylesheets, fonts, images → `data:` URLs | `inlineExternalAssets`, `inlineExternalStylesheets`, `inlineCssUrls`, `fetchAsDataUrl`, `fetchStylesheetText`, `clearInlineCache` |
| `embed.ts` | Local-file baking by basename (TS twin of `scripts/inline_lib.py`) | `embedFontsInSource`, `embedImagesInSource`, `buildAssetMap` |
| `refs.ts` | External/local ref census + user-facing warning | `collectExternalRefs(ForPages)`, `corsWarning` |
| `raster.ts` | Holder construction + the ONLY pixels path + overflow measure | `renderPageCanvas`, `buildRenderHolder`, `measureOverflow(Async)`, `withTimeout`, `waitForHolderAssets` |
| `canvas.ts` | JPEG re-encode + downscale helpers | `reencodeImage`, `canvasToDataUrl`, `canvasToPreviewUrl/DetailUrl`, `downscaleCanvas` |
| `pdf.ts` | PDF export: raster → JPEG → jsPDF full-bleed, progress, save | `generatePdf` |
| `mergePdf.ts` / `pdfUtils.ts` | Merge pipeline + presentation helpers | `mergePdfBytes`, `moveItem`, `isPdfFile`, `formatBytes` |
| `project.ts` / `storage.ts` | Project save/load JSON + autosave/recents in localStorage | `serializeProject`, `deserializeProject`, `saveAutosave`, `addRecentFile` |
| `fileHelpers.ts` | Sample fetch, blob download, `FileReader` → `data:` URLs | `fetchSample`, `downloadText/Blob`, `readFilesAsDataUrls` |
| `samples.ts` | Gallery metadata + the agent prompt snippet | `SAMPLES`, `AGENT_PROMPT_SNIPPET` |
| `errors.ts` / `renderTypes.ts` | Typed errors + shared raster types | `RasterError`, `AssetInlineError`, `Result`, `RenderInput` |

Dependency direction is one-way: `refs`/`raster` → `assets` → `renderTypes`;
`parseHtml` ↔ old `render` cycle was broken in Phase 1 via `pageNumbers.ts`.

## Raster decision: primary vs fallback

`renderPageCanvas` tries two engines per page (decided in Phase 2):

- **Primary: `html-to-image`** (SVG foreignObject, native browser paint).
  Text and boxes share one paint pass, so they can't drift apart, and the
  author's `.page` background survives. Taints on non-CORS remote images.
- **Fallback: `html2canvas`** (`useCORS`, bounded timeouts). Catches tainted
  canvases, SVG-hostile markup and hanging font hosts.

A taint probe (`getImageData(0,0,1,1)`) after the primary decides the switch;
both failing raises a typed `RasterError` chaining both causes. Holders are
staged in a hidden same-origin iframe at a natural (0,0) position so
foreignObject serialization sees laid-out, in-viewport content, after a
bounded wait for webfonts/images (`waitForHolderAssets`).

## UI layers

- `src/ui/`: state hooks — `useProjectSource` (all source workflows),
  `usePageRenders` (debounced raster runs), `usePdfMerger`, `usePageNav`,
  `useFocusTrap`. Independently tested.
- `src/components/`: Atomic Design (`atoms → molecules → organisms`).
  Organisms stay presentational; workflow state lives in the hooks above.
- `src/showcases/`: one showcase per component (see `docs/CONTRIBUTING.md`).

## Local rendering twin (`scripts/`)

`scripts/render.py` (WeasyPrint, no browser) mirrors the app contract for
pixel comparison — see `docs/local-rendering.md`. `scripts/inline_lib.py`
mirrors `src/core/embed.ts` basename matching.
