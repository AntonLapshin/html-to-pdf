export type PageSize = "a4" | "letter";
export type MarginMode = "uniform" | "custom";
export type NumberPosition = "bottom-center" | "bottom-left" | "bottom-right";

export interface EdgeMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PdfSettings {
  /** Page size. A4 = 210x297mm, Letter = 215.9x279.4mm. */
  pageSize: PageSize;
  /** Uniform margin (used when marginMode === "uniform"), in mm. */
  marginMm: number;
  /** Per-edge margins (used when marginMode === "custom"), in mm. */
  marginsMm: EdgeMarginsMm;
  marginMode: MarginMode;
  /** Overlay "N / total" when true. */
  showPageNumbers: boolean;
  /** First printed page number. */
  startPageNumber: number;
  /** Where the page-number overlay is drawn. */
  numberPosition: NumberPosition;
  /** Raster DPI for html2canvas (72–300). 96 ≈ scale 1, 192 ≈ scale 2. */
  dpi: number;
  /** JPEG quality 0.1–1 (book's `reencodeImage` idea). */
  quality: number;
}

export const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: "a4",
  marginMm: 10,
  marginsMm: { top: 10, right: 10, bottom: 14, left: 10 },
  marginMode: "uniform",
  showPageNumbers: true,
  startPageNumber: 1,
  numberPosition: "bottom-center",
  dpi: 192,
  quality: 0.92,
};

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export const PAGE_DIMS_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

/** CSS pixels for a mm length at 96 CSS dpi. */
export const mmToPx = (mm: number): number => (mm / 25.4) * 96;

export function pageDimsPx(pageSize: PageSize): { width: number; height: number } {
  const dims = PAGE_DIMS_MM[pageSize];
  return { width: Math.round(mmToPx(dims.width)), height: Math.round(mmToPx(dims.height)) };
}

export function effectiveMargins(settings: PdfSettings): EdgeMarginsMm {
  if (settings.marginMode === "custom") return { ...settings.marginsMm };
  const m = settings.marginMm;
  return { top: m, right: m, bottom: m, left: m };
}

/** html2canvas scale factor derived from DPI (96 CSS dpi baseline). */
export function dpiToScale(dpi: number): number {
  return Math.min(4, Math.max(0.75, dpi / 96));
}

export function clampSettings(s: PdfSettings): PdfSettings {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return {
    ...s,
    marginMm: clamp(s.marginMm, 0, 40),
    marginsMm: {
      top: clamp(s.marginsMm.top, 0, 40),
      right: clamp(s.marginsMm.right, 0, 40),
      bottom: clamp(s.marginsMm.bottom, 0, 40),
      left: clamp(s.marginsMm.left, 0, 40),
    },
    startPageNumber: Math.max(1, Math.floor(s.startPageNumber) || 1),
    dpi: clamp(Math.round(s.dpi), 72, 300),
    quality: clamp(s.quality, 0.1, 1),
  };
}
