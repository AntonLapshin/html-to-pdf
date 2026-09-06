import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { A4_HEIGHT_MM, A4_WIDTH_MM, type PdfSettings } from "./settings";

/**
 * PDF pipeline (reference: AntonLapshin/book `src/state.jsx` createPdf).
 * Each `.page` DOM tree is rasterized with html2canvas at full A4 width,
 * then embedded into one jsPDF A4 portrait page — so a `.page` block
 * always equals exactly one PDF page. Page numbers are drawn by jsPDF
 * (same text as the preview overlay) to stay pixel-consistent.
 */
export async function generatePdf(
  pages: { html: string; styles: string }[],
  settings: PdfSettings,
  onProgress?: (done: number, total: number) => void,
  filename = "document.pdf",
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  // Hidden full-width render stage: 794px ~= 210mm @ 96dpi.
  const stage = document.createElement("div");
  stage.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;";
  document.body.appendChild(stage);

  try {
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage("a4", "portrait");
      const holder = document.createElement("div");
      holder.style.cssText = `width:794px;box-sizing:border-box;padding:${
        (settings.marginMm / A4_WIDTH_MM) * 794
      }px;background:#fff;`;
      holder.innerHTML = `<style>${pages[i].styles}</style><div>${pages[i].html}</div>`;
      stage.appendChild(holder);

      const canvas = await html2canvas(holder, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      doc.addImage(img, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, "FAST");
      if (settings.showPageNumbers) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(
          `${settings.startPageNumber + i} / ${pages.length}`,
          A4_WIDTH_MM / 2,
          A4_HEIGHT_MM - 8,
          { align: "center" },
        );
      }
      stage.removeChild(holder);
      onProgress?.(i + 1, pages.length);
    }
  } finally {
    document.body.removeChild(stage);
  }

  doc.save(filename);
}
