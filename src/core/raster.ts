import { toCanvas } from "html-to-image";
import html2canvas from "html2canvas";
import { inlineExternalAssets } from "./assets";
import {
  extractPageBackground,
  extractPrintCss,
  REVEAL_OVERRIDE,
  scopeCss,
  SEEN_CLASSES,
  SHELL_RESET,
} from "./cssScope";
import { numberOverlayStyle, pageNumberText } from "./pageNumbers";
import type { RenderInput } from "./renderTypes";
import {
  dpiToScale,
  effectiveMargins,
  mmToPx,
  pageDimsPx,
  type PdfSettings,
} from "./settings";

/**
 * Holder construction + raster pipeline + overflow measurement
 * (Phase 1 split of `render.ts`).
 *
 * Phase 2 single raster pipeline.
 * `renderPageCanvas` is the ONLY path that turns a `.page` DOM tree into
 * pixels — thumbnails use a downscaled data-URL of the same canvas, PDF
 * export embeds the full-res canvas. This eliminates iframe-vs-canvas
 * divergence by construction.
 */

/** Escape a URL for safe embedding inside an HTML attribute. */
function escapeAttr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Build the exact holder element used for raster (shared by preview + PDF). */
export function buildRenderHolder(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): HTMLElement {
  const dims = pageDimsPx(settings.pageSize);
  // `html` margin mode resolves the author's own `.page` padding from the
  // uploaded CSS, so files designed with baked-in margins keep them.
  const margins = effectiveMargins(settings, page.styles);
  const scope = ".pdf-scope";
  const scoped = scopeCss(page.styles, scope);
  // Hoisted print rules come after the screen rules so the author's print
  // intent wins; the reveal override comes last as the final safety net.
  const hoistedPrint = scopeCss(extractPrintCss(page.styles), scope);
  // Author's page background (e.g. v7's creamy `#FBF8F2`): the base rule
  // below keeps plain pages white, while any authored `.page` background —
  // flat color, gradient, layered — wins by source order, exactly like the
  // vector modal (`buildPageSrcDoc`). Forcing `#fff` inline here used to
  // bleach every designed page white in previews + PDF.
  const paperBg = extractPageBackground(page.styles) ?? "#ffffff";
  const holder = document.createElement("div");
  holder.style.cssText = [
    `width:${dims.width}px`,
    `height:${dims.height}px`,
    "box-sizing:border-box",
    `background:${paperBg}`,
    "overflow:hidden",
    "position:relative",
  ].join(";");
  holder.innerHTML =
    (page.links ?? [])
      .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}" crossorigin="anonymous">`)
      .join("") +
    `<style>.pdf-scope{background:#fff;}\n${scoped}\n${hoistedPrint}\n${SHELL_RESET}\n${REVEAL_OVERRIDE}</style>` +
    // Tool margins live as padding on the INNER `.page` box — not on the
    // scope. Author patterns like `.day-band{margin:-12pt -16pt 0 -16pt}` are
    // designed to bleed into the `.page` padding while staying inside its
    // border box (background starts 16pt out, text stays aligned via 16pt of
    // its own padding). When the margins lived on the outer scope, that bleed
    // crossed the inner box border and its `overflow:hidden` clipped the band
    // (missing paddings/background in the PDF). Keeping padding + bleed +
    // clip on one box restores the author's layout exactly.
    `<div class="${scope.slice(1)} ${SEEN_CLASSES}" style="box-sizing:border-box;width:100%;height:100%;` +
    `padding:0;position:relative;overflow:hidden;">` +
    `<div class="page ${SEEN_CLASSES}" style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;` +
    `padding:${mmToPx(margins.top)}px ${mmToPx(margins.right)}px ` +
    `${mmToPx(margins.bottom)}px ${mmToPx(margins.left)}px;">${page.html}</div>` +
    (settings.showPageNumbers
      ? `<div class="page-number" style="${numberOverlayStyle(settings.numberPosition)}">` +
        `${pageNumberText(settings.showPageNumbers, settings.startPageNumber, pageIndex, total) ?? ""}</div>`
      : "") +
    `</div>`;
  return holder;
}

