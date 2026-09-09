import { describe, expect, it, vi } from "vitest";
import { parseHtmlPages } from "./parseHtml";
import { getRecentFiles, loadAutosave, saveAutosave } from "./storage";
import { DEFAULT_SETTINGS } from "./settings";

describe("branch gap-fillers", () => {
  it("parseHtml tolerates stylesheet links without href", () => {
    const doc = parseHtmlPages(`<link rel="stylesheet"><div class="page"><p>x</p></div>`);
    expect(doc.links).toEqual([]);
    expect(doc.pages).toHaveLength(1);
  });

  it("storage degrades when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() =>
      saveAutosave({ filename: "a", source: "x", settings: DEFAULT_SETTINGS, savedAt: "" }),
    ).not.toThrow();
    expect(loadAutosave()).toBeNull();
    expect(getRecentFiles()).toEqual([]);
    vi.unstubAllGlobals();
  });
});
