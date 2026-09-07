import { toCanvas } from "html-to-image";
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
  /** External stylesheet URLs re-injected into the raster holder (webfonts). */
  links?: string[];
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

/**
 * Shell reset for the author's page-frame rules.
 * `.page` selectors are rewritten to `.pdf-scope`, so frame declarations the
 * author meant for the browser viewer — `@media screen { .page { margin:…;
 * box-shadow:… } }` — would otherwise shrink the content and paint a drop
 * shadow inside the PDF. The tool owns this geometry (inline size + margins),
 * so margin/shadow/padding are neutralized here, after all authored CSS.
 * Padding is safe to force to 0: the tool's own margins live as inline
 * padding on the inner `.page` box (see `buildRenderHolder`), never on the
 * scope itself.
 */
export const SHELL_RESET =
  ".pdf-scope{margin:0 !important;box-shadow:none !important;padding:0 !important;}";

/**
 * Read the author's page background out of uploaded `<style>` CSS.
 * Looks at `.page` rules (last one wins, like the cascade) for a flat
 * `background-color` / `background` color. Returns the raw color value
 * (`#FBF8F2`, `rgb(…)`, named colors) or null when the page has no flat
 * background (transparent default, gradients, `url(…)` layers).
 *
 * Why: the raster holder used to force `background:#fff` inline, which beat
 * the author's scoped `.page` background and turned every creamy/beige page
 * white in previews + PDF (the vector modal kept the color, so the two
 * visibly diverged). The holder now defaults to this color instead.
 */
export function extractPageBackground(css: string): string | null {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let found: string | null = null;
  // Match ` selector-list { body } ` blocks brace-aware (one nesting level:
  // enough for plain `.page{…}` rules; at-rules are skipped).
  const ruleRe = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(clean)) !== null) {
    const parts = m[1].split(",").map((s) => s.trim());
    const isPageRule = parts.some((sel) => /^\.page(?![\w-])(::?[a-z-]+|\[[^\]]*\])?$/.test(sel));
    if (!isPageRule) continue;
    const body = m[2];
    const bgColor = /(^|;)\s*background-color\s*:\s*([^;!]+)/i.exec(body)?.[2]?.trim();
    const bgShort = /(^|;)\s*background\s*:\s*([^;!]+)/i.exec(body)?.[2]?.trim();
    const raw = bgColor ?? bgShort ?? "";
    if (!raw) continue;
    if (/url\s*\(|gradient\s*\(|var\s*\(/i.test(raw)) continue;
    // `background` shorthand may carry repeat/position tokens — accept only a
    // lone color value.
    const token = bgColor ? raw : raw.split(/\s+/)[0] ?? "";
    if (/^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)$/i.test(token)) found = token;
  }
  return found;
}

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
function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
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

const dataUrlCache = new Map<string, Promise<string | null>>();

/** Clear the fetch→dataURL cache (tests / long sessions). */
export function clearInlineCache(): void {
  dataUrlCache.clear();
}

function isRemoteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

/** Fetch a remote URL and re-encode it as a `data:` URL. Null on any failure. */
export function fetchAsDataUrl(url: string, timeoutMs = 10000): Promise<string | null> {
  const absolute = url.startsWith("//") ? `${window.location.protocol}${url}` : url;
  const cached = dataUrlCache.get(absolute);
  if (cached) return cached;
  const task = (async (): Promise<string | null> => {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(absolute, { mode: "cors", signal: ctrl.signal });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(typeof reader.result === "string" ? reader.result : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } finally {
        window.clearTimeout(timer);
      }
    } catch {
      return null;
    }
  })();
  dataUrlCache.set(absolute, task);
  return task;
}

