import { extractPrintCss, REVEAL_OVERRIDE, scopeCss, SEEN_CLASSES } from "./render";
import { effectiveMargins, type NumberPosition, type PageSize } from "./settings";

export interface ParsedPage {
  /** Zero-based index of the `.page` block in upload order. */
  index: number;
  /** Inner HTML of the `.page` element (rendered inside one PDF page). */
  html: string;
  /** Outer HTML including the `.page` wrapper (fallback/debugging). */
  outerHtml: string;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  /** Concatenated `<style>` blocks from the uploaded file, re-injected per page. */
  styles: string;
}

/** Parse an uploaded HTML string into `.page` blocks + shared styles. */
export function parseHtmlPages(source: string): ParsedDocument {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const styleText = Array.from(doc.querySelectorAll("style"))
    .map((s) => s.textContent ?? "")
    .join("\n");
  const nodes = Array.from(doc.querySelectorAll(".page"));
  const pages: ParsedPage[] = nodes.map((node, index) => ({
    index,
    html: (node as HTMLElement).innerHTML,
    outerHtml: (node as HTMLElement).outerHTML,
  }));
  return { pages, styles: styleText };
}

export interface PageSrcDocOpts {
  marginsMm: { top: number; right: number; bottom: number; left: number };
  pageNumberText: string | null;
  numberPosition?: NumberPosition;
  pageSize?: PageSize;
}

/**
 * Build a standalone srcDoc for one page — used by the expanded modal as a
 * crisp vector fallback. Uses the same scoped CSS + margins + number text as
 * the canvas pipeline (see `core/render.ts`) so pixels stay consistent.
 */
export function buildPageSrcDoc(
  page: ParsedPage,
  styles: string,
  opts: PageSrcDocOpts,
): string {
  const pos = opts.numberPosition ?? "bottom-center";
  const align =
    pos === "bottom-left" ? "left" : pos === "bottom-right" ? "right" : "center";
  const scoped = scopeCss(styles, ".pdf-scope");
  // Same print-hoisting + reveal safety net as the canvas pipeline
  // (see `core/render.ts`) so the modal matches the raster.
  const hoistedPrint = scopeCss(extractPrintCss(styles), ".pdf-scope");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff;}
body{font-family:ui-sans-serif,system-ui,sans-serif;}
.pdf-scope{box-sizing:border-box;width:100%;min-height:100%;position:relative;background:#fff;
padding:${opts.marginsMm.top}mm ${opts.marginsMm.right}mm ${opts.marginsMm.bottom}mm ${opts.marginsMm.left}mm;}
.page-number{position:absolute;left:0;right:0;bottom:6mm;text-align:${align};font-size:11px;color:#64748b;}
${scoped}
${hoistedPrint}
${REVEAL_OVERRIDE}
</style></head><body><div class="pdf-scope ${SEEN_CLASSES}"><div class="page ${SEEN_CLASSES}">${page.html}</div>${
    opts.pageNumberText
      ? `<div class="page-number">${opts.pageNumberText}</div>`
      : ""
  }</div></body></html>`;
}

export function pageNumberText(
  show: boolean,
  start: number,
  index: number,
  total: number,
): string | null {
  if (!show) return null;
  return `${start + index} / ${total}`;
}

// Re-export helper so callers can share margin math with the raster path.
export { effectiveMargins };
