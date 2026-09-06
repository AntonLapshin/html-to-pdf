import html2canvas from "html2canvas";
import { pageNumberText } from "./parseHtml";
import {
  dpiToScale,
  effectiveMargins,
  mmToPx,
  pageDimsPx,
  type NumberPosition,
  type PdfSettings,
} from "./settings";

export type RenderStatus = "pending" | "ready" | "error";

export interface RenderInput {
  html: string;
  styles: string;
}

/**
 * Phase 2 single raster pipeline.
 * `renderPageCanvas` is the ONLY path that turns a `.page` DOM tree into
 * pixels — thumbnails use a downscaled data-URL of the same canvas, PDF
 * export embeds the full-res canvas. This eliminates iframe-vs-canvas
 * divergence by construction.
 */

/** Scope uploaded `<style>` CSS under `.pdf-scope` so one page's rules can't leak. */
export function scopeCss(css: string, scope: string): string {
  // Strip comments to simplify parsing.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = clean.length;

  const appendScopedRule = (selector: string, body: string) => {
    const parts = selector
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      out += `${body}`;
      return;
    }
    const scoped = parts
      .map((sel) => {
        // Never scope keyframes selectors or font-face descriptors.
        if (/^(from|to|\d+%)$/.test(sel)) return sel;
        // Rewrite root-ish selectors to the scope itself.
        if (/^(html|body|:root)$/i.test(sel)) return scope;
        // `body X` / `html X` → scoped descendant.
        const m = sel.match(/^(?:html|body)\s+(.+)$/i);
        if (m) return `${scope} ${m[1]}`;
        // `.page` root → scope itself (content is wrapped in .page inside scope).
        if (/^\.page(\s|$|[.:#[])/.test(sel)) return sel.replace(/^\.page/, scope);
        if (sel === ".page") return scope;
        return `${scope} ${sel}`;
      })
      .join(", ");
    out += `${scoped}${body}`;
  };

  while (i < n) {
    // Skip whitespace.
    while (i < n && /\s/.test(clean[i])) {
      out += clean[i];
      i++;
    }
    if (i >= n) break;
    if (clean[i] === "@") {
      // At-rule: read header up to `{` or `;`.
      let header = "";
      while (i < n && clean[i] !== "{" && clean[i] !== ";") {
        header += clean[i];
        i++;
      }
      const name = header.trim().split(/\s|\(/)[0].toLowerCase();
      if (i < n && clean[i] === ";") {
        out += `${header};`;
        i++;
        continue;
      }
      // Block at-rule: find matching brace.
      i++; // skip `{`
      let depth = 1;
      let body = "";
      while (i < n && depth > 0) {
        if (clean[i] === "{") depth++;
        else if (clean[i] === "}") depth--;
        if (depth > 0) body += clean[i];
        i++;
      }
      if (name === "@media" || name === "@supports" || name === "@container") {
        // Recurse: scope inner rules too.
        out += `${header}{${scopeCssInner(body, scope)}}`;
      } else {
        // @font-face, @keyframes, @page, @import-ish: keep verbatim.
        out += `${header}{${body}}`;
      }
    } else {
      // Style rule: selector up to `{`, then body up to matching `}`.
      let selector = "";
      while (i < n && clean[i] !== "{") {
        selector += clean[i];
        i++;
      }
      if (i >= n) {
        out += selector;
        break;
      }
      i++; // skip `{`
      let depth = 1;
      let body = "{";
      while (i < n && depth > 0) {
        if (clean[i] === "{") depth++;
        else if (clean[i] === "}") depth--;
        body += clean[i];
        i++;
      }
      appendScopedRule(selector.trim(), body);
    }
  }
  return out;
}

function scopeCssInner(css: string, scope: string): string {
  // Reuse the same parser for nested blocks (no nested at-rule recursion issues).
  return scopeCss(css, scope);
}

/**
 * Pull the inner CSS out of `@media print { … }` blocks (brace-aware, so
 * nested rules survive). The raster pipeline is print output, but
 * html2canvas renders with screen media and therefore ignores print rules —
 * hoisting them as plain screen rules honors the author's print intent
 * (e.g. `guide_30.html` forces `.page{opacity:1!important}` for print while
 * the screen CSS keeps pages at `opacity:0` until a scroll-reveal script
 * adds `.seen`, a script we intentionally never run).
 */
export function extractPrintCss(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  const re = /@media[^{]*\{/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    if (!/print/i.test(m[0])) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    let body = "";
    while (i < clean.length && depth > 0) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") depth--;
      if (depth > 0) body += clean[i];
      i++;
    }
    out += `${body}\n`;
  }
  return out;
}

/**
 * Safety net for scroll-reveal / fade-in patterns
 * (`.page{opacity:0;…}` + `.page.seen{opacity:1}`, `.visible`, …).
 * Uploaded scripts never run in the raster pipeline and `innerHTML`
 * extraction drops the reveal class, so without this the page shell would
 * rasterize invisible. Scoped to the shell only (`.pdf-scope` + inner
 * `.page`) so legitimate descendant transparency (ornaments, SVG paths)
 * keeps multiplying as designed — an opaque ancestor never forces
 * descendants opaque.
 */
export const REVEAL_OVERRIDE =
  ".pdf-scope,.pdf-scope .page{opacity:1 !important;transform:none !important;" +
  "visibility:visible !important;transition:none !important;" +
  "animation:none !important;filter:none !important;}";

/** Reveal-state classes mirrored onto the shell so `.page.seen …`-derived
 * selectors (scoped to `.pdf-scope.seen …`) keep matching. */
export const SEEN_CLASSES = "seen visible shown revealed loaded in-view";

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

/** Build the exact holder element used for raster (shared by preview + PDF). */
export function buildRenderHolder(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): HTMLElement {
  const dims = pageDimsPx(settings.pageSize);
  const margins = effectiveMargins(settings);
  const scope = ".pdf-scope";
  const scoped = scopeCss(page.styles, scope);
  // Hoisted print rules come after the screen rules so the author's print
  // intent wins; the reveal override comes last as the final safety net.
  const hoistedPrint = scopeCss(extractPrintCss(page.styles), scope);
  const holder = document.createElement("div");
  holder.style.cssText = [
    `width:${dims.width}px`,
    `height:${dims.height}px`,
    "box-sizing:border-box",
    "background:#fff",
    "overflow:hidden",
    "position:relative",
  ].join(";");
  holder.innerHTML =
    `<style>${scoped}\n${hoistedPrint}\n${REVEAL_OVERRIDE}</style>` +
    `<div class="${scope.slice(1)} ${SEEN_CLASSES}" style="box-sizing:border-box;width:100%;height:100%;` +
    `padding:${mmToPx(margins.top)}px ${mmToPx(margins.right)}px ` +
    `${mmToPx(margins.bottom)}px ${mmToPx(margins.left)}px;position:relative;background:#fff;overflow:hidden;">` +
    `<div class="page ${SEEN_CLASSES}" style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;">${page.html}</div>` +
    (settings.showPageNumbers
      ? `<div class="page-number" style="${numberOverlayStyle(settings.numberPosition)}">` +
        `${pageNumberText(settings.showPageNumbers, settings.startPageNumber, pageIndex, total) ?? ""}</div>`
      : "") +
    `</div>`;
  return holder;
}

/** Render one page to canvas at settings DPI. Caller owns the canvas. */
export async function renderPageCanvas(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): Promise<HTMLCanvasElement> {
  const holder = buildRenderHolder(page, settings, pageIndex, total);
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  stage.appendChild(holder);
  document.body.appendChild(stage);
  try {
    return await html2canvas(holder, {
      scale: dpiToScale(settings.dpi),
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
  } finally {
    document.body.removeChild(stage);
  }
}

/**
 * Book's `reencodeImage` idea: normalize canvas → JPEG data-URL at the
 * configured quality (keeps PDF size predictable across DPI settings).
 */
export function reencodeImage(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", Math.min(1, Math.max(0.1, quality)));
}

/** Downscaled data-URL for grid thumbnails (same pixels as PDF, fewer bytes).
 * 768px wide + q0.85 keeps small cards crisp on retina without bloating memory. */
export function canvasToPreviewUrl(canvas: HTMLCanvasElement, maxWidth = 768): string {
  return canvasToSizedUrl(canvas, maxWidth, 0.85);
}

/** Higher-res data-URL for the expanded modal raster mode.
 * 1500px wide + q0.9 stays sharp when zoomed to 200%. */
export function canvasToDetailUrl(canvas: HTMLCanvasElement, maxWidth = 1500): string {
  return canvasToSizedUrl(canvas, maxWidth, 0.9);
}

function canvasToSizedUrl(canvas: HTMLCanvasElement, maxWidth: number, quality: number): string {
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

/** Measure whether content overflows the usable A4 area at current margins. */
export function measureOverflow(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): { overflows: boolean; contentPx: number; usablePx: number } {
  const dims = pageDimsPx(settings.pageSize);
  const margins = effectiveMargins(settings);
  const usablePx =
    dims.height - Math.round(mmToPx(margins.top) + mmToPx(margins.bottom));
  const holder = buildRenderHolder(page, settings, pageIndex, total);
  // Measure with natural height: unwrap fixed height, let content grow.
  holder.style.height = "auto";
  holder.style.overflow = "visible";
  const scope = holder.querySelector(".pdf-scope") as HTMLElement | null;
  if (scope) {
    scope.style.height = "auto";
    scope.style.overflow = "visible";
  }
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  probe.appendChild(holder);
  document.body.appendChild(probe);
  try {
    const inner = (holder.querySelector(".page") as HTMLElement | null) ?? holder;
    const contentPx = Math.round(inner.scrollHeight);
    // Reserve ~8mm for the number overlay when shown.
    const reserve = settings.showPageNumbers ? Math.round(mmToPx(8)) : 0;
    return { overflows: contentPx > usablePx - reserve, contentPx, usablePx: usablePx - reserve };
  } finally {
    document.body.removeChild(probe);
  }
}

export interface ExternalRefs {
  images: string[];
  stylesheets: number;
  fontFaces: number;
}

/** Collect external URLs for CORS warnings (http/https/img/font/@import). */
export function collectExternalRefs(page: RenderInput): ExternalRefs {
  const images = new Set<string>();
  const tmp = document.createElement("div");
  tmp.innerHTML = page.html;
  tmp.querySelectorAll("img[src]").forEach((el) => {
    const src = (el as HTMLImageElement).getAttribute("src") ?? "";
    if (/^https?:\/\//i.test(src)) images.add(src);
  });
  const cssUrls = Array.from(
    page.styles.matchAll(/url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)/gi),
  ).map((m) => m[1]);
  cssUrls.forEach((u) => images.add(u));
  const stylesheets = (page.html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length;
  const fontFaces = (page.styles.match(/@font-face/gi) ?? []).length;
  return { images: [...images], stylesheets, fontFaces };
}

export function corsWarning(refs: ExternalRefs): string | null {
  if (refs.images.length === 0 && refs.stylesheets === 0 && refs.fontFaces === 0)
    return null;
  const bits: string[] = [];
  if (refs.images.length > 0) bits.push(`${refs.images.length} external image(s)`);
  if (refs.stylesheets > 0) bits.push(`${refs.stylesheets} external stylesheet(s)`);
  if (refs.fontFaces > 0) bits.push(`${refs.fontFaces} webfont(s)`);
  return (
    `${bits.join(", ")} detected — html2canvas needs CORS-enabled URLs ` +
    `(Access-Control-Allow-Origin). If images/fonts render blank in preview or PDF, ` +
    `inline them as data: URLs or self-host them.`
  );
}
