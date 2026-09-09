export type PageSize = "a4" | "letter";
/** `"html"` reuses the uploaded file's own `.page` padding as the margins. */
export type MarginMode = "uniform" | "custom" | "html";
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

export const DEFAULT_SETTINGS: PdfSettings = Object.freeze({
  pageSize: "a4",
  marginMm: 10,
  marginsMm: Object.freeze({ top: 10, right: 10, bottom: 14, left: 10 }),
  marginMode: "uniform",
  showPageNumbers: true,
  startPageNumber: 1,
  numberPosition: "bottom-center",
  dpi: 192,
  quality: 0.92,
}) as PdfSettings;

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

/**
 * Read the author's page margins out of uploaded `<style>` CSS: the padding
 * of exact top-level `.page{…}` rules (last one wins, like the cascade),
 * converted to mm. `@media` overrides are ignored — the raster pipeline
 * hoists `@media print` separately and `@media screen` shell tweaks
 * (margins, shadows) are reset, never honored.
 * Returns null when the file declares no usable `.page` padding.
 */
export function extractPagePadding(css: string): EdgeMarginsMm | null {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Top-level rules only (brace-aware so @media/@font-face blocks are skipped).
  const decls: string[] = [];
  let i = 0;
  const n = clean.length;
  while (i < n) {
    while (i < n && /\s/.test(clean[i])) i++;
    if (i >= n) break;
    if (clean[i] === "@") {
      // Skip the whole at-rule (header + optional block).
      while (i < n && clean[i] !== "{" && clean[i] !== ";") i++;
      if (i < n && clean[i] === ";") {
        i++;
        continue;
      }
      i++; // skip `{`
      let depth = 1;
      while (i < n && depth > 0) {
        if (clean[i] === "{") depth++;
        else if (clean[i] === "}") depth--;
        i++;
      }
      continue;
    }
    let selector = "";
    while (i < n && clean[i] !== "{") {
      selector += clean[i];
      i++;
    }
    if (i >= n) break;
    i++; // skip `{`
    let depth = 1;
    let body = "";
    while (i < n && depth > 0) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") depth--;
      if (depth > 0) body += clean[i];
      i++;
    }
    const isPageRule = selector
      .split(",")
      .map((s) => s.trim())
      .some((sel) => sel === ".page");
    if (isPageRule) decls.push(body);
  }
  if (decls.length === 0) return null;
  const get = (prop: string): string | null => {
    let found: string | null = null;
    for (const body of decls) {
      const m = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, "i").exec(body);
      if (m) found = m[2].trim();
    }
    return found;
  };
  const parseLen = (token: string): number | null => {
    const m = /^(-?\d*\.?\d+)([a-z]*)$/i.exec(token.trim());
    if (!m) return null;
    const value = parseFloat(m[1]);
    if (!Number.isFinite(value)) return null;
    switch (m[2].toLowerCase()) {
      case "mm":
        return value;
      case "cm":
        return value * 10;
      case "q":
        return value * 0.25;
      case "in":
        return value * 25.4;
      case "pt":
        return (value * 25.4) / 72;
      case "pc":
        return (value * 25.4) / 6;
      case "px":
        return (value * 25.4) / 96;
      case "":
        return value === 0 ? 0 : null;
      default:
        return null;
    }
  };
  const expandShorthand = (raw: string): [number, number, number, number] | null => {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 1 || parts.length > 4) return null;
    const vals = parts.map(parseLen);
    if (vals.some((v) => v === null)) return null;
    const [a, b, c, d] = vals as number[];
    if (parts.length === 1) return [a, a, a, a];
    if (parts.length === 2) return [a, b, a, b];
    if (parts.length === 3) return [a, b, c, b];
    return [a, b, c, d];
  };
  const shorthand = get("padding");
  let box = shorthand ? expandShorthand(shorthand) : null;
  if (shorthand && !box) return null;
  const edges: EdgeMarginsMm = {
    top: box?.[0] ?? 0,
    right: box?.[1] ?? 0,
    bottom: box?.[2] ?? 0,
    left: box?.[3] ?? 0,
  };
  let seen = box !== null;
  (["top", "right", "bottom", "left"] as const).forEach((edge) => {
    const raw = get(`padding-${edge}`);
    if (raw !== null) {
      const v = parseLen(raw);
      if (v === null) return;
      edges[edge] = v;
      seen = true;
    }
  });
  return seen ? edges : null;
}

/**
 * Detect the page size the uploaded HTML was designed for: `@page { size: … }`
 * wins, otherwise the `.page` width/height is matched against Letter
 * (612×792pt) and A4 (210×297mm ≈ 595×842pt) with a small tolerance.
 * Null when nothing conclusive is declared.
 */
export function detectPageSize(css: string): PageSize | null {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const atPage = /@page\s*\{([^}]*)\}/i.exec(clean)?.[1] ?? "";
  if (/letter/i.test(atPage)) return "letter";
  if (/\ba4\b/i.test(atPage)) return "a4";
  const toPt = (raw: string): number | null => {
    const m = /^(-?\d*\.?\d+)([a-z]*)$/i.exec(raw.trim());
    if (!m) return null;
    const value = parseFloat(m[1]);
    switch (m[2].toLowerCase()) {
      case "pt":
      case "":
        return value;
      case "px":
        return (value * 72) / 96;
      case "mm":
        return (value * 72) / 25.4;
      case "cm":
        return (value * 720) / 25.4;
      case "in":
        return value * 72;
      default:
        return null;
    }
  };
  const pageRule = /(^|[}])\s*\.page\s*\{([^}]*)\}/i.exec(clean)?.[2] ?? "";
  const w = /(^|;)\s*width\s*:\s*([^;!]+)/i.exec(pageRule)?.[2];
  const h = /(^|;)\s*height\s*:\s*([^;!]+)/i.exec(pageRule)?.[2];
  if (w && h) {
    const wPt = toPt(w);
    const hPt = toPt(h);
    if (wPt !== null && hPt !== null) {
      const close = (a: number, b: number) => Math.abs(a - b) <= 3;
      if (close(wPt, 612) && close(hPt, 792)) return "letter";
      if (close(wPt, 595.28) && close(hPt, 841.89)) return "a4";
    }
  }
  return null;
}

export function effectiveMargins(settings: PdfSettings, htmlStyles?: string): EdgeMarginsMm {
  if (settings.marginMode === "custom") return { ...settings.marginsMm };
  if (settings.marginMode === "html") {
    const parsed = htmlStyles ? extractPagePadding(htmlStyles) : null;
    if (parsed) return { ...parsed };
    // No usable `.page` padding — fall back to the uniform margin.
  }
  const m = settings.marginMm;
  return { top: m, right: m, bottom: m, left: m };
}

/** CSS `aspect-ratio` value for preview boxes so Letter isn't squeezed into an A4 frame. */
export function pageAspectRatio(pageSize: PageSize): string {
  const dims = PAGE_DIMS_MM[pageSize];
  return `${dims.width} / ${dims.height}`;
}
/** html2canvas scale factor derived from DPI (96 CSS dpi baseline). */
export function dpiToScale(dpi: number): number {
  return Math.min(4, Math.max(0.75, dpi / 96));
}

export function clampSettings(s: PdfSettings): PdfSettings {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  const marginMode: MarginMode =
    s.marginMode === "uniform" || s.marginMode === "custom" || s.marginMode === "html"
      ? s.marginMode
      : "uniform";
  return {
    ...s,
    marginMode,
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