/** Render one page to canvas at settings DPI. Caller owns the canvas.
 *
 * Primary engine is `html-to-image` (SVG foreignObject → native browser
 * paint): text, inline-block boxes (checkboxes), backgrounds and modern CSS
 * rasterize exactly as laid out, so e.g. a checkbox never drifts off its
 * text baseline the way html2canvas's split box/text paint paths can.
 * html2canvas stays as the automatic fallback (tainted canvas, SVG-hostile
 * markup, blocked font hosts).
 */
export async function renderPageCanvas(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): Promise<HTMLCanvasElement> {
  // Best effort: inline CORS-fetchable remote images as data: URLs so they
  // survive rasterization even when the remote host omits ACAO headers for
  // canvas use. Failures keep the original URL (warning covers that case).
  const inlined = await inlineExternalAssets(page);
  const scale = dpiToScale(settings.dpi);
  try {
    const holder = buildRenderHolder(inlined, settings, pageIndex, total);
    // Stage inside a hidden same-origin iframe at a natural (0,0) position:
    // keeps the main page flicker-free while foreignObject serialization sees
    // fully laid-out, in-viewport content (far-offscreen inline offsets
    // serialize into the SVG and rasterize blank).
    const dims = pageDimsPx(settings.pageSize);
    const paperBg = extractPageBackground(inlined.styles) ?? "#ffffff";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      `width:${dims.width}px`,
      `height:${dims.height}px`,
      "border:0",
      `background:${paperBg}`,
    ].join(";");
    document.body.appendChild(iframe);
    try {
      const frameDoc = iframe.contentDocument;
      if (!frameDoc) throw new Error("Raster iframe has no document.");
      frameDoc.open();
      frameDoc.write(
        `<!doctype html><html><head><meta charset="utf-8"></head>` +
          `<body style="margin:0;padding:0;background:${paperBg};"></body></html>`,
      );
      frameDoc.close();
      frameDoc.body.appendChild(holder);
      // Webfonts + <img> decode asynchronously: rasterizing too early bakes in
      // fallback fonts / blank images. Wait (bounded) before snapshotting.
      await waitForHolderAssets(holder, 5000);
      const canvas = await withTimeout(
        toCanvas(holder, { pixelRatio: scale, cacheBust: false }),
        25000,
      );
      // Surface a tainted canvas (non-inlinable remote image without CORS)
      // here so the html2canvas path below still gets its chance.
      canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
      return canvas;
    } finally {
      document.body.removeChild(iframe);
    }
  } catch {
    // Fall through to html2canvas.
  }
  const holder = buildRenderHolder(inlined, settings, pageIndex, total);
  const stage = document.createElement("div");
  stage.style.cssText = `position:fixed;left:-10000px;top:0;background:${extractPageBackground(inlined.styles) ?? "#ffffff"};`;
  stage.appendChild(holder);
  document.body.appendChild(stage);
  try {
    // Webfonts + <img> decode asynchronously: rasterizing too early bakes in
    // fallback fonts / blank images. Wait (bounded) before snapshotting.
    await waitForHolderAssets(holder, 5000);
    return await html2canvas(holder, {
      scale,
      backgroundColor: extractPageBackground(inlined.styles) ?? "#ffffff",
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
    });
  } finally {
    document.body.removeChild(stage);
  }
}

