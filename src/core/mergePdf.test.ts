import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  formatBytes,
  getPdfPageCount,
  mergePdfBytes,
  moveItem,
} from "./mergePdf";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe("moveItem", () => {
  it("moves forward and backward", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("clamps out-of-range targets and ignores bad sources", () => {
    expect(moveItem(["a", "b"], 0, 99)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("formatBytes", () => {
  it("formats B/KB/MB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("mergePdfBytes", () => {
  it("combines page counts in order", async () => {
    const a = await makePdf(2);
    const b = await makePdf(3);
    const merged = await mergePdfBytes([a, b]);
    expect(await getPdfPageCount(merged)).toBe(5);
    // Single input passes through unchanged in page count.
    expect(await getPdfPageCount(await mergePdfBytes([b]))).toBe(3);
  });
  it("rejects empty input and garbage bytes", async () => {
    await expect(mergePdfBytes([])).rejects.toThrow(/at least one PDF/);
    await expect(getPdfPageCount(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a readable PDF/);
  });
});
