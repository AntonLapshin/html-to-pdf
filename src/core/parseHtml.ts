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

/** Build a standalone srcDoc for one page (styles + body + settings vars). */
export function buildPageSrcDoc(
  page: ParsedPage,
  styles: string,
  opts: { marginMm: number; pageNumberText: string | null },
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff;}
body{font-family:ui-sans-serif,system-ui,sans-serif;}
.page{box-sizing:border-box;width:100%;min-height:100%;padding:${opts.marginMm}mm;position:relative;background:#fff;}
.page-number{position:absolute;left:0;right:0;bottom:6mm;text-align:center;font-size:11px;color:#64748b;}
${styles}
</style></head><body><div class="page">${page.html}${
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
