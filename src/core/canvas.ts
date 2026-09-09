/**
 * Canvas encoding helpers (Phase 1 split of `render.ts`).
 * No imports — DOM canvas only.
 */

/**
 * Book's `reencodeImage` idea: normalize canvas → JPEG data-URL at the
 * configured quality (keeps PDF size predictable across DPI settings).
 */
export function reencodeImage(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", Math.min(1, Math.max(0.1, quality)));
}

/**
 * Single downscale helper behind `canvasToPreviewUrl` / `canvasToDetailUrl`:
 * normalize canvas → JPEG data-URL, downscaling to `maxWidth` when larger.
 * Small canvases are encoded as-is at the requested quality.
 */
export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  maxWidth: number,
  quality: number,
): string {
  const ratio = Math.min(1, maxWidth / canvas.width);
  if (ratio >= 1) return canvas.toDataURL("image/jpeg", quality);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * ratio));
  small.height = Math.max(1, Math.round(canvas.height * ratio));
  const ctx = small.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", quality);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, small.width, small.height);
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", quality);
}

/** Downscaled data-URL for grid thumbnails (same pixels as PDF, fewer bytes).
 * 768px wide + q0.85 keeps small cards crisp on retina without bloating memory. */
export function canvasToPreviewUrl(canvas: HTMLCanvasElement, maxWidth = 768): string {
  return canvasToDataUrl(canvas, maxWidth, 0.85);
}

/** Higher-res data-URL for the expanded modal raster mode.
 * 1500px wide + q0.9 stays sharp when zoomed to 200%. */
export function canvasToDetailUrl(canvas: HTMLCanvasElement, maxWidth = 1500): string {
  return canvasToDataUrl(canvas, maxWidth, 0.9);
}
