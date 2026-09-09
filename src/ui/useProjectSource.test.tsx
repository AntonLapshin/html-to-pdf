import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/fileHelpers", () => ({
  downloadText: vi.fn(),
  fetchSample: vi.fn(async () => `<div class="page"><p>sample</p></div><style>.page{padding:10mm;}</style>`),
  readFilesAsDataUrls: vi.fn(async () => [{ name: "a.ttf", dataUrl: "data:font/ttf;base64,AAA" }]),
}));

import { downloadText, fetchSample } from "../core/fileHelpers";
import { useProjectSource } from "./useProjectSource";

const TWO_PAGES = `<div class="page"><p>one</p></div><div class="page"><p>two</p></div><style>.page{padding:10mm;}</style>`;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

describe("useProjectSource", () => {
  it("applies valid sources and reports .page errors", () => {
    const { result } = renderHook(() => useProjectSource());
    act(() => result.current.applySource(TWO_PAGES, "guide.html"));
    expect(result.current.doc?.pages).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(result.current.recents[0]).toMatchObject({ name: "guide.html", pageCount: 2 });

    act(() => result.current.applySource("<p>no pages</p>", "bad.html"));
    expect(result.current.error).toMatch(/No .page blocks/);
    expect(result.current.doc).toBeNull();
    vi.useRealTimers();
  });

  it("adopts the file design (letter + html margins) and pastes HTML", () => {
    const { result } = renderHook(() => useProjectSource());
    act(() =>
      result.current.applySource(
        `<div class="page"><p>x</p></div><style>@page{size:letter;}.page{padding:12mm;}</style>`,
        "letter.html",
      ),
    );
    expect(result.current.settings.pageSize).toBe("letter");
    expect(result.current.settings.marginMode).toBe("html");

    act(() => result.current.onPasteHtml(TWO_PAGES, "pasted.html"));
    expect(result.current.filename).toBe("pasted.html");
    vi.useRealTimers();
  });

  it("loads samples, files, recents and project files", async () => {
    const { result } = renderHook(() => useProjectSource());
    await act(async () => {
      await result.current.onSample();
    });
    expect(result.current.doc?.pages).toHaveLength(1);

    const file = new File([TWO_PAGES], "up.html", { type: "text/html" });
    await act(async () => {
      await result.current.onFile(file);
    });
    expect(result.current.filename).toBe("up.html");

    act(() => result.current.onLoadRecent({ name: "up.html", savedAt: "t", pageCount: 2, source: TWO_PAGES }));
    expect(result.current.doc?.pages).toHaveLength(2);

    act(() => result.current.onClearRecents());
    expect(result.current.recents).toEqual([]);

    const project = JSON.stringify({
      app: "html-to-pdf",
      version: 1,
      filename: "p.json",
      savedAt: new Date().toISOString(),
      source: TWO_PAGES,
      settings: result.current.settings,
    });
    await act(async () => {
      await result.current.onLoadProjectFile(new File([project], "p.json", { type: "application/json" }));
    });
    expect(result.current.doc?.pages).toHaveLength(2);
    vi.useRealTimers();
  });

  it("saves the project and flags unmatched attachments", async () => {
    const { result } = renderHook(() => useProjectSource());
    act(() => result.current.applySource(TWO_PAGES, "guide.html"));
    act(() => result.current.onSaveProject());
    expect(downloadText).toHaveBeenCalled();

    await act(async () => {
      await result.current.onAttachFonts([new File(["x"], "a.ttf")] as unknown as FileList);
    });
    expect(result.current.error).toMatch(/None of the 1 font/);
    vi.useRealTimers();
  });

  it("restores the autosaved session on mount", () => {
    // Seed via a first hook instance, then mount a fresh one.
    const first = renderHook(() => useProjectSource());
    act(() => first.result.current.applySource(TWO_PAGES, "guide.html"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    first.unmount();
    const second = renderHook(() => useProjectSource());
    expect(second.result.current.doc?.pages).toHaveLength(2);
    expect(second.result.current.filename).toBe("guide.html");
    vi.useRealTimers();
  });

  it("surfaces sample/project/attach failures and no-ops safely", async () => {
    const { result } = renderHook(() => useProjectSource());
    vi.mocked(fetchSample).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await result.current.onSample();
    });
    expect(result.current.error).toBe("offline");

    await act(async () => {
      await result.current.onLoadProjectFile(new File(["garbage"], "p.json", { type: "application/json" }));
    });
    expect(result.current.error).toBeTruthy();

    // Fresh hook without a source: save/attach are safe no-ops.
    const fresh = renderHook(() => useProjectSource());
    act(() => fresh.result.current.onSaveProject());
    await act(async () => {
      await fresh.result.current.onAttachFonts(null);
    });
    expect(fresh.result.current.error).toBeNull();

    // Images report their own mismatch hint.
    act(() => result.current.applySource(TWO_PAGES, "guide.html"));
    await act(async () => {
      await result.current.onAttachImages([new File(["x"], "pic.png")] as unknown as FileList);
    });
    expect(result.current.error).toMatch(/None of the 1 image/);
    vi.useRealTimers();
  });
});
