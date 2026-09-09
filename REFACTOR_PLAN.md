# html-to-pdf — Refactoring Plan (3 phases)

Evidence: `src/core/render.ts` 1089 lines / 18 exported functions, `src/App.tsx` 479 lines,
`PageModal.tsx` 232 lines / 8 hooks, `PdfMerger.tsx` 275 lines, 98 tests passing (6 files),
4 oxlint `react/set-state-in-effect` warnings, `tsc` clean, `@vitest/coverage-v8` missing,
`parseHtml.ts ↔ render.ts` circular import, `vitest.include` excludes `*.test.tsx`,
`scripts/*.py` have zero tests. Verified 2026-09-09 via `npm run test/lint`, `tsc -b`, `wc -l`, import grep.

## Analysis summary

| # | Finding | Where | Impact |
|---|---------|-------|--------|
| 1 | God module: 6 concerns in one file (CSS scoping, holder/raster, network inlining, canvas encoding, overflow measure, CORS analysis) | `src/core/render.ts:31–1088` | Hard to test, review, or change raster path safely |
| 2 | Circular import: `render.ts → parseHtml.ts → render.ts` (`pageNumberText` vs `scopeCss`/`extractPrintCss`/constants) | `src/core/render.ts:3`, `src/core/parseHtml.ts:1` | Fragile init order, blocks clean module split |
| 3 | God component: file/sample/paste/recents/autosave/derived memos/handlers all inline | `src/App.tsx` (479 lines) | Any workflow change touches everything |
| 4 | Mixed UI + logic: focus-trap + key nav + raster/vector toggle + render in one component; pdf-lib load + IO + reorder + UI in one | `PageModal.tsx`, `PdfMerger.tsx`, `usePageRenders.ts:47` (set-state-in-effect) | 4 oxlint warnings, untestable hooks |
| 5 | Near-duplicate pairs | `measureOverflow`/`measureOverflowAsync`, `canvasToPreviewUrl`/`DetailUrl`/`SizedUrl`, `fetchAsDataUrl`/`fetchStylesheetText`, `embedFontsInSource`/`embedImagesInSource`, `inline-local-fonts.py`/`inline-local-images.py` | ~200 lines of copy-paste to maintain |
| 6 | Test gaps: `pdf.ts:generatePdf` untested, zero component/hook tests, zero Python tests, coverage dep missing, `*.test.tsx` not included | `src/core/pdf.ts`, `src/**/*.tsx`, `scripts/`, `vite.config.ts:18-20`, `package.json` | Regression risk exactly on PDF output path |
| 7 | Docs drift: `PLAN.md` describes Phases 1–3 as future work (all shipped), README (267 lines) mixes user/dev/Python/troubleshooting, no architecture map, no `src/core` API reference | `PLAN.md`, `README.md` | New contributors can't find module boundaries |

## Phase 1 — Clean up (safe, no behavior change)

Goal: break the cycle, isolate modules, silence lint, restore coverage tooling.
1. Break `render ↔ parseHtml` cycle: move `pageNumberText` (or `numberOverlayStyle` + position type) into `src/core/pageNumbers.ts` (or into `settings.ts`); both import from there. Verify with import grep + `tsc -b`.
2. Split `render.ts` by concern without changing signatures (re-export barrel for compat):
   - `cssScope.ts`: `scopeCss`, `scopeCssInner`, `extractPrintCss`, `extractPageBackground`, `REVEAL_OVERRIDE`, `SEEN_CLASSES`, `SHELL_RESET`
   - `assets.ts`: `fetchAsDataUrl`, `fetchStylesheetText`, `inlineCssUrls`, `inlineExternalStylesheets`, `inlineExternalAssets`, `embedFontsInSource`, `embedImagesInSource`, cache + `clearInlineCache`
   - `raster.ts`: `buildRenderHolder`, `renderPageCanvas`, `withTimeout`, `waitForHolderAssets`
   - `canvas.ts`: `reencodeImage`, `canvasToPreviewUrl/DetailUrl/SizedUrl`
   - `refs.ts`: `collect*`, `corsWarning`, `isLocalAssetUrl`, `ExternalRefs`
   - keep `render.ts` as re-export shim (delete in Phase 2).
