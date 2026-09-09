/**
 * CSS scoping helpers for the raster pipeline (Phase 1 split of `render.ts`).
 * Pure string functions — no imports.
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
