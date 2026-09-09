import type { NumberPosition } from "./settings";

/**
 * Leaf module for page-number helpers (Phase 1 refactor).
 * `pageNumberText` used to live in `parseHtml.ts`, which `render.ts`
 * imported — while `parseHtml.ts` imported CSS helpers back from
 * `render.ts` (circular import). Both sides now import from here.
 */
export function pageNumberText(
  show: boolean,
  start: number,
  index: number,
  total: number,
): string | null {
  if (!show) return null;
  return `${start + index} / ${total}`;
}

/** Inline style for the baked-in page-number overlay (raster + vector agree). */
export function numberOverlayStyle(position: NumberPosition): string {
  const base =
    "position:absolute;left:0;right:0;font-size:11px;color:#64748b;pointer-events:none;";
  switch (position) {
    case "bottom-left":
      return `${base}bottom:6mm;text-align:left;padding-left:2mm;`;
    case "bottom-right":
      return `${base}bottom:6mm;text-align:right;padding-right:2mm;`;
    case "bottom-center":
    default:
      return `${base}bottom:6mm;text-align:center;`;
  }
}
