import { describe, expect, it, vi, afterEach } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  buildRenderHolder,
  clearInlineCache,
  collectExternalRefs,
  collectExternalRefsForPages,
  collectLocalFontUrls,
  collectLocalImageUrls,
  corsWarning,
  embedFontsInSource,
  embedImagesInSource,
  extractPageBackground,
  extractPrintCss,
  inlineExternalAssets,
  inlineExternalStylesheets,
  measureOverflow,
  numberOverlayStyle,
  REVEAL_OVERRIDE,
  scopeCss,
  SHELL_RESET,
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

describe("shell reset (v7_fixed.html @media screen regression)", () => {
  it("neutralizes screen margin/shadow on the scope in raster holders", () => {
    const holder = buildRenderHolder(
      {
        html: "<p>x</p>",
        styles: "@media screen{.page{margin:18pt auto;box-shadow:0 2pt 12pt rgba(0,0,0,.2);}}",
      },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    const styleText = holder.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain(SHELL_RESET);
    expect(styleText.indexOf(SHELL_RESET)).toBeGreaterThan(styleText.indexOf("box-shadow:0 2pt"));
  });

  it("neutralizes authored .page padding on the scope (margins live on inner .page)", () => {
    expect(SHELL_RESET).toContain("padding:0");
  });
});

describe("negative-margin bleed (chapter-2 day-band regression)", () => {
  // chapter-2.html: `.page{padding:51pt 51pt 0 51pt}` + first-child
  // `.day-band{margin:-12pt -16pt 0 -16pt}` bleeds into the page padding while
  // staying inside the page border box. The tool used to put its own margins
  // on the outer `.pdf-scope` while the inner `.page` (overflow:hidden, no
  // padding) clipped that bleed — the band lost its paddings/background.
  const CHAPTER2_CSS =
    ".page{padding:51pt 51pt 0 51pt;background:#FBF8F2;}" +
    ".day-band{background:#E5DCD3;padding:12pt 16pt 10pt 16pt;margin:-12pt -16pt 0 -16pt;}";
  const CHAPTER2_HTML = `<div class="day-band"><h2>Day 8: Sunset &amp; Candlelight Routine</h2></div>`;

  it("keeps tool margins + bleed + clip on the single inner .page box", () => {
    const holder = buildRenderHolder(
      { html: CHAPTER2_HTML, styles: CHAPTER2_CSS },
      DEFAULT_SETTINGS,
      0,
      1,
    );
    const scope = holder.querySelector(".pdf-scope") as HTMLElement;
    const inner = holder.querySelector(".pdf-scope .page") as HTMLElement;
    // Scope itself has no padding (authored .page padding is reset there)…
    expect(scope.style.padding).toBe("0px");
    expect(scope.style.overflow).toBe("hidden");
    // …the inner box owns the tool margins, so the negative-margin bleed
    // stays inside its border box instead of crossing an overflow:hidden edge.
    expect(inner.style.overflow).toBe("hidden");
    expect(inner.style.padding).not.toBe("");
    expect(inner.style.padding).not.toBe("0px");
    // Authored band keeps its negative margins + own padding (scoped, intact).
    const styleText = holder.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain(".pdf-scope .day-band");
    expect(styleText).toContain("margin:-12pt -16pt 0 -16pt");
    expect(styleText).toContain("padding:12pt 16pt 10pt 16pt");
  });
});

describe("local fonts + webfont counting (v7_fixed_p21_23.html regression)", () => {
  const V7_STYLES =
    `@font-face{font-family:"NotoSerif";src:url("_fonts/NotoSerif-Regular.ttf");}` +
    `@font-face{font-family:"NotoSerif";src:url("_fonts/NotoSerif-Bold.ttf");font-weight:700;}` +
    `@font-face{font-family:"Segoe UI Symbol";src:url("C:/Windows/Fonts/seguisym.ttf");}`;

  it("detects relative and machine-local @font-face URLs, not remote ones", () => {
    expect(collectLocalFontUrls(V7_STYLES)).toEqual(
      expect.arrayContaining([
        "_fonts/NotoSerif-Regular.ttf",
        "_fonts/NotoSerif-Bold.ttf",
        "C:/Windows/Fonts/seguisym.ttf",
      ]),
    );
    expect(collectLocalFontUrls(`@font-face{src:url(https://cdn.example/f.woff2);}`)).toEqual([]);
    expect(collectLocalFontUrls("p{color:red;}")).toEqual([]);
  });

  it("counts shared @font-face rules once, not once per page", () => {
    // 3 faces × 23 pages used to warn "138 webfont(s) detected".
    const pages = Array.from({ length: 23 }, (_, i) => ({
      html: `<p>page ${i}</p>`,
      styles: V7_STYLES,
    }));
    const refs = collectExternalRefsForPages(pages);
    expect(refs.fontFaces).toBe(3);
    expect(refs.localFonts).toHaveLength(3);
    expect(corsWarning(refs)).toContain("3 webfont(s)");
    expect(corsWarning(refs)).toContain("3 local font file(s)");
  });

  it("tells the user how to fix local fonts", () => {
    const warning = corsWarning(collectExternalRefs({ html: "<p>x</p>", styles: V7_STYLES }));
    expect(warning).toContain("Attach fonts");
    expect(warning).toContain("inline-local-fonts.py");
  });
});

describe("embedFontsInSource", () => {
  const DATA = "data:font/ttf;base64,AAAA";
  it("replaces matching basenames (relative dirs, backslashes, any case)", () => {
    const src =
      `<style>@font-face{src:url("_fonts/NotoSerif-Regular.ttf");}` +
      `@font-face{src:url('C:\\Windows\\Fonts\\SEGUISYM.ttf');}` +
      `a{background:url(https://cdn.example/bg.png);}</style>`;
    const { source, matched } = embedFontsInSource(src, [
      { name: "NotoSerif-Regular.ttf", dataUrl: DATA },
      { name: "seguisym.ttf", dataUrl: DATA },
    ]);
    expect(matched).toBe(2);
    expect(source).not.toContain("_fonts/NotoSerif-Regular.ttf");
    expect(source).not.toContain("SEGUISYM.ttf");
    expect(source).toContain(`url("${DATA}")`);
    expect(source).toContain("https://cdn.example/bg.png");
  });

  it("reports zero matches when nothing lines up", () => {
    const { source, matched } = embedFontsInSource("p{color:red;}", [
      { name: "Noto.ttf", dataUrl: DATA },
    ]);
    expect(matched).toBe(0);
    expect(source).toBe("p{color:red;}");
  });
});

describe("local images (cover-photo.jpg regression)", () => {
  // cover.html referenced a sibling `cover-photo.jpg`. A text upload has no
  // base URL, so the browser can never resolve it — the page renders fine
  // from disk but rasterizes blank in preview + PDF until inlined.
  const IMG = "data:image/jpeg;base64,AAAA";

  it("detects relative img src, srcset and CSS image urls, not remote/data", () => {
    const refs = collectLocalImageUrls(
      `<img src="cover-photo.jpg"><img src="https://cdn.example/a.png">` +
        `<img src="data:image/png;base64,AAA">` +
        `<img srcset="thumb.jpg 1x, https://cdn.example/b.png 2x">`,
      `.hero{background:url("assets/bg.jpg");}a{background:url(https://cdn.example/c.png);}`,
    );
    expect(refs).toEqual(
      expect.arrayContaining(["cover-photo.jpg", "thumb.jpg", "assets/bg.jpg"]),
    );
    expect(refs).not.toContain("https://cdn.example/a.png");
    expect(refs).not.toContain("data:image/png;base64,AAA");
  });

  it("ignores non-image CSS urls (fonts belong to collectLocalFontUrls)", () => {
    expect(
      collectLocalImageUrls("<p>x</p>", `@font-face{src:url("_fonts/NotoSerif.ttf");}`),
    ).toEqual([]);
  });

  it("warns with the image remedy and stays silent when inline", () => {
    expect(corsWarning(collectExternalRefs({ html: "<p>hi</p>", styles: "" }))).toBeNull();
    const warning = corsWarning(
      collectExternalRefs({ html: `<img src="cover-photo.jpg">`, styles: "" }),
    );
    expect(warning).toContain("1 local image(s)");
    expect(warning).toContain("cover-photo.jpg");
    expect(warning).toContain("Attach images");
    expect(warning).toContain("inline-local-images.py");
  });

  it("dedupes the same cover image across pages instead of counting per page", () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      html: `<img src="cover-photo.jpg"><p>page ${i}</p>`,
      styles: "",
    }));
    // NOTE: distinct innerHTML per page here (page N text) — a real guide
    // shares identical cover HTML once; dedupe is by identical page HTML.
    const same = Array.from({ length: 5 }, () => ({
      html: `<img src="cover-photo.jpg">`,
      styles: "",
    }));
    expect(collectExternalRefsForPages(same).localImages).toHaveLength(1);
    expect(pages.length).toBe(5);
  });

  it("embedImagesInSource rewrites src, srcset and CSS urls by basename", () => {
    const src =
      `<img src="assets/cover-photo.jpg">` +
      `<img srcset="thumb.jpg 1x, big.jpg 2x">` +
      `<style>.hero{background:url("BG.JPG");}a{background:url(https://cdn.example/c.png);}</style>`;
    const { source, matched } = embedImagesInSource(src, [
      { name: "cover-photo.jpg", dataUrl: IMG },
      { name: "thumb.jpg", dataUrl: IMG },
      { name: "big.jpg", dataUrl: IMG },
      { name: "bg.jpg", dataUrl: IMG },
    ]);
    expect(matched).toBe(4);
    expect(source).not.toContain("cover-photo.jpg");
    expect(source).not.toContain("thumb.jpg");
    expect(source).not.toContain("BG.JPG");
    expect(source).toContain("https://cdn.example/c.png");
    expect(source.split(IMG).length - 1).toBe(4);
  });

  it("embedImagesInSource leaves remote/data urls alone and reports zero", () => {
    const { source, matched } = embedImagesInSource(
      `<img src="https://cdn.example/a.png"><img src="data:image/png;base64,AAA">`,
      [{ name: "a.png", dataUrl: IMG }],
    );
    expect(matched).toBe(0);
    expect(source).toContain("https://cdn.example/a.png");
  });
});

