import { describe, expect, it } from "vitest";
import { buildPageSrcDoc, pageNumberText, parseHtmlPages } from "./parseHtml";

const SOURCE = `<!doctype html><html><head><style>.page h1{color:red;}</style>
<style>.page p{line-height:1.5;}</style></head>
<body><div class="page"><h1>One</h1></div><div class="page"><p>Two</p></div></body></html>`;

describe("parseHtmlPages", () => {
  it("extracts .page blocks in order with inner + outer html", () => {
    const doc = parseHtmlPages(SOURCE);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0].index).toBe(0);
    expect(doc.pages[0].html).toContain("<h1>One</h1>");
    expect(doc.pages[0].outerHtml).toContain('class="page"');
    expect(doc.pages[1].html).toContain("<p>Two</p>");
  });

  it("concatenates all <style> blocks", () => {
    const doc = parseHtmlPages(SOURCE);
    expect(doc.styles).toContain("color:red");
    expect(doc.styles).toContain("line-height:1.5");
  });

  it("returns zero pages for HTML without .page blocks", () => {
    expect(parseHtmlPages("<html><body><p>no pages</p></body></html>").pages).toHaveLength(0);
  });

  it("extracts external stylesheet links", () => {
    const doc = parseHtmlPages(
      `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">` +
        `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">` +
        `</head><body><div class="page">x</div></body></html>`,
    );
    expect(doc.links).toEqual(["https://fonts.googleapis.com/css2?family=Inter"]);
  });

  it("returns empty links for fully inline documents", () => {
    expect(parseHtmlPages(SOURCE).links).toEqual([]);
  });

  it("ignores nested .page wrappers as separate blocks in document order", () => {
    const doc = parseHtmlPages(`<div class="page">a</div><section><div class="page">b</div></section>`);
    expect(doc.pages.map((p) => p.html)).toEqual(["a", "b"]);
  });
});

describe("pageNumberText", () => {
  it("returns null when numbers are hidden", () => {
    expect(pageNumberText(false, 1, 0, 3)).toBeNull();
  });

  it("offsets by the start number", () => {
    expect(pageNumberText(true, 5, 0, 3)).toBe("5 / 3");
    expect(pageNumberText(true, 5, 2, 3)).toBe("7 / 3");
  });
});

describe("buildPageSrcDoc", () => {
  it("embeds scoped styles, margins and the page number", () => {
    const doc = parseHtmlPages(SOURCE);
    const srcDoc = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      pageNumberText: "1 / 2",
      numberPosition: "bottom-center",
    });
    expect(srcDoc).toContain("<h1>One</h1>");
    expect(srcDoc).toContain("1 / 2");
    expect(srcDoc).toContain("padding:10mm 10mm 10mm 10mm");
    expect(srcDoc).toContain("text-align:center");
  });

  it("forces scroll-reveal pages visible and hoists print rules (guide_30.html regression)", () => {
    const doc = parseHtmlPages(
      `<html><head><style>.page{opacity:0;transform:translateY(16px);}` +
        `.page.seen{opacity:1;transform:none;}` +
        `@media print{.page{opacity:1 !important;}}</style></head>` +
        `<body><div class="page"><p>Guide</p></div></body></html>`,
    );
    const srcDoc = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      pageNumberText: null,
    });
    expect(srcDoc).toContain("<p>Guide</p>");
    // Hoisted print intent + reveal override both come after the screen rule.
    const revealPos = srcDoc.indexOf(".pdf-scope{opacity:0;");
    expect(revealPos).toBeGreaterThan(-1);
    expect(srcDoc.indexOf("opacity:1 !important", revealPos)).toBeGreaterThan(revealPos);
    expect(srcDoc).toContain("pdf-scope seen");
  });

  it("aligns numbers left/right per position and omits the div when hidden", () => {
    const doc = parseHtmlPages(SOURCE);
    const left = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 1, right: 2, bottom: 3, left: 4 },
      pageNumberText: "2 / 2",
      numberPosition: "bottom-left",
    });
    expect(left).toContain("text-align:left");
    const hidden = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 1, right: 2, bottom: 3, left: 4 },
      pageNumberText: null,
    });
    expect(hidden).not.toContain('<div class="page-number"');
  });

  it("resets screen shell margin/shadow so the modal matches the raster", () => {
    const doc = parseHtmlPages(
      `<html><head><style>@media screen{.page{margin:18pt auto;box-shadow:0 2pt 12pt black;}}</style></head>` +
        `<body><div class="page"><p>Hi</p></div></body></html>`,
    );
    const srcDoc = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      pageNumberText: null,
    });
    expect(srcDoc).toContain("box-shadow:none");
    expect(srcDoc.indexOf("box-shadow:none")).toBeGreaterThan(srcDoc.indexOf("box-shadow:0 2pt"));
  });

  it("re-injects stylesheet links so webfonts load in the modal", () => {
    const doc = parseHtmlPages(
      `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">` +
        `</head><body><div class="page"><p>Hi</p></div></body></html>`,
    );
    const srcDoc = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      pageNumberText: null,
      links: doc.links,
    });
    expect(srcDoc).toContain('href="https://fonts.googleapis.com/css2?family=Inter"');
  });

  it("puts tool margins on the inner .page so negative-margin bands survive (chapter-2 day-band)", () => {
    const doc = parseHtmlPages(
      `<html><head><style>.page{padding:51pt 51pt 0 51pt;}` +
        `.day-band{margin:-12pt -16pt 0 -16pt;padding:12pt 16pt 10pt 16pt;}</style></head>` +
        `<body><div class="page"><div class="day-band"><h2>Day 8</h2></div></div></body></html>`,
    );
    const srcDoc = buildPageSrcDoc(doc.pages[0], doc.styles, {
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      pageNumberText: null,
    });
    // Scope has no padding; the inner page box owns the tool margins.
    expect(srcDoc).toContain(".pdf-scope{box-sizing:border-box;width:100%;height:100%;position:relative;background:#fff;overflow:hidden;\npadding:0;}");
    expect(srcDoc).toContain(".pdf-scope .page{box-sizing:border-box;width:100%;height:100%;overflow:hidden;\npadding:10mm 10mm 10mm 10mm;}");
  });
});