/** Reject if `task` takes longer than `timeoutMs` (hanging font hosts). */
export function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`Raster timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    task.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Bounded wait for webfonts and images inside the raster holder.
 * - `document.fonts.ready` resolves once pending `@font-face` / linked fonts
 *   (e.g. Google Fonts) finish loading.
 * - Each `<img>` is awaited via `decode()` (falls back to load/error events).
 * Everything races against `timeoutMs` so a hanging host can't stall export.
 */
export async function waitForHolderAssets(holder: HTMLElement, timeoutMs = 5000): Promise<void> {
  // Resolve APIs against the holder's own document: raster holders may live
  // in a hidden staging iframe, whose fonts/images belong to that document.
  const holderDoc = holder.ownerDocument ?? document;
  const holderWin = holderDoc.defaultView ?? window;
  const timeout = new Promise<void>((resolve) => {
    holderWin.setTimeout(resolve, Math.max(0, timeoutMs));
  });
  const work = (async () => {
    try {
      const fonts = (holderDoc as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts) {
        // Explicitly trigger loads for families referenced by the holder so
        // `fonts.ready` isn't resolved before late-discovered faces start.
        const families = new Set<string>();
        holder.querySelectorAll("*").forEach((el) => {
          const fam = holderWin.getComputedStyle(el).getPropertyValue("font-family");
          fam.split(",").forEach((f) => {
            const name = f.trim().replace(/^["']|["']$/g, "");
            if (name) families.add(name);
          });
        });
        await Promise.allSettled(
          [...families].slice(0, 20).map((f) => fonts.load(`16px "${f}"`).catch(() => [])),
        );
        await fonts.ready.catch(() => undefined);
      }
    } catch {
      // Font APIs missing (jsdom) or failing — continue with system fonts.
    }
    const imgs = Array.from(holder.querySelectorAll("img"));
    await Promise.allSettled(
      imgs.map(async (img) => {
        try {
          if (typeof img.decode === "function") {
            await img.decode();
            return;
          }
        } catch {
          // Fall through to complete/load check below.
        }
        if (img.complete) return;
        await new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    // One frame so the browser applies freshly-loaded fonts before raster.
    // (jsdom has no rAF — resolve immediately there.)
    const raf = holderWin.requestAnimationFrame?.bind(holderWin);
    if (raf) await new Promise<void>((resolve) => raf(() => resolve()));
  })();
  await Promise.race([work, timeout]);
}

/** Measure whether content overflows the usable area at current margins.
 * Sync version: measures with fallback fonts (no font/image wait), so it can
 * underestimate when webfonts load larger than system fallbacks. Prefer
 * `measureOverflowAsync` in the app pipeline. */
export function measureOverflow(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
): { overflows: boolean; contentPx: number; usablePx: number } {
  const dims = pageDimsPx(settings.pageSize);
  const margins = effectiveMargins(settings, page.styles);
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
    inner.style.height = "auto";
    inner.style.overflow = "visible";
    // Inner `.page` carries the tool margins as padding now (negative-margin
    // bleed fix) — `scrollHeight` includes that padding, so subtract it to
    // get the content height comparable to the usable area.
    // (jsdom has no layout: `scrollHeight` is 0 there, so clamp at 0.)
    const padPx = mmToPx(margins.top) + mmToPx(margins.bottom);
    const contentPx = Math.max(0, Math.round(inner.scrollHeight - padPx));
    // Reserve ~8mm for the number overlay when shown.
    const reserve = settings.showPageNumbers ? Math.round(mmToPx(8)) : 0;
    return { overflows: contentPx > usablePx - reserve, contentPx, usablePx: usablePx - reserve };
  } finally {
    document.body.removeChild(probe);
  }
}

/**
 * Font/image-aware overflow check: same geometry as `measureOverflow`, but
 * waits (bounded) for webfonts and images inside the probe before measuring.
 * Use this in the app pipeline so pages using Google Fonts don't measure
 * with fallback metrics and then raster taller once the real fonts arrive
 * (badge says "fits", PDF clips).
 */
export async function measureOverflowAsync(
  page: RenderInput,
  settings: PdfSettings,
  pageIndex: number,
  total: number,
  timeoutMs = 5000,
): Promise<{ overflows: boolean; contentPx: number; usablePx: number }> {
  const dims = pageDimsPx(settings.pageSize);
  const margins = effectiveMargins(settings, page.styles);
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
  const inner = (holder.querySelector(".page") as HTMLElement | null) ?? holder;
  inner.style.height = "auto";
  inner.style.overflow = "visible";
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  probe.appendChild(holder);
  document.body.appendChild(probe);
  try {
    await waitForHolderAssets(holder, timeoutMs);
    // See `measureOverflow`: inner padding must be excluded from the content
    // height (tool margins moved onto the inner box for the bleed fix).
    const padPx = mmToPx(margins.top) + mmToPx(margins.bottom);
    const contentPx = Math.max(0, Math.round(inner.scrollHeight - padPx));
    // Reserve ~8mm for the number overlay when shown.
    const reserve = settings.showPageNumbers ? Math.round(mmToPx(8)) : 0;
    return { overflows: contentPx > usablePx - reserve, contentPx, usablePx: usablePx - reserve };
  } finally {
    document.body.removeChild(probe);
  }
}
