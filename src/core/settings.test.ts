import { describe, expect, it } from "vitest";
import {
  clampSettings,
  DEFAULT_SETTINGS,
  detectPageSize,
  dpiToScale,
  effectiveMargins,
  extractPagePadding,
  mmToPx,
  pageDimsPx,
} from "./settings";

describe("mmToPx", () => {
  it("converts 25.4mm to 96px", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 6);
  });

  it("converts 0 to 0", () => {
    expect(mmToPx(0)).toBe(0);
  });
});

describe("pageDimsPx", () => {
  it("scales A4 to ~794x1123px", () => {
    const dims = pageDimsPx("a4");
    expect(dims.width).toBe(Math.round((210 / 25.4) * 96));
    expect(dims.height).toBe(Math.round((297 / 25.4) * 96));
  });

  it("makes letter wider and shorter than A4", () => {
    const a4 = pageDimsPx("a4");
    const letter = pageDimsPx("letter");
    expect(letter.width).toBeGreaterThan(a4.width);
    expect(letter.height).toBeLessThan(a4.height);
  });
});

describe("effectiveMargins", () => {
  it("expands uniform margin to all edges", () => {
    expect(effectiveMargins({ ...DEFAULT_SETTINGS, marginMode: "uniform", marginMm: 12 })).toEqual({
      top: 12,
      right: 12,
      bottom: 12,
      left: 12,
    });
  });

  it("passes custom edges through as a copy", () => {
    const custom = { top: 5, right: 6, bottom: 7, left: 8 };
    const out = effectiveMargins({ ...DEFAULT_SETTINGS, marginMode: "custom", marginsMm: custom });
    expect(out).toEqual(custom);
    expect(out).not.toBe(custom);
  });

  it("reuses .page padding in html mode (v7_fixed.html regression)", () => {
    const css = `.page{width:612pt;height:792pt;padding:48pt 51pt 54pt 51pt;}`;
    const out = effectiveMargins({ ...DEFAULT_SETTINGS, marginMode: "html" }, css);
    // 48pt→16.93mm, 51pt→17.99mm, 54pt→19.05mm
    expect(out.top).toBeCloseTo(16.933, 2);
    expect(out.right).toBeCloseTo(17.99, 2);
    expect(out.bottom).toBeCloseTo(19.05, 2);
    expect(out.left).toBeCloseTo(17.99, 2);
  });

  it("falls back to the uniform margin when the file has no .page padding", () => {
    const out = effectiveMargins({ ...DEFAULT_SETTINGS, marginMode: "html", marginMm: 12 }, "h1{color:red;}");
    expect(out).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  });
});

describe("extractPagePadding", () => {
  it("expands 1/2/3-value shorthands", () => {
    expect(extractPagePadding(".page{padding:10mm;}")).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(extractPagePadding(".page{padding:10mm 20mm;}")).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(extractPagePadding(".page{padding:1mm 2mm 3mm;}")).toEqual({ top: 1, right: 2, bottom: 3, left: 2 });
  });

  it("converts pt/px/in to mm and lets longhands override", () => {
    const out = extractPagePadding(".page{padding:72pt;padding-left:25.4mm;}");
    expect(out?.top).toBeCloseTo(25.4, 6);
    expect(out?.left).toBeCloseTo(25.4, 6);
  });

  it("last .page rule wins and @media overrides are ignored", () => {
    const css =
      ".page{padding:10mm;}" +
      ".page{padding:20mm;}" +
      "@media screen{.page{padding:1mm;margin:18pt auto;}}";
    expect(extractPagePadding(css)).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it("returns null when there is no usable padding", () => {
    expect(extractPagePadding("h1{color:red;}")).toBeNull();
    expect(extractPagePadding(".page{color:red;}")).toBeNull();
    expect(extractPagePadding(".page{padding:10%;}")).toBeNull();
  });
});

describe("detectPageSize", () => {
  it("reads @page size tokens", () => {
    expect(detectPageSize("@page{size:Letter;margin:0;}")).toBe("letter");
    expect(detectPageSize("@page{size:A4;}")).toBe("a4");
  });

  it("matches .page Letter/A4 geometry", () => {
    expect(detectPageSize(".page{width:612pt;height:792pt;}")).toBe("letter");
    expect(detectPageSize(".page{width:210mm;height:297mm;}")).toBe("a4");
  });

  it("returns null when nothing conclusive is declared", () => {
    expect(detectPageSize("h1{color:red;}")).toBeNull();
    expect(detectPageSize(".page{width:100%;}")).toBeNull();
  });
});

describe("dpiToScale", () => {
  it("maps 96dpi to scale 1 and 192dpi to scale 2", () => {
    expect(dpiToScale(96)).toBe(1);
    expect(dpiToScale(192)).toBe(2);
  });

  it("clamps to 0.75..4", () => {
    expect(dpiToScale(10)).toBe(0.75);
    expect(dpiToScale(2000)).toBe(4);
  });
});

describe("clampSettings", () => {
  it("clamps margins, dpi and quality into range", () => {
    const clamped = clampSettings({
      ...DEFAULT_SETTINGS,
      marginMm: 999,
      marginsMm: { top: -5, right: 999, bottom: 10, left: 10 },
      dpi: 1000,
      quality: 5,
      startPageNumber: 0,
    });
    expect(clamped.marginMm).toBe(40);
    expect(clamped.marginsMm.top).toBe(0);
    expect(clamped.marginsMm.right).toBe(40);
    expect(clamped.dpi).toBe(300);
    expect(clamped.quality).toBe(1);
    expect(clamped.startPageNumber).toBe(1);
  });

  it("floors the start page number", () => {
    expect(clampSettings({ ...DEFAULT_SETTINGS, startPageNumber: 2.9 }).startPageNumber).toBe(2);
  });

  it("resets unknown margin modes to uniform", () => {
    expect(
      clampSettings({ ...DEFAULT_SETTINGS, marginMode: "bogus" as never }).marginMode,
    ).toBe("uniform");
    expect(clampSettings({ ...DEFAULT_SETTINGS, marginMode: "html" }).marginMode).toBe("html");
  });
});
