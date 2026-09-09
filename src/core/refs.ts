import { isRemoteUrl } from "./assets";
import { hasImageExtension } from "./embed";
import type { RenderInput } from "./renderTypes";

/**
 * External-reference collection + CORS warnings (Phase 1 split of `render.ts`).
 */

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
export function isLocalAssetUrl(url: string): boolean {
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
