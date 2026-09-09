import { act, renderHook } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("../core/fileHelpers", () => ({ downloadBlob: vi.fn() }));

import { downloadBlob } from "../core/fileHelpers";
import { usePdfMerger } from "./usePdfMerger";

async function pdfFile(name: string, pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const bytes = await doc.save();
  return new File([bytes as unknown as BlobPart], name, { type: "application/pdf" });
}

describe("usePdfMerger", () => {
  it("loads PDFs, totals pages, reorders, removes and clears", async () => {
    const { result } = renderHook(() => usePdfMerger());
    const a = await pdfFile("a.pdf", 2);
    const b = await pdfFile("b.pdf", 1);
    await act(async () => {
      await result.current.addFiles([a, b]);
    });
    expect(result.current.entries.map((e) => e.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result.current.totalPages).toBe(3);

    act(() => result.current.commitReorder(0, 1));
    expect(result.current.entries.map((e) => e.name)).toEqual(["b.pdf", "a.pdf"]);

    act(() => result.current.removeEntry(result.current.entries[0].id));
    expect(result.current.entries.map((e) => e.name)).toEqual(["a.pdf"]);

    act(() => result.current.clearAll());
    expect(result.current.entries).toEqual([]);
  });

  it("rejects non-PDF picks and corrupt PDFs with a message", async () => {
    const { result } = renderHook(() => usePdfMerger());
    await act(async () => {
      await result.current.addFiles([new File(["x"], "note.txt", { type: "text/plain" })]);
    });
    expect(result.current.error).toMatch(/Only PDF/);
    await act(async () => {
      await result.current.addFiles([new File(["junk"], "junk.pdf", { type: "application/pdf" })]);
    });
    expect(result.current.error).toMatch(/junk\.pdf/);
    expect(result.current.entries).toEqual([]);
  });

  it("downloads the merged bytes", async () => {
    const { result } = renderHook(() => usePdfMerger());
    await act(async () => {
      await result.current.addFiles([await pdfFile("a.pdf", 2), await pdfFile("b.pdf", 3)]);
    });
    await act(async () => {
      await result.current.onDownload();
    });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "combined.pdf");
    const blob = vi.mocked(downloadBlob).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });
});
