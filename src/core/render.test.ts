import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  buildRenderHolder,
  collectExternalRefs,
  corsWarning,
  extractPrintCss,
  measureOverflow,
  numberOverlayStyle,
  REVEAL_OVERRIDE,
  scopeCss,
} from "./render";

describe("scopeCss", () => {
  it("scopes plain selectors under the given scope", () => {
    const out = scopeCss("h1{color:red;}", ".pdf-scope");
    expect(out).toContain(".pdf-scope h1{color:red;}");
  });

  it("rewrites .page root to the scope itself", () => {
    expect(scopeCss(".page{margin:0;}", ".pdf-scope")).toContain(".pdf-scope{margin:0;}");
    expect(scopeCss(".page h1{margin:0;}", ".pdf-scope")).toContain(".pdf-scope h1{margin:0;}");
  });

  it("rewrites html/body roots and strips comments", () => {
    const out = scopeCss("/* hi */ body p{color:blue;}", ".pdf-scope");
    expect(out).not.toContain("/*");
    expect(out).toContain(".pdf-scope p{color:blue;}");
  });

  it("scopes rules inside @media but keeps @font-face verbatim", () => {
    const out = scopeCss(
      "@media print{h1{color:black;}}@font-face{font-family:x;src:url(a.woff);}",
      ".pdf-scope",
    );
    expect(out).toContain("@media print{.pdf-scope h1{color:black;}}");
    expect(out).toContain("@font-face{font-family:x;src:url(a.woff);}");
  });

  it("handles comma selector lists", () => {
    const out = scopeCss("h1, h2{margin:0;}", ".pdf-scope");
    expect(out).toContain(".pdf-scope h1, .pdf-scope h2{margin:0;}");
  });
});

describe("extractPrintCss", () => {
  it("hoists @media print inner rules and ignores screen queries", () => {
    const css =
      "@media print{.page{opacity:1 !important;}.toolbar{display:none;}}" +
      "@media screen and (max-width:840px){.page{width:100%;}}";
    const out = extractPrintCss(css);
    expect(out).toContain(".page{opacity:1 !important;}");
    expect(out).toContain(".toolbar{display:none;}");
    expect(out).not.toContain("width:100%");
  });

  it("returns empty string when there are no print blocks", () => {
    expect(extractPrintCss("h1{color:red;}")).toBe("");
  });
});

describe("scroll-reveal safety net (guide_30.html regression)", () => {
  // guide_30.html hides every page until an IntersectionObserver script adds
  // `.seen` — a script the raster pipeline never runs — so without the
  // override every page rasterizes at opacity:0 (blank preview + blank PDF).
  const REVEAL_CSS =
    ".page{opacity:0;transform:translateY(16px);transition:opacity .7s ease, transform .7s ease;}" +
    ".page.seen{opacity:1;transform:none;}" +
    "@media print{.page{opacity:1 !important;transform:none !important;}}";

  it("forces the page shell visible after the scoped reveal rules", () => {
    const holder = buildRenderHolder(
      { html: "<p>guide content</p>", styles: REVEAL_CSS },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    const styleText = holder.querySelector("style")?.textContent ?? "";
    // Screen reveal rule is scoped…
    expect(styleText).toContain(".pdf-scope{opacity:0;");
    // …but the hoisted print intent and the override come after it.
    const revealPos = styleText.indexOf(".pdf-scope{opacity:0;");
    expect(styleText.indexOf("opacity:1 !important", revealPos)).toBeGreaterThan(revealPos);
    expect(styleText).toContain(REVEAL_OVERRIDE);
  });

  it("mirrors reveal-state classes onto the shell", () => {
    const holder = buildRenderHolder(
      { html: "<p>x</p>", styles: REVEAL_CSS },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    const scope = holder.querySelector(".pdf-scope");
    expect(scope?.classList.contains("seen")).toBe(true);
    expect(holder.querySelector(".pdf-scope .page")?.classList.contains("seen")).toBe(true);
  });

  it("keeps descendant selectors working (content still matches)", () => {
    const out = scopeCss(".page h1{color:red;}", ".pdf-scope");
    expect(out).toContain(".pdf-scope h1{color:red;}");
  });
});

describe("numberOverlayStyle", () => {
  it("aligns per position", () => {
    expect(numberOverlayStyle("bottom-center")).toContain("text-align:center");
    expect(numberOverlayStyle("bottom-left")).toContain("text-align:left");
    expect(numberOverlayStyle("bottom-right")).toContain("text-align:right");
  });
});

describe("buildRenderHolder", () => {
  it("builds a fixed-size holder with scoped css and number overlay", () => {
    const holder = buildRenderHolder(
      { html: "<h1>Hi</h1>", styles: "h1{color:red;}" },
      DEFAULT_SETTINGS,
      0,
      2,
    );
    expect(holder.style.width).not.toBe("");
    expect(holder.innerHTML).toContain("<h1>Hi</h1>");
    expect(holder.innerHTML).toContain(".pdf-scope h1");
    expect(holder.innerHTML).toContain("1 / 2");
  });

  it("omits the overlay when numbers are hidden", () => {
    const holder = buildRenderHolder(
      { html: "x", styles: "" },
      { ...DEFAULT_SETTINGS, showPageNumbers: false },
      0,
      1,
    );
    expect(holder.innerHTML).not.toContain("page-number");
  });
});

describe("measureOverflow", () => {
  it("reports shape fields and no overflow for tiny content", () => {
    const res = measureOverflow({ html: "<p>tiny</p>", styles: "" }, DEFAULT_SETTINGS, 0, 1);
    expect(res.usablePx).toBeGreaterThan(0);
    expect(res.contentPx).toBeGreaterThanOrEqual(0);
    expect(res.overflows).toBe(false);
  });
});

describe("collectExternalRefs + corsWarning", () => {
  it("returns null when everything is inline", () => {
    expect(corsWarning(collectExternalRefs({ html: "<p>hi</p>", styles: "p{color:red;}" }))).toBeNull();
  });

  it("flags external images, stylesheets and fonts", () => {
    const refs = collectExternalRefs({
      html: `<img src="https://cdn.example/a.png"><link rel="stylesheet" href="x.css">`,
      styles: `@font-face{font-family:x;}a{background:url(https://cdn.example/b.png);}`,
    });
    expect(refs.images).toHaveLength(2);
    expect(refs.stylesheets).toBe(1);
    expect(refs.fontFaces).toBe(1);
    const warning = corsWarning(refs);
    expect(warning).toContain("external image(s)");
    expect(warning).toContain("CORS");
  });
});
