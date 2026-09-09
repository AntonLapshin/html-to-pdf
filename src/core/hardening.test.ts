import { describe, expect, it } from "vitest";
import { AssetInlineError, err, ok, RasterError, RasterTimeoutError } from "./errors";
import { clampSettings, DEFAULT_SETTINGS } from "./settings";

describe("typed errors", () => {
  it("AssetInlineError carries the url and cause", () => {
    const cause = new Error("net down");
    const e = new AssetInlineError("https://x/y.css", undefined, { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AssetInlineError");
    expect(e.url).toBe("https://x/y.css");
    expect(e.cause).toBe(cause);
  });

  it("RasterError carries the page index and cause", () => {
    const cause = new Error("tainted");
    const e = new RasterError(2, undefined, { cause });
    expect(e.name).toBe("RasterError");
    expect(e.pageIndex).toBe(2);
    expect(e.cause).toBe(cause);
    expect(e.message).toContain("page 3");
  });

  it("RasterTimeoutError reports ms and page", () => {
    const e = new RasterTimeoutError(0, 25000);
    expect(e).toBeInstanceOf(RasterError);
    expect(e.name).toBe("RasterTimeoutError");
    expect(e.timeoutMs).toBe(25000);
    expect(e.message).toContain("25000ms");
  });

  it("Result helpers discriminate ok/err", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    const e = new AssetInlineError("u");
    expect(err(e)).toEqual({ ok: false, error: e });
  });
});

describe("DEFAULT_SETTINGS freeze", () => {
  it("is frozen (deep: marginsMm too)", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.marginsMm)).toBe(true);
  });
});

describe("clampSettings properties", () => {
  const valid = () => ({ ...DEFAULT_SETTINGS, marginsMm: { ...DEFAULT_SETTINGS.marginsMm } });

  it("is idempotent", () => {
    expect(clampSettings(clampSettings(valid()))).toEqual(clampSettings(valid()));
  });

  it("never mutates its input", () => {
    const input = { ...valid(), marginMm: 99, dpi: 999 };
    const marginsRef = input.marginsMm;
    clampSettings(input);
    expect(input.marginMm).toBe(99);
    expect(input.marginsMm).toBe(marginsRef);
  });

  it("clamps every numeric range", () => {
    const out = clampSettings({
      ...valid(),
      marginMm: 999,
      marginsMm: { top: -5, right: 500, bottom: NaN, left: Infinity },
      dpi: 1,
      quality: 50,
      startPageNumber: -3,
    });
    expect(out.marginMm).toBe(40);
    // Non-finite inputs fall back to the range floor (lo), not the ceiling.
    expect(out.marginsMm).toEqual({ top: 0, right: 40, bottom: 0, left: 0 });
    expect(out.dpi).toBe(72);
    expect(out.quality).toBe(1);
    expect(out.startPageNumber).toBe(1);
  });

  it("recovers invalid marginMode and floors dpi/quality", () => {
    const out = clampSettings({
      ...valid(),
      marginMode: "sideways" as never,
      dpi: 192.7,
      quality: 0.05,
      startPageNumber: 2.9,
    });
    expect(out.marginMode).toBe("uniform");
    expect(out.dpi).toBe(193);
    expect(out.quality).toBe(0.1);
    expect(out.startPageNumber).toBe(2);
  });

  it("accepts frozen DEFAULT_SETTINGS as input", () => {
    expect(() => clampSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(clampSettings(DEFAULT_SETTINGS)).toEqual({ ...DEFAULT_SETTINGS, marginsMm: { ...DEFAULT_SETTINGS.marginsMm } });
  });
});
