import type { RenderInput } from "./renderTypes";

/**
 * Network inlining + local-file embedding (Phase 1 split of `render.ts`).
 * Leaf besides `renderTypes` — `refs.ts` and `raster.ts` import from here
 * (one-way), so shared URL helpers live here.
 */

const dataUrlCache = new Map<string, Promise<string | null>>();

/** Clear the fetch→dataURL cache (tests / long sessions). */
export function clearInlineCache(): void {
  dataUrlCache.clear();
}

export function isRemoteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

/** Single fetch behind `fetchAsDataUrl` / `fetchStylesheetText`: CORS fetch
 * that rejects when `timeoutMs` elapses (hanging font/image hosts). */
export function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return (async () => {
    try {
      return await fetch(url, { mode: "cors", signal: ctrl.signal });
    } finally {
      window.clearTimeout(timer);
    }
  })();
}

/** Fetch a remote URL and re-encode it as a `data:` URL. Null on any failure. */
export function fetchAsDataUrl(url: string, timeoutMs = 10000): Promise<string | null> {
  const absolute = url.startsWith("//") ? `${window.location.protocol}${url}` : url;
  const cached = dataUrlCache.get(absolute);
  if (cached) return cached;
  const task = (async (): Promise<string | null> => {
    try {
      const res = await fetchWithTimeout(absolute, timeoutMs);
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
    const res = await fetchWithTimeout(absolute, timeoutMs);
    if (!res.ok) return null;
    return await res.text();
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
export function assetBasename(ref: string): string {
  return ref.split(/[?#]/)[0].split(/[/\\]/).pop()!.trim().toLowerCase();
}

/** Image extensions recognized for `localImages` detection / embedding. */
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

export function hasImageExtension(ref: string): boolean {
  const clean = ref.split(/[?#]/)[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(clean.slice(dot));
}

/**
 * Single basename rewrite behind `embedFontsInSource` / `embedImagesInSource`:
 * every CSS `url(…)` whose basename matches one of `files` is replaced with
 * the file's `data:` URL. Matching is case-insensitive. `shouldReplace`
 * carries each embedder's own skip rules (fonts replace any matching `url`,
 * images skip remote/data/blob/fragment refs and non-image extensions).
 * Returns the rewritten source plus the match count.
 */
export function replaceUrlsByBasename(
  source: string,
  files: { name: string; dataUrl: string }[],
  shouldReplace: (ref: string) => boolean,
): { source: string; matched: number } {
  const byBase = new Map(files.map((f) => [assetBasename(f.name), f.dataUrl]));
  let matched = 0;
  const out = source.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (whole, _quote: string, raw: string) => {
      const ref = raw.trim();
      if (!shouldReplace(ref)) return whole;
      const data = byBase.get(assetBasename(ref));
      if (!data) return whole;
      matched += 1;
      return `url("${data}")`;
    },
  );
  return { source: out, matched };
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
  return replaceUrlsByBasename(source, files, (ref) => !ref.startsWith("data:"));
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
  // CSS `url(…)` image references (shared basename rewrite; images skip
  // remote/data/blob/fragment refs and non-image extensions).
  const urls = replaceUrlsByBasename(
    out,
    files,
    (ref) =>
      ref.length > 0 &&
      !ref.startsWith("data:") &&
      !ref.startsWith("#") &&
      !ref.startsWith("blob:") &&
      !/^(https?:)?\/\//i.test(ref) &&
      hasImageExtension(ref),
  );
  return { source: urls.source, matched: matched + urls.matched };
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
