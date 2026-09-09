import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";

const { toCanvasMock, html2canvasMock } = vi.hoisted(() => ({
  toCanvasMock: vi.fn(),
  html2canvasMock: vi.fn(),
}));

vi.mock("html-to-image", () => ({ toCanvas: toCanvasMock }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { RasterError } from "./errors";
import { renderPageCanvas, waitForHolderAssets, withTimeout } from "./raster";

function primaryCanvas(tainted = false) {
  return {
    getContext: () => ({
      getImageData: tainted
        ? vi.fn(() => {
            throw new Error("tainted");
          })
        : vi.fn(() => ({})),
    }),
  } as unknown as HTMLCanvasElement;
}

const page = { html: "<p>raster me</p>", styles: "p{color:black;}" };

describe("renderPageCanvas orchestration (engines mocked, holder real)", () => {
  it("embeds the primary canvas at the DPI-derived scale", async () => {
    const canvas = primaryCanvas();
    toCanvasMock.mockResolvedValueOnce(canvas);
    const out = await renderPageCanvas(page, DEFAULT_SETTINGS, 0, 1);
    expect(out).toBe(canvas);
    expect(toCanvasMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ pixelRatio: 2, cacheBust: false }),
    );
    document.body.innerHTML = "";
  });

  it("falls back to html2canvas when the primary canvas is tainted", async () => {
    toCanvasMock.mockResolvedValueOnce(primaryCanvas(true));
    const fallback = primaryCanvas();
    html2canvasMock.mockResolvedValueOnce(fallback);
    const out = await renderPageCanvas(page, DEFAULT_SETTINGS, 1, 3);
    expect(out).toBe(fallback);
    expect(html2canvasMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ useCORS: true, logging: false }),
    );
    document.body.innerHTML = "";
  });

  it("raises a typed RasterError chaining both causes when everything fails", async () => {
    toCanvasMock.mockRejectedValueOnce(new Error("primary down"));
    html2canvasMock.mockRejectedValueOnce(new Error("fallback down"));
    await expect(renderPageCanvas(page, DEFAULT_SETTINGS, 2, 3)).rejects.toMatchObject({
      name: "RasterError",
      pageIndex: 2,
    });
    try {
      await renderPageCanvas(page, DEFAULT_SETTINGS, 2, 3);
    } catch (e) {
      expect(e).toBeInstanceOf(RasterError);
      expect((e as Error).message).toContain("page 3");
    }
    document.body.innerHTML = "";
  });

  it("leaves no staging nodes behind", async () => {
    toCanvasMock.mockResolvedValueOnce(primaryCanvas());
    await renderPageCanvas(page, DEFAULT_SETTINGS, 0, 1);
    expect(document.body.innerHTML).toBe("");
  });
});

describe("waitForHolderAssets image branches", () => {
  it("awaits decodable images and tolerates decode failures", async () => {
    const holder = document.createElement("div");
    holder.innerHTML = `<img id="a"><img id="b"><img id="c">`;
    const [a, b, c] = Array.from(holder.querySelectorAll("img"));
    Object.defineProperty(a, "decode", { value: async () => {}, configurable: true });
    Object.defineProperty(b, "decode", {
      value: async () => {
        throw new Error("bad image");
      },
      configurable: true,
    });
    Object.defineProperty(c, "complete", { value: true, configurable: true });
    await expect(waitForHolderAssets(holder, 1000)).resolves.toBeUndefined();
  });

  it("resolves via the timeout when images never load", async () => {
    const holder = document.createElement("div");
    holder.innerHTML = `<img id="late">`;
    await expect(waitForHolderAssets(holder, 20)).resolves.toBeUndefined();
  });
});

describe("withTimeout", () => {
  it("resolves with the task value", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("rejects with the task error", async () => {
    await expect(withTimeout(Promise.reject(new Error("nope")), 1000)).rejects.toThrow("nope");
  });

  it("rejects after the timeout when the task hangs", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 50);
    const assertion = expect(pending).rejects.toThrow(/timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });
});