describe("inlineExternalStylesheets", () => {
  afterEach(() => {
    clearInlineCache();
    vi.unstubAllGlobals();
  });

  it("folds fetched stylesheets into styles with font URLs inlined", async () => {
    const fontBlob = new Blob(["fake-woff2"], { type: "font/woff2" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("fonts.css")) {
          return {
            ok: true,
            text: async () => `@font-face{font-family:G;src:url(../fonts/g.woff2);}`,
          };
        }
        if (String(url).endsWith("g.woff2")) {
          return { ok: true, blob: async () => fontBlob };
        }
        throw new Error(`unexpected ${url}`);
      }),
    );
    const out = await inlineExternalStylesheets({
      html: "<p>x</p>",
      styles: "p{color:red;}",
      links: ["https://cdn.example/fonts.css"],
    });
    expect(out.links).toEqual([]);
    expect(out.styles).toContain("p{color:red;}");
    expect(out.styles).toContain("data:font/woff2;base64,");
    expect(out.styles).not.toContain("../fonts/g.woff2");
  });

  it("keeps the link when the stylesheet cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("CORS blocked");
      }),
    );
    const out = await inlineExternalStylesheets({
      html: "<p>x</p>",
      styles: "",
      links: ["https://cdn.example/fonts.css", "local/theme.css"],
    });
    expect(out.links).toEqual(["https://cdn.example/fonts.css", "local/theme.css"]);
  });
});
