/**
 * Compatibility barrel (Phase 1 refactor).
 * `render.ts` was split by concern — `cssScope.ts`, `assets.ts`,
 * `raster.ts`, `canvas.ts`, `refs.ts` (+ `pageNumbers.ts`, `renderTypes.ts`)
 * — without changing signatures. Existing imports from `./render` keep
 * working. Delete this shim in Phase 2 and import the modules directly.
 */
export type { RenderInput, RenderStatus } from "./renderTypes";
export { numberOverlayStyle, pageNumberText } from "./pageNumbers";
export {
  extractPageBackground,
  extractPrintCss,
  REVEAL_OVERRIDE,
  scopeCss,
  SEEN_CLASSES,
  SHELL_RESET,
} from "./cssScope";
export {
  assetBasename,
  clearInlineCache,
  embedFontsInSource,
  embedImagesInSource,
  fetchAsDataUrl,
  fetchStylesheetText,
  fetchWithTimeout,
  hasImageExtension,
  inlineCssUrls,
  inlineExternalAssets,
  inlineExternalStylesheets,
  isRemoteUrl,
  replaceUrlsByBasename,
} from "./assets";
export {
  buildRenderHolder,
  measureOverflow,
  measureOverflowAsync,
  renderPageCanvas,
  waitForHolderAssets,
  withTimeout,
} from "./raster";
export {
  canvasToDataUrl,
  canvasToDetailUrl,
  canvasToPreviewUrl,
  reencodeImage,
} from "./canvas";
export type { ExternalRefs } from "./refs";
export {
  collectExternalRefs,
  collectExternalRefsForPages,
  collectLocalFontUrls,
  collectLocalImageUrls,
  corsWarning,
  isLocalAssetUrl,
} from "./refs";
