import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearInlineCache,
  fetchAsDataUrl,
  fetchStylesheetText,
  fetchWithTimeout,
  inlineCssUrls,
  isRemoteUrl,
} from "./assets";

afterEach(() => {
  clearInlineCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isRemoteUrl", () => {
  it("matches http(s) and protocol-relative URLs", () => {
    expect(isRemoteUrl("https://cdn.example/a.png")).toBe(true);
    expect(isRemoteUrl("http://cdn.example/a.png")).toBe(true);
    expect(isRemoteUrl("//cdn.example/a.png")).toBe(true);
  });

  it("rejects relative, data and blob URLs", () => {
    expect(isRemoteUrl("assets/a.png")).toBe(false);
    expect(isRemoteUrl("data:image/png;base64,AAA")).toBe(false);
    expect(isRemoteUrl("blob:https://x")).toBe(false);
  });
});

describe("fetchWithTimeout", () => {
  it("aborts the fetch when the timeout elapses", async () => {
    const abort = vi.fn();
    const fakeSignal = {};
    vi.stubGlobal("AbortController", function (this: unknown) {
      return {
        signal: fakeSignal,
        abort,
      };
    } as unknown as typeof AbortController);
    const timers: number[] = [];
    vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, ms: number) => {
      timers.push(ms);
      fn();
      return 1;
    }) as unknown as typeof window.setTimeout);
    const clearSpy = vi.spyOn(window, "clearTimeout").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://cdn.example/a.png", 50);
    expect(abort).toHaveBeenCalled();
    expect(timers).toEqual([50]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example/a.png",
      expect.objectContaining({ mode: "cors", signal: fakeSignal }),
    );
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe("fetchAsDataUrl", () => {
  const blob = () => new Blob(["x"], { type: "image/png" });

  function stubFetchOk() {
    return vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => blob() }) as Response),
    );
  }

  it("resolves null on non-ok responses and on throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    await expect(fetchAsDataUrl("https://cdn.example/a.png")).resolves.toBeNull();
    clearInlineCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("CORS blocked");
      }),
    );
    await expect(fetchAsDataUrl("https://cdn.example/a.png")).resolves.toBeNull();
  });

  it("caches in-flight results (one fetch per URL)", async () => {
    stubFetchOk();
    const fetchMock = vi.mocked(fetch);
    const [a, b] = await Promise.all([
      fetchAsDataUrl("https://cdn.example/a.png"),
      fetchAsDataUrl("https://cdn.example/a.png"),
    ]);
    expect(a).toContain("data:image/png;base64,");
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves protocol-relative URLs against the page protocol", async () => {
    stubFetchOk();
    await fetchAsDataUrl("//cdn.example/a.png");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${window.location.protocol}//cdn.example/a.png`);
  });
});

describe("fetchStylesheetText", () => {
  it("returns text on success and null on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "p{color:red;}" }) as Response));
    await expect(fetchStylesheetText("https://cdn.example/a.css")).resolves.toBe("p{color:red;}");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    await expect(fetchStylesheetText("https://cdn.example/a.css")).resolves.toBeNull();
  });
});

describe("inlineCssUrls", () => {
  it("returns CSS untouched when there is nothing remote to inline", async () => {
    const css = "p{color:red;}a{background:url(assets/bg.jpg);}";
    await expect(inlineCssUrls(css)).resolves.toBe(css);
  });

  it("rewrites absolute and base-relative spellings via one mapping", async () => {
    const fontBlob = new Blob(["f"], { type: "font/woff2" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => fontBlob }) as Response),
    );
    const out = await inlineCssUrls(
      `a{background:url("https://cdn.example/fonts/g.woff2");}b{background:url(../fonts/g.woff2);}`,
      "https://cdn.example/css/fonts.css",
    );
    expect(out).not.toContain("g.woff2");
    expect(out.split("data:font/woff2;base64,").length - 1).toBe(2);
  });

  it("leaves relative urls alone without a resolvable base (and skips data/blob)", async () => {
    const css = `a{background:url(../fonts/g.woff2);}b{background:url("data:font/woff2;base64,AAA");}c{background:url(#frag);}`;
    await expect(inlineCssUrls(css)).resolves.toBe(css);
    await expect(inlineCssUrls(css, "not-a-url")).resolves.toBe(css);
  });

  it("leaves malformed relative urls alone even with a base", async () => {
    // A url that throws inside `new URL(u, base)` exercises the null branch.
    const css = `a{background:url("http://[invalid");}`;
    await expect(inlineCssUrls(css, "https://cdn.example/a.css")).resolves.toBe(css);
  });
});

describe("inlineExternalAssets srcset probing", () => {
  it("rewrites remote srcset entries to data URLs", async () => {
    const { inlineExternalAssets } = await import("./assets");
    const blob = new Blob(["x"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => blob }) as Response),
    );
    const out = await inlineExternalAssets({
      html: `<img srcset="https://cdn.example/a.png 1x, https://cdn.example/b.png 2x">`,
      styles: "",
    });
    expect(out.html).not.toContain("https://cdn.example/a.png");
    expect(out.html).not.toContain("https://cdn.example/b.png");
    expect(out.html.split("data:image/png;base64,").length - 1).toBe(2);
  });
});
