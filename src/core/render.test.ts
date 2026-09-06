import { describe, expect, it, vi, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  buildRenderHolder,
  clearInlineCache,
  collectExternalRefs,
  collectExternalRefsForPages,
  corsWarning,
  extractPageBackground,
  extractPrintCss,
  inlineExternalAssets,
  measureOverflow,
  numberOverlayStyle,
  REVEAL_OVERRIDE,
  scopeCss,
  waitForHolderAssets,
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

describe("extractPageBackground (v7_fixed.html regression)", () => {
  // v7's pages are creamy (`background: #FBF8F2`) but the raster holder used
  // to force `#fff` inline, bleaching previews + PDF white.
  it("reads a flat .page background color", () => {
    expect(extractPageBackground(".page{background:#FBF8F2;}")).toBe("#FBF8F2");
    expect(
      extractPageBackground(".page{width:100%;background: #FBF8F2;\n padding:0;}"),
    ).toBe("#FBF8F2");
    expect(extractPageBackground(".page{background-color:rgb(251,248,242);}")).toBe(
      "rgb(251,248,242)",
    );
  });

  it("last .page rule wins and non-page rules are ignored", () => {
    expect(
      extractPageBackground(".page{background:#fff;}.x{background:#000;}.page{background:#111;}"),
    ).toBe("#111");
    expect(extractPageBackground("h1{background:#000;}")).toBeNull();
  });

  it("returns null for gradients, urls and missing backgrounds", () => {
    expect(extractPageBackground(".page{color:#000;}")).toBeNull();
    expect(
      extractPageBackground(".page{background:linear-gradient(#fff,#000);}"),
    ).toBeNull();
    expect(extractPageBackground(".page{background:url(a.png) #fff;}")).toBeNull();
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

  it("keeps the author's .page background instead of forcing white", () => {
    const holder = buildRenderHolder(
      { html: "<p>x</p>", styles: ".page{background:#FBF8F2;}" },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    // Paper color follows the author…
    expect(holder.style.background).toContain("rgb(251, 248, 242)");
    // …and the scope no longer hard-codes white inline, so authored
    // backgrounds (flat or gradient) win by source order over the base rule.
    const scope = holder.querySelector(".pdf-scope") as HTMLElement;
    expect(scope.style.background).toBe("");
    const styleText = holder.querySelector("style")?.textContent ?? "";
    expect(styleText.indexOf(".pdf-scope{background:#fff;}")).toBeLessThan(
      styleText.indexOf(".pdf-scope{background:#FBF8F2;}"),
    );
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
  afterEach(() => {
    clearInlineCache();
    vi.unstubAllGlobals();
  });
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

  it("counts parsed <link> hrefs as stylesheets", () => {
    const refs = collectExternalRefs({
      html: "<p>hi</p>",
      styles: "",
      links: ["https://fonts.googleapis.com/css2?family=Inter"],
    });
    expect(refs.stylesheets).toBe(1);
    expect(corsWarning(refs)).toContain("stylesheet");
  });

  it("collects srcset + @import URLs and scans every page", () => {
    const refs = collectExternalRefsForPages([
      { html: "<p>inline</p>", styles: "" },
      {
        html: `<img srcset="https://cdn.example/a.png 1x, https://cdn.example/b.png 2x">`,
        styles: `@import url("https://cdn.example/fonts.css");`,
        links: ["https://fonts.googleapis.com/css2?family=Inter"],
      },
    ]);
    expect(refs.images).toContain("https://cdn.example/a.png");
    expect(refs.images).toContain("https://cdn.example/b.png");
    expect(refs.images).toContain("https://cdn.example/fonts.css");
    expect(refs.stylesheets).toBe(1);
    expect(corsWarning(refs)).toContain("external image(s)");
  });

  it("injects stylesheet links into the raster holder", () => {
    const holder = buildRenderHolder(
      {
        html: "<p>x</p>",
        styles: "",
        links: ["https://fonts.googleapis.com/css2?family=Inter"],
      },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    const link = holder.querySelector('link[rel="stylesheet"]');
    expect(link?.getAttribute("href")).toBe("https://fonts.googleapis.com/css2?family=Inter");
  });

  it("waitForHolderAssets resolves quickly for empty holders (jsdom has no fonts API)", async () => {
    const holder = buildRenderHolder({ html: "<p>x</p>", styles: "" }, DEFAULT_SETTINGS, 0, 1);
    await expect(waitForHolderAssets(holder, 1000)).resolves.toBeUndefined();
  });

  it("inlineExternalAssets rewrites fetchable remote images to data URLs", async () => {
    const blob = new Blob(["fake-png"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => blob }) as Response),
    );
    const out = await inlineExternalAssets({
      html: `<img src="https://cdn.example/a.png">`,
      styles: `a{background:url(https://cdn.example/b.png);}`,
    });
    expect(out.html).toContain("data:image/png;base64,");
    expect(out.html).not.toContain("https://cdn.example/a.png");
    expect(out.styles).toContain("data:image/png;base64,");
  });

  it("inlineExternalAssets keeps original URLs when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("CORS blocked");
      }),
    );
    const page = {
      html: `<img src="https://cdn.example/a.png">`,
      styles: "",
    };
    const out = await inlineExternalAssets(page);
    expect(out.html).toContain("https://cdn.example/a.png");
  });
});
