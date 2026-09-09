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

/** Fetch a remote URL and re-encode it as a `data:` URL.
 * Best-effort contract: resolves `null` on any failure (network, CORS,
 * timeout, decode) so callers can leave the original URL untouched. Callers
 * that need a reason should raise `AssetInlineError` themselves with the URL
 * attached — the fetch itself stays silent by design. */
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

/** Fetch a same-or-CORS-enabled Stylesheet as text. Same best-effort
 * `null`-on-failure contract as `fetchAsDataUrl` (see above). */
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
