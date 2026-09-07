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

async function makeSizedPdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  return doc.save();
}

async function outputSizes(data: Uint8Array): Promise<[number, number][]> {
  const doc = await PDFDocument.load(data);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return [Math.round(width), Math.round(height)];
  });
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
  it("never overlaps: one output page per input page, sizes preserved in order", async () => {
    const a = await makeSizedPdf([
      [595, 842],
      [595, 842],
    ]);
    const b = await makeSizedPdf([[612, 792]]);
    const c = await makeSizedPdf([[400, 400]]);
    const merged = await mergePdfBytes([a, b, c]);
    // Page count is the exact sum — a collapse/overlap would come up short.
    expect(await getPdfPageCount(merged)).toBe(4);
    expect(await outputSizes(merged)).toEqual([
      [595, 842],
      [595, 842],
      [612, 792],
      [400, 400],
    ]);
  });
  it("doubles pages when the same file is merged twice (no page reuse collapse)", async () => {
    const a = await makePdf(2);
    const merged = await mergePdfBytes([a, a]);
    expect(await getPdfPageCount(merged)).toBe(4);
  });
  it("accepts ArrayBuffers and offset subarray views of a larger buffer", async () => {
    const a = await makePdf(2);
    const b = await makePdf(1);
    const aBuf: ArrayBuffer = a.slice().buffer as ArrayBuffer;
    expect(await getPdfPageCount(await mergePdfBytes([aBuf, b]))).toBe(3);
    // Embed both files in one padded buffer and pass offset views: the merge
    // must still see exactly each file's bytes (no cross-file misparse).
    const padded = new Uint8Array(16 + a.length + 16 + b.length + 16);
    padded.set(a, 16);
    padded.set(b, 16 + a.length + 16);
    const aView = padded.subarray(16, 16 + a.length);
    const bView = padded.subarray(16 + a.length + 16, 16 + a.length + 16 + b.length);
    expect(aView.byteOffset).toBeGreaterThan(0);
    const merged = await mergePdfBytes([aView, bView]);
    expect(await getPdfPageCount(merged)).toBe(3);
  });
  it("names the offending file when one input is corrupt", async () => {
    const a = await makePdf(1);
    await expect(mergePdfBytes([a, new Uint8Array([1, 2, 3])])).rejects.toThrow(/PDF #2.*could not be read/);
  });
});
