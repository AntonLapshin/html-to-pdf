import { describe, expect, it } from "vitest";
import {
  clampSettings,
  DEFAULT_SETTINGS,
  dpiToScale,
  effectiveMargins,
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
});
