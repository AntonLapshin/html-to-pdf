import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, downloadText, fetchSample, readFilesAsDataUrls } from "./fileHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchSample", () => {
  it("fetches bundled samples under BASE_URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<p>x</p>" }) as Response));
    await expect(fetchSample("slowliving-sample.html")).resolves.toBe("<p>x</p>");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining("sample/slowliving-sample.html"));
  });

  it("throws when the sample is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    await expect(fetchSample("nope.html")).rejects.toThrow(/not found/);
  });
});

describe("downloadText / downloadBlob", () => {
  it("triggers an anchor download and revokes the object URL", () => {
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("hello", "a.txt", "text/plain");
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    const a = document.querySelector("a");
    expect(a).toBeNull(); // removed after click
  });

  it("downloadBlob names the file", () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadBlob(new Blob(["%PDF"], { type: "application/pdf" }), "combined.pdf");
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalled();
  });
});

describe("readFilesAsDataUrls", () => {
  it("reads picked files as data URLs", async () => {
    const files = [new File(["abc"], "a.ttf", { type: "font/ttf" })];
    const out = await readFilesAsDataUrls(files);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("a.ttf");
    expect(out[0].dataUrl).toContain("data:");
  });

  it("rejects when the file cannot be read as a string", async () => {
    // A FileReader whose result is not a string (cannot happen for real
    // readAsDataURL, but guards the contract branch).
    const RealReader = globalThis.FileReader;
    class StringlessReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: ArrayBuffer | null = new ArrayBuffer(1);
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", StringlessReader);
    await expect(readFilesAsDataUrls([new File(["x"], "a.ttf")])).rejects.toThrow(/Could not read/);
    vi.stubGlobal("FileReader", RealReader);
  });
});
