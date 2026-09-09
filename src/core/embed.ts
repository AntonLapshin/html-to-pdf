/**
 * Local-file embedding (Phase 2 split of `assets.ts`): bake user-picked font
 * / image files into an HTML source string as `data:` URLs, matched by
 * basename (case-insensitive). Leaf module — no imports. The Python twin is
 * `scripts/inline_lib.py:build_asset_map`.
 */

/** Basename of a URL/path, ignoring query/hash and Windows separators. */
export function assetBasename(ref: string): string {
  return ref.split(/[?#]/)[0].split(/[/\\]/).pop()!.trim().toLowerCase();
}

/**
 * Shared basename→dataURL map behind both embedders (and the Python
 * `inline_lib.build_asset_map` twin): first file wins, keys lowercased.
 */
export function buildAssetMap(files: { name: string; dataUrl: string }[]): Map<string, string> {
  const byBase = new Map<string, string>();
  for (const f of files) {
    const key = assetBasename(f.name);
    if (!byBase.has(key)) byBase.set(key, f.dataUrl);
  }
  return byBase;
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

/** True when `ref` points at a raster/vector image file (by extension). */
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
  const byBase = buildAssetMap(files);
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
  const byBase = buildAssetMap(files);
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
