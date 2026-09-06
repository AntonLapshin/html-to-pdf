export interface PdfSettings {
  /** Margin around page content, in mm. Applied in preview and PDF. */
  marginMm: number;
  /** Overlay "page N / total" at the bottom center when true. */
  showPageNumbers: boolean;
  /** First printed page number. Defaults to 1. */
  startPageNumber: number;
}

export const DEFAULT_SETTINGS: PdfSettings = {
  marginMm: 10,
  showPageNumbers: true,
  startPageNumber: 1,
};

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
