import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canvasToDataUrl,
  canvasToDetailUrl,
  canvasToPreviewUrl,
  downscaleCanvas,
  reencodeImage,
} from "./canvas";

function fakeCanvas(width = 800, height = 600) {
  return {
    width,
    height,
    toDataURL: vi.fn((type: string, q: number) => `data:${type};q=${q}`),
  } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reencodeImage", () => {
  it("encodes JPEG at the given quality", () => {
    const c = fakeCanvas();
    expect(reencodeImage(c, 0.92)).toBe("data:image/jpeg;q=0.92");
  });

  it("clamps quality into 0.1..1", () => {
    expect(reencodeImage(fakeCanvas(), 0)).toBe("data:image/jpeg;q=0.1");
    expect(reencodeImage(fakeCanvas(), 99)).toBe("data:image/jpeg;q=1");
  });
});

describe("downscaleCanvas", () => {
  it("returns the canvas unchanged when it already fits", () => {
    const c = fakeCanvas(400, 300);
    expect(downscaleCanvas(c, 768)).toBe(c);
  });

  it("downscales wide canvases onto a white-backed canvas", () => {
    const src = fakeCanvas(2000, 1000);
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const small = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect, drawImage }) };
    vi.spyOn(document, "createElement").mockReturnValue(small as unknown as HTMLCanvasElement);
    const out = downscaleCanvas(src, 1000);
    expect(out).toBe(small);
    expect(small.width).toBe(1000);
    expect(small.height).toBe(500);
    expect(fillRect).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalled();
  });

  it("returns null when no 2d context is available", () => {
    const src = fakeCanvas(2000, 1000);
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    expect(downscaleCanvas(src, 500)).toBeNull();
  });
});

describe("canvasToDataUrl / preview / detail", () => {
  it("encodes small canvases as-is", () => {
    const c = fakeCanvas(400, 300);
    expect(canvasToDataUrl(c, 768, 0.85)).toBe("data:image/jpeg;q=0.85");
  });

  it("falls back to the original when downscale fails", () => {
    const c = fakeCanvas(2000, 1000);
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    expect(canvasToDataUrl(c, 500, 0.9)).toBe("data:image/jpeg;q=0.9");
  });

  it("preview defaults to 768px/q0.85 and detail to 1500px/q0.9", () => {
    const wide = fakeCanvas(3000, 2000);
    const drawImage = vi.fn();
    const small = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }),
      toDataURL: vi.fn(() => "data:small"),
    };
    vi.spyOn(document, "createElement").mockReturnValue(small as unknown as HTMLCanvasElement);
    expect(canvasToPreviewUrl(wide)).toBe("data:small");
    expect(small.width).toBe(768);
    expect(canvasToDetailUrl(wide)).toBe("data:small");
    expect(small.width).toBe(1500);
  });

  it("thumbnail and detail share pixels (same canvas source)", () => {
    const c = fakeCanvas(400, 300);
    // Same small canvas: both helpers encode the identical input.
    expect(canvasToPreviewUrl(c)).toBe(canvasToDetailUrl(c).replace("q=0.9", "q=0.85"));
  });
});