/** Fetch a same-or-CORS-enabled Stylesheet as text. Null on any failure. */
export async function fetchStylesheetText(url: string, timeoutMs = 10000): Promise<string | null> {
  const absolute = url.startsWith("//") ? `${window.location.protocol}${url}` : url;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(absolute, { mode: "cors", signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.text();
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Inline remote font/image `url(…)` references inside a CSS string to `data:`
 * URLs when fetchable. Relative URLs resolve against `baseUrl` (the
 * stylesheet's own URL); absolute `http(s)` URLs are fetched directly.
 * Unfetchable URLs are left untouched.
 */
export async function inlineCssUrls(css: string, baseUrl?: string): Promise<string> {
  const canResolveBase = !!baseUrl && /^https?:\/\//i.test(baseUrl);
  const absoluteFor = (raw: string): string | null => {
    const u = raw.trim();
    if (!u || u.startsWith("data:") || u.startsWith("#") || u.startsWith("blob:")) return null;
    if (isRemoteUrl(u)) return u.startsWith("//") ? `${window.location.protocol}${u}` : u;
    if (canResolveBase) {
      try {
        return new URL(u, baseUrl).href;
      } catch {
        return null;
      }
    }
    return null;
  };
  const targets = new Set<string>();
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const abs = absoluteFor(m[1]);
    if (abs) targets.add(abs);
  }
  if (targets.size === 0) return css;
  const mapping = new Map<string, string>();
  await Promise.all(
    [...targets].map(async (u) => {
      const data = await fetchAsDataUrl(u);
      if (data) mapping.set(u, data);
    }),
  );
  if (mapping.size === 0) return css;
  // Single rewrite pass: match by absolute URL so both absolute spellings
  // and base-relative spellings (`../fonts/x.woff2`) are replaced.
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (whole, raw: string) => {
    const abs = absoluteFor(String(raw));
    const data = abs ? mapping.get(abs) : undefined;
    return data ? `url("${data}")` : whole;
  });
}

/**
 * Fetch remote linked stylesheets (Google Fonts, CDN CSS), inline their
 * font/image URLs, and fold them into `styles`. Sheets that fail to fetch
 * stay in `links` so the `<link>` re-injection path still tries them live.
 * This is the CORS bypass for webfonts: fonts.gstatic.com serves
 * `Access-Control-Allow-Origin: *`, so `fetch` succeeds where canvas use
 * would taint — the inlined `data:` fonts then rasterize offline-safe.
 */
export async function inlineExternalStylesheets(page: RenderInput): Promise<RenderInput> {
  const links = page.links ?? [];
  const remote = links.filter((h) => isRemoteUrl(h));
  if (remote.length === 0) return page;
  let styles = page.styles;
  const kept: string[] = [];
  for (const href of links) {
    if (!isRemoteUrl(href)) {
      // Relative stylesheet: no base to resolve against after a text upload.
      kept.push(href);
      continue;
    }
    const absolute = href.startsWith("//") ? `${window.location.protocol}${href}` : href;
    const text = await fetchStylesheetText(absolute);
    if (text === null) {
      kept.push(href);
      continue;
    }
    styles += `\n/* inlined ${href} */\n${await inlineCssUrls(text, absolute)}`;
  }
  return { ...page, styles, links: kept };
}

/** Basename of a URL/path, ignoring query/hash and Windows separators. */
function assetBasename(ref: string): string {
  return ref.split(/[?#]/)[0].split(/[/\\]/).pop()!.trim().toLowerCase();
}

/**
 * Bake locally-picked font files into an HTML source string: every `url(…)`
 * whose basename matches one of `files` (e.g. `url("_fonts/NotoSerif.ttf")`
 * vs `NotoSerif.ttf`) is replaced with the file's `data:` URL. Matching is
 * case-insensitive. Returns the rewritten source plus the match count.
 */
export function embedFontsInSource(
  source: string,
  files: { name: string; dataUrl: string }[],
): { source: string; matched: number } {
  const byBase = new Map(files.map((f) => [assetBasename(f.name), f.dataUrl]));
  let matched = 0;
  const out = source.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, _quote: string, raw: string) => {
    const ref = raw.trim();
    if (ref.startsWith("data:")) return whole;
    const data = byBase.get(assetBasename(ref));
    if (!data) return whole;
    matched += 1;
    return `url("${data}")`;
  });
  return { source: out, matched };
}

/**
 * Bake locally-picked image files into an HTML source string: every
 * `<img src="…">`, `srcset` entry, and CSS `url(…)` whose basename matches
 * one of `files` (e.g. `src="cover-photo.jpg"` vs `Cover-Photo.JPG`) is
 * replaced with the file's `data:` URL. Matching is case-insensitive.
 * Returns the rewritten source plus the match count.
 */
export function embedImagesInSource(
  source: string,
  files: { name: string; dataUrl: string }[],
): { source: string; matched: number } {
  const byBase = new Map(files.map((f) => [assetBasename(f.name), f.dataUrl]));
  let matched = 0;
  // `<img src="…">` (quoted or unquoted).
  let out = source.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(['"]?)([^'"\s>]+)\2/gi,
    (whole, prefix: string, quote: string, raw: string) => {
      const ref = raw.trim();
      if (!ref || ref.startsWith("data:") || ref.startsWith("blob:")) return whole;
      if (/^(https?:)?\/\//i.test(ref)) return whole;
      const data = byBase.get(assetBasename(ref));
      if (!data) return whole;
      matched += 1;
      const q = quote || '"';
      return `${prefix}${q}${data}${q}`;
    },
  );
  // `srcset="a.jpg 1x, b.jpg 2x"` — rewrite each URL, keep descriptors.
  out = out.replace(/(\bsrcset\s*=\s*)(['"])([^'"]*)\2/gi, (whole, prefix: string, quote: string, value: string) => {
    let changed = false;
    const next = value
      .split(",")
      .map((part) => {
        const tokens = part.trim().split(/\s+/);
        const u = tokens[0] ?? "";
        if (!u || u.startsWith("data:") || u.startsWith("blob:")) return part;
        if (/^(https?:)?\/\//i.test(u)) return part;
        const data = byBase.get(assetBasename(u));
        if (!data) return part;
        changed = true;
        matched += 1;
        return [data, ...tokens.slice(1)].join(" ");
      })
      .join(", ");
    return changed ? `${prefix}${quote}${next}${quote}` : whole;
  });
  // CSS `url(…)` image references.
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, _quote: string, raw: string) => {
    const ref = raw.trim();
    if (!ref || ref.startsWith("data:") || ref.startsWith("#") || ref.startsWith("blob:")) return whole;
    if (/^(https?:)?\/\//i.test(ref)) return whole;
    if (!hasImageExtension(ref)) return whole;
    const data = byBase.get(assetBasename(ref));
    if (!data) return whole;
    matched += 1;
    return `url("${data}")`;
  });
  return { source: out, matched };
}

/**
 * Rewrite remote `http(s)` image URLs in the page HTML/CSS to `data:` URLs
 * when they are fetchable (CORS-enabled). Best effort: unfetchable URLs are
 * left untouched so the CORS warning + `useCORS` path still applies.
 */
export async function inlineExternalAssets(page: RenderInput): Promise<RenderInput> {
  const urls = new Set<string>();
  const probe = document.createElement("div");
  probe.innerHTML = page.html;
  probe.querySelectorAll("img[src]").forEach((el) => {
    const src = (el as HTMLImageElement).getAttribute("src")?.trim() ?? "";
    if (src && isRemoteUrl(src) && !src.startsWith("data:")) urls.add(src);
  });
  probe.querySelectorAll("img[srcset]").forEach((el) => {
    const srcset = (el as HTMLImageElement).getAttribute("srcset") ?? "";
    srcset.split(",").forEach((part) => {
      const u = part.trim().split(/\s+/)[0] ?? "";
      if (u && isRemoteUrl(u) && !u.startsWith("data:")) urls.add(u);
    });
  });
  for (const m of page.styles.matchAll(/url\(\s*['"]?((?:https?:)?\/\/[^'")]+)['"]?\s*\)/gi)) {
    if (!m[1].startsWith("data:")) urls.add(m[1]);
  }
  if (urls.size === 0) return inlineExternalStylesheets(page);
  const entries = await Promise.all(
    [...urls].map(async (u) => [u, await fetchAsDataUrl(u)] as const),
  );
  const mapping = new Map(entries.filter(([, v]) => v).map(([k, v]) => [k, v as string]));
  if (mapping.size === 0) return inlineExternalStylesheets(page);
  let html = page.html;
  let styles = page.styles;
  for (const [from, to] of mapping) {
    html = html.split(from).join(to);
    styles = styles.split(from).join(to);
  }
  return inlineExternalStylesheets({ ...page, html, styles });
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

export interface ExternalRefs {
  images: string[];
  stylesheets: number;
  fontFaces: number;
  /**
   * Non-remote font URLs from `@font-face src` (relative paths like
   * `_fonts/NotoSerif-Regular.ttf`, `C:\Windows\…`, `file:`). An uploaded
   * file is read as text, so the browser can never resolve sibling font
   * files — these always need inlining (see `embedFontsInSource`).
   */
  localFonts: string[];
  /**
   * Non-remote image URLs (`<img src>`, `srcset`, CSS `url(…)` with an image
   * extension). Same root cause as `localFonts`: a text upload has no base
   * URL, so sibling files like `cover-photo.jpg` can never resolve and
   * rasterize blank — they must be inlined (see `embedImagesInSource` or
   * `scripts/inline-local-images.py`).
   */
  localImages: string[];
}

/** True for values that can never resolve after a text upload (not remote, not inline). */
function isLocalAssetUrl(url: string): boolean {
  const u = url.trim();
  if (!u || u.startsWith("data:") || u.startsWith("#") || u.startsWith("blob:")) return false;
  return !isRemoteUrl(u);
}

/** Collect `@font-face` font-file URLs that are local (see `localFonts`). */
export function collectLocalFontUrls(styles: string): string[] {
  const found = new Set<string>();
  for (const face of styles.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
    for (const m of face[0].matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      if (isLocalAssetUrl(m[1])) found.add(m[1].trim());
    }
  }
  return [...found];
}

/** Image extensions recognized for `localImages` detection. */
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
]);

function hasImageExtension(ref: string): boolean {
  const clean = ref.split(/[?#]/)[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(clean.slice(dot));
}

/**
 * Collect image URLs that can never resolve after a text upload (see
 * `localImages`): `<img src>`, `srcset` entries, and CSS `url(…)` with an
 * image extension. Remote (`http(s)://`), `data:` and `blob:` URLs are
 * excluded — those go through the CORS path instead.
 */
export function collectLocalImageUrls(html: string, styles: string): string[] {
  const found = new Set<string>();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("img[src]").forEach((el) => {
    const src = (el as HTMLImageElement).getAttribute("src")?.trim() ?? "";
    if (src && isLocalAssetUrl(src)) found.add(src);
  });
  tmp.querySelectorAll("img[srcset]").forEach((el) => {
    const srcset = (el as HTMLImageElement).getAttribute("srcset") ?? "";
    srcset.split(",").forEach((part) => {
      const u = (part.trim().split(/\s+/)[0] ?? "").trim();
      if (u && isLocalAssetUrl(u)) found.add(u);
    });
  });
  // CSS image references (backgrounds, list-style, content…).
  for (const m of styles.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const ref = m[1].trim();
    if (isLocalAssetUrl(ref) && hasImageExtension(ref)) found.add(ref);
  }
  return [...found];
}

/** Collect external URLs for CORS warnings (http/https/img/font/@import). */
export function collectExternalRefs(page: RenderInput): ExternalRefs {
  const images = new Set<string>();
  const tmp = document.createElement("div");
  tmp.innerHTML = page.html;
  tmp.querySelectorAll("img[src]").forEach((el) => {
    const src = (el as HTMLImageElement).getAttribute("src")?.trim() ?? "";
    if (src && isRemoteUrl(src) && !src.startsWith("data:")) images.add(src);
  });
  tmp.querySelectorAll("img[srcset]").forEach((el) => {
    const srcset = (el as HTMLImageElement).getAttribute("srcset") ?? "";
    srcset.split(",").forEach((part) => {
      const u = (part.trim().split(/\s+/)[0] ?? "").trim();
      if (u && isRemoteUrl(u) && !u.startsWith("data:")) images.add(u);
    });
  });
  // CSS url(...) references (backgrounds, @font-face src) incl. @import URLs.
  for (const m of page.styles.matchAll(/url\(\s*['"]?((?:https?:)?\/\/[^'")]+)['"]?\s*\)/gi)) {
    if (!m[1].startsWith("data:")) images.add(m[1]);
  }
  for (const m of page.styles.matchAll(/@import\s+(?:url\()?['"]?((?:https?:)?\/\/[^'")\s;]+)/gi)) {
    images.add(m[1]);
  }
  // <link rel=stylesheet> discovered at parse time…
  // Any linked file (remote or relative) is a non-inline dependency: remote
  // ones need CORS, relative ones have no base to resolve against once the
  // HTML is uploaded as text — both deserve the warning.
  const linkHrefs = (page.links ?? []).filter((h) => h.length > 0);
  // …plus any stylesheet links embedded inside the page HTML itself.
  const embeddedLinks = Array.from(tmp.querySelectorAll('link[rel~="stylesheet"]'))
    .map((el) => (el as HTMLLinkElement).getAttribute("href")?.trim() ?? "")
    .filter((h) => h.length > 0);
  const stylesheets = new Set([...linkHrefs, ...embeddedLinks]).size;
  const fontFaces = (page.styles.match(/@font-face/gi) ?? []).length;
  return {
    images: [...images],
    stylesheets,
    fontFaces,
    localFonts: collectLocalFontUrls(page.styles),
    localImages: collectLocalImageUrls(page.html, page.styles),
  };
}

/** Merge refs across all pages so the warning never depends on page 1 alone. */
export function collectExternalRefsForPages(pages: RenderInput[]): ExternalRefs {
  const images = new Set<string>();
  const localFonts = new Set<string>();
  const localImages = new Set<string>();
  let stylesheets = 0;
  let fontFaces = 0;
  const seenSheets = new Set<string>();
  // Every page shares the same uploaded `<style>` text, so @font-face rules
  // must be counted once per distinct stylesheet — summing per page
  // multiplied the count by the page count (6 faces × 23 pages = "138").
  const seenStyles = new Set<string>();
  const seenHtml = new Set<string>();
  for (const page of pages) {
    const refs = collectExternalRefs(page);
    refs.images.forEach((u) => images.add(u));
    refs.localFonts.forEach((u) => localFonts.add(u));
    // `<img src>` lives in per-page HTML: dedupe identical page HTML so a
    // 23-page guide with one cover image warns "1", not "23".
    if (!seenHtml.has(page.html)) {
      seenHtml.add(page.html);
      refs.localImages.forEach((u) => localImages.add(u));
    }
    if (!seenStyles.has(page.styles)) {
      seenStyles.add(page.styles);
      fontFaces += refs.fontFaces;
    }
    // Stylesheet <link> hrefs are usually shared — count distinct URLs once.
    (page.links ?? []).forEach((h) => {
      if (h && !seenSheets.has(h)) {
        seenSheets.add(h);
        stylesheets += 1;
      }
    });
    // Embedded/stylesheet-count overflow beyond distinct links (rare): keep max.
    if (refs.stylesheets > 0 && (page.links ?? []).length === 0) {
      stylesheets += refs.stylesheets;
    }
  }
  return {
    images: [...images],
    stylesheets,
    fontFaces,
    localFonts: [...localFonts],
    localImages: [...localImages],
  };
}

export function corsWarning(refs: ExternalRefs): string | null {
  if (
    refs.images.length === 0 &&
    refs.stylesheets === 0 &&
    refs.fontFaces === 0 &&
    refs.localFonts.length === 0 &&
    refs.localImages.length === 0
  )
    return null;
  const bits: string[] = [];
  if (refs.images.length > 0) bits.push(`${refs.images.length} external image(s)`);
  if (refs.stylesheets > 0) bits.push(`${refs.stylesheets} external stylesheet(s)`);
  if (refs.fontFaces > 0) bits.push(`${refs.fontFaces} webfont(s)`);
  if (refs.localFonts.length > 0)
    bits.push(`${refs.localFonts.length} local font file(s) (${refs.localFonts.slice(0, 2).join(", ")}${refs.localFonts.length > 2 ? ", …" : ""})`);
  if (refs.localImages.length > 0)
    bits.push(
      `${refs.localImages.length} local image(s) (${refs.localImages.slice(0, 2).join(", ")}${refs.localImages.length > 2 ? ", …" : ""})`,
    );
  const head = `${bits.join(", ")} detected.`;
  const remedies: string[] = [];
  if (refs.localImages.length > 0) {
    remedies.push(
      `Local images can't load from uploaded text (the browser never sees sibling files, so they rasterize blank) — attach them with “Attach images”, or bake them in: python3 scripts/inline-local-images.py guide.html.`,
    );
  }
  if (refs.localFonts.length > 0) {
    remedies.push(
      `Local font files can't load from uploaded text (the browser never sees sibling files) — attach them with “Attach fonts”, or bake them in: python3 scripts/inline-local-fonts.py guide.html.`,
    );
  }
  if (refs.images.length > 0 || refs.stylesheets > 0) {
    remedies.push(
      `html2canvas needs CORS-enabled URLs (Access-Control-Allow-Origin); ` +
        `the tool auto-inlines fetchable remote images, fonts and stylesheets, but anything left blank must be inlined as data: URLs or self-hosted`,
    );
  } else if (refs.fontFaces > 0) {
    remedies.push(`if text falls back to system fonts, inline the webfonts as data: URLs`);
  }
  return `${head} ${remedies.join(" ")}`.trim();
}