3. Dedupe lowest-risk pairs: single `canvasToDataUrl(canvas, maxWidth)` behind the two wrappers; single `fetchWithTimeout(url, ms)` behind both fetchers; single `replaceByBasename(source, files, pattern)` behind both embedders.
4. Fix 4 oxlint warnings: `usePageRenders.ts:47,104`, `PageModal.tsx:41,44` (derive during render / copy ref in effect). `npm run lint` clean.
5. Tooling: add `@vitest/coverage-v8`, extend `vite.config.ts` include to `src/**/*.test.{ts,tsx}`, add `test:coverage` threshold skeleton (no enforcement yet). Delete `scripts/__pycache__/`, add `__pycache__/` to `.gitignore` if missing.
- Exit: `npm run lint`, `npm run test`, `npm run build` green; no import cycles (`npx madge` or grep check); no behavior change.

## Phase 2 — Simplify & improve quality

Goal: small components, single-responsibility helpers, typed errors.
1. `App.tsx` → extract `useProjectSource.ts` (file/sample/paste/recent/autosave state), `fileHelpers.ts` (`fetchSample`, `downloadText`); `App.tsx` keeps composition only (target <150 lines).
2. `PageModal.tsx` → extract `useFocusTrap(dialogRef)` + `usePageNav(total)` hooks; raster/vector toggle becomes `PageRenderView` component. Target: modal <120 lines, hooks independently testable.
3. `PdfMerger.tsx` → extract `usePdfMerger()` (load/reorder/merge/download) from presentational list; `isPdfFile`, `formatBytes` move to `src/core/pdfUtils.ts` with unit tests.
4. Collapse remaining duplication: one `measureOverflow(page, settings, …)` with `{ async: boolean }` or async-only path; one `downscaleCanvas` helper; shared `assetBasename` map builder for both Python + TS sides; evaluate merging the two `inline-local-*.py` scripts behind a common `inline_lib.py`.
5. Introduce typed errors (`AssetInlineError`, `RasterError` with `cause`) instead of nullable `null`-on-failure + silent catch; add `Result<T>` or documented `null` contract per module. Add `DEFAULT_SETTINGS` freeze + `clampSettings` property tests.
- Exit: no file >300 lines except `raster.ts`; oxlint clean; `tsc` strict clean; existing 98 tests still green unmodified (except import paths).

## Phase 3 — Tests & docs

Goal: cover the PDF path, lock behavior, document architecture.
1. Unit tests (vitest):
   - `src/core/pdf.test.ts`: mock `renderPageCanvas` + `jsPDF`, assert page count, margins, `N/total` overlay wiring (currently 0% on the main output path).
   - `src/core/canvas.test.ts`, `assets.test.ts` (extend existing `render.test.ts` cases after split), `pdfUtils.test.ts`.
   - Component tests (`*.test.tsx`, now included): `SettingsPanel` clamping, `UploadZone` paste/drag handlers, `PageModal` key nav, `PdfMerger` reorder — via Testing Library + mocked core.
   - Hook test: `usePageRenders` debounce/cancellation via fake timers.
2. Python: `requirements-dev.txt` + `pytest` smoke tests for `inline-local-fonts/images.py` (basename mapping, data-URL round-trip) and `render.py` arg parsing; wire into CI.
3. Coverage: enforce `--coverage` thresholds (core ≥90%, new code 100% on `pdf/canvas/assets`), add `coverage/` to `.gitignore`.
4. Docs:
   - Rewrite `README.md`: Quickstart → Upload → Settings → Preview → PDF/Merge → Samples; move WeasyPrint + font/image inlining into `docs/local-rendering.md`; move troubleshooting into `docs/troubleshooting.md`.
   - New `docs/ARCHITECTURE.md`: module map (`cssScope/assets/raster/canvas/refs`), raster primary-vs-fallback decision (already in PLAN.md Risks), data flow diagram.
   - New `docs/CONTRIBUTING.md`: lint/test/build, coverage rule, showcase convention.
   - Mark `PLAN.md` superseded (header link to this file) or move to `docs/PLAN-archive.md`; add JSDoc to every `src/core` export.
   - CI: add coverage + pytest jobs to `.github/workflows/ci.yml`.
- Exit: `npm run test:coverage` meets thresholds, `pytest` green, README recipe reproduces fresh-HTML→PDF in <1 min, CI green.
