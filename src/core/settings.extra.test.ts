import { describe, expect, it } from "vitest";
import { detectPageSize, extractPagePadding, pageAspectRatio } from "./settings";

describe("settings unit gaps", () => {
  it("exposes distinct aspect ratios per page size", () => {
    expect(pageAspectRatio("a4")).toBe("210 / 297");
    expect(pageAspectRatio("letter")).toBe("215.9 / 279.4");
  });

  it("detectPageSize converts px/mm/cm/in geometry", () => {
    // 8.5in x 11in == Letter (612x792pt).
    expect(detectPageSize(".page{width:8.5in;height:11in;}")).toBe("letter");
    // 210mm x 297mm == A4.
    expect(detectPageSize(".page{width:210mm;height:297mm;}")).toBe("a4");
    // 21cm x 29.7cm == A4.
    expect(detectPageSize(".page{width:21cm;height:29.7cm;}")).toBe("a4");
    // Unknown units never match.
    expect(detectPageSize(".page{width:10em;height:10em;}")).toBeNull();
    // Garbage lengths never match.
    expect(detectPageSize(".page{width:auto;height:auto;}")).toBeNull();
  });

  it("extractPagePadding converts cm/q/pc units", () => {
    expect(extractPagePadding(".page{padding:1cm;}")?.top).toBeCloseTo(10, 5);
    expect(extractPagePadding(".page{padding:40q;}")?.top).toBeCloseTo(10, 5);
    expect(extractPagePadding(".page{padding:1pc;}")?.top).toBeCloseTo(25.4 / 6, 5);
  });
});
