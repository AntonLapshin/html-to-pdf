/**
 * Typed errors for the raster / asset pipeline (Phase 2).
 *
 * Contract: low-level fetch helpers (`fetchAsDataUrl`,
 * `fetchStylesheetText`) keep their historical `null`-on-failure return so
 * callers can best-effort inline. Anything that needs a reason uses these
 * classes, which always chain `cause` so the original failure is visible.
 */

export type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** A remote asset (stylesheet, font, image) could not be inlined. */
export class AssetInlineError extends Error {
  readonly url: string;
  constructor(url: string, message?: string, options?: { cause?: unknown }) {
    super(message ?? `Could not inline asset: ${url}`, options);
    this.name = "AssetInlineError";
    this.url = url;
  }
}

/** Page rasterization failed on every engine (primary + fallback). */
export class RasterError extends Error {
  readonly pageIndex: number;
  constructor(pageIndex: number, message?: string, options?: { cause?: unknown }) {
    super(message ?? `Raster failed for page ${pageIndex + 1}`, options);
    this.name = "RasterError";
    this.pageIndex = pageIndex;
  }
}

/** A bounded wait (asset load, raster timeout) elapsed. */
export class RasterTimeoutError extends RasterError {
  readonly timeoutMs: number;
  constructor(pageIndex: number, timeoutMs: number, options?: { cause?: unknown }) {
    super(pageIndex, `Raster timed out after ${timeoutMs}ms (page ${pageIndex + 1})`, options);
    this.name = "RasterTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
