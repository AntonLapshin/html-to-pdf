import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDocument } from "../core/parseHtml";
import { DEFAULT_SETTINGS } from "../core/settings";

const { measureMock, renderMock } = vi.hoisted(() => ({
  measureMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock("../core/raster", () => ({
  measureOverflowAsync: measureMock,
  renderPageCanvas: renderMock,
}));
vi.mock("../core/canvas", () => ({
  canvasToPreviewUrl: vi.fn(() => "preview-url"),
  canvasToDetailUrl: vi.fn(() => "detail-url"),
}));

import { usePageRenders } from "./usePageRenders";

function doc(n: number, tag = "p"): ParsedDocument {
  return {
    pages: Array.from({ length: n }, (_, i) => ({ index: i, html: `<${tag}>${i}</${tag}>`, outerHtml: "" })),
    styles: "",
    links: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  measureMock.mockReset();
  renderMock.mockReset();
  measureMock.mockImplementation(async () => ({ overflows: false }) as never);
  renderMock.mockImplementation(async () => ({}) as never);
});

describe("usePageRenders", () => {
  it("reports empty state without a doc", () => {
    const { result } = renderHook(() => usePageRenders(null, DEFAULT_SETTINGS));
    expect(result.current).toEqual({ renders: [], corsNotice: null, rendering: false });
    vi.useRealTimers();
  });

  it("debounces the raster run (nothing before 250ms, ready after)", async () => {
    const d = doc(2);
    const { result } = renderHook(({ doc }) => usePageRenders(doc, DEFAULT_SETTINGS), {
      initialProps: { doc: d },
    });
    expect(renderMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    // Two pages rendered through the single pipeline.
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(result.current.renders).toHaveLength(2);
    expect(result.current.renders[0]).toMatchObject({
      status: "ready",
      previewUrl: "preview-url",
      detailUrl: "detail-url",
    });
    expect(result.current.rendering).toBe(false);
    vi.useRealTimers();
  });

  it("cancels a stale run when inputs change before the timer fires", async () => {
    const first = doc(1, "p");
    const second = doc(1, "section");
    const { result, rerender } = renderHook(({ d }) => usePageRenders(d, DEFAULT_SETTINGS), {
      initialProps: { d: first },
    });
    rerender({ d: second });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    // Only the latest doc's HTML reaches the raster pipeline.
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderMock).mock.calls[0][0]).toMatchObject({ html: "<section>0</section>" });
    expect(result.current.renders).toHaveLength(1);
    expect(result.current.renders[0].status).toBe("ready");
    vi.useRealTimers();
  });

  it("marks pages as error when the raster rejects", async () => {
    const d = doc(1);
    renderMock.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(({ doc }) => usePageRenders(doc, DEFAULT_SETTINGS), {
      initialProps: { doc: d },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.renders[0]).toMatchObject({ status: "error", error: "boom" });
    vi.useRealTimers();
  });
});
