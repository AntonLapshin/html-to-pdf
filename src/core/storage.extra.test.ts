import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { addRecentFile, getRecentFiles, loadAutosave, RECENTS_KEY, saveAutosave } from "./storage";

describe("storage failure paths", () => {
  it("loadAutosave returns null on corrupt JSON", () => {
    localStorage.setItem("html-to-pdf:autosave:v1", "{not json");
    expect(loadAutosave()).toBeNull();
    localStorage.removeItem("html-to-pdf:autosave:v1");
  });

  it("getRecentFiles returns [] on corrupt JSON", () => {
    localStorage.setItem(RECENTS_KEY, "{not json");
    expect(getRecentFiles()).toEqual([]);
    localStorage.setItem(RECENTS_KEY, `"just a string"`);
    expect(getRecentFiles()).toEqual([]);
    localStorage.removeItem(RECENTS_KEY);
  });

  it("addRecentFile retries with a smaller list on quota errors", () => {
    const big = { name: "n", savedAt: "t", pageCount: 1, source: "s" };
    let calls = 0;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, ...args: [string, string]) {
      calls += 1;
      if (calls === 1) throw new DOMException("quota", "QuotaExceededError");
      return real.apply(this, args);
    });
    const next = addRecentFile(big);
    expect(next.length).toBeLessThanOrEqual(3);
    vi.restoreAllMocks();
  });

  it("saveAutosave survives a throwing store", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() =>
      saveAutosave({ filename: "a", source: "x", settings: DEFAULT_SETTINGS, savedAt: "" }),
    ).not.toThrow();
    vi.restoreAllMocks();
  });
});
