import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  addRecentFile,
  AUTOSAVE_KEY,
  clearAutosave,
  clearRecentFiles,
  getRecentFiles,
  loadAutosave,
  MAX_RECENTS,
  RECENTS_KEY,
  saveAutosave,
} from "./storage";

beforeEach(() => {
  localStorage.removeItem(AUTOSAVE_KEY);
  localStorage.removeItem(RECENTS_KEY);
});

describe("autosave", () => {
  it("round-trips source + settings through localStorage", () => {
    saveAutosave({
      filename: "guide.html",
      source: `<div class="page">a</div>`,
      settings: { ...DEFAULT_SETTINGS, marginMm: 20 },
      savedAt: new Date().toISOString(),
    });
    const loaded = loadAutosave();
    expect(loaded?.filename).toBe("guide.html");
    expect(loaded?.source).toContain('class="page"');
    expect(loaded?.settings.marginMm).toBe(20);
  });

  it("returns null when nothing is saved and clears on demand", () => {
    expect(loadAutosave()).toBeNull();
    saveAutosave({
      filename: "a.html",
      source: "x",
      settings: DEFAULT_SETTINGS,
      savedAt: "",
    });
    clearAutosave();
    expect(loadAutosave()).toBeNull();
  });

  it("skips huge sources instead of blowing the quota", () => {
    saveAutosave({
      filename: "big.html",
      source: "x".repeat(2_000_000),
      settings: DEFAULT_SETTINGS,
      savedAt: "",
    });
    expect(loadAutosave()).toBeNull();
  });
});

describe("recent files", () => {
  it("adds entries newest-first and caps the list", () => {
    for (let i = 0; i < MAX_RECENTS + 3; i++) {
      addRecentFile({
        name: `file-${i}.html`,
        savedAt: new Date().toISOString(),
        pageCount: 1,
        source: `<div class="page">${i}</div>`,
      });
    }
    const recents = getRecentFiles();
    expect(recents).toHaveLength(MAX_RECENTS);
    expect(recents[0].name).toBe(`file-${MAX_RECENTS + 2}.html`);
  });

  it("dedupes re-opened files to the front", () => {
    addRecentFile({ name: "a.html", savedAt: "", pageCount: 1, source: "A" });
    addRecentFile({ name: "b.html", savedAt: "", pageCount: 1, source: "B" });
    addRecentFile({ name: "a.html", savedAt: "", pageCount: 1, source: "A" });
    const recents = getRecentFiles();
    expect(recents).toHaveLength(2);
    expect(recents[0].name).toBe("a.html");
  });

  it("clears on demand and tolerates corrupt data", () => {
    addRecentFile({ name: "a.html", savedAt: "", pageCount: 1, source: "A" });
    clearRecentFiles();
    expect(getRecentFiles()).toEqual([]);
    localStorage.setItem(RECENTS_KEY, "corrupt{{{");
    expect(getRecentFiles()).toEqual([]);
  });
});
