import { jsPDF } from "jspdf";
import { reencodeImage, renderPageCanvas } from "./render";
import { PAGE_DIMS_MM, type PdfSettings } from "./settings";

/**
 * PDF pipeline (reference: AntonLapshin/book `src/state.jsx` createPdf).
 * Single raster pipeline: each `.page` DOM tree is rendered with
 * `renderPageCanvas` (the same function behind preview thumbnails), then
 * re-encoded to JPEG at the configured quality and embedded full-bleed —
 * so a `.page` block always equals exactly one PDF page with identical
 * pixels to the preview. Page numbers are baked into the raster (same text
 * + position as preview) to stay pixel-consistent.
 */
export async function generatePdf(
  pages: { html: string; styles: string; links?: string[] }[],
  settings: PdfSettings,
  onProgress?: (done: number, total: number) => void,
  filename = "document.pdf",
): Promise<void> {
  const dims = PAGE_DIMS_MM[settings.pageSize];
  const format: string | [number, number] =
    settings.pageSize === "letter" ? [215.9, 279.4] : "a4";
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format,
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage(format, "portrait");
    const canvas = await renderPageCanvas(pages[i], settings, i, pages.length);
    const img = reencodeImage(canvas, settings.quality);
    doc.addImage(img, "JPEG", 0, 0, dims.width, dims.height, undefined, "FAST");
    onProgress?.(i + 1, pages.length);
  }

  doc.save(filename);
}
