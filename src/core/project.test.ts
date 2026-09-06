import { describe, expect, it } from "vitest";
import { deserializeProject, projectFilename, serializeProject } from "./project";
import { DEFAULT_SETTINGS } from "./settings";

describe("serializeProject / deserializeProject", () => {
  it("round-trips source, filename and settings", () => {
    const json = serializeProject("<div class=\"page\">a</div>", "guide.html", {
      ...DEFAULT_SETTINGS,
      marginMm: 15,
    });
    const loaded = deserializeProject(json);
    expect(loaded.filename).toBe("guide.html");
    expect(loaded.source).toContain('class="page"');
    expect(loaded.settings.marginMm).toBe(15);
    expect(loaded.savedAt).not.toBe("");
  });

  it("clamps settings on load", () => {
    const json = serializeProject("x", "y.html", { ...DEFAULT_SETTINGS, dpi: 72 });
    const tampered = JSON.stringify({ ...JSON.parse(json), settings: { dpi: 9999 } });
    expect(deserializeProject(tampered).settings.dpi).toBe(300);
  });

  it("rejects invalid JSON", () => {
    expect(() => deserializeProject("not json")).toThrow("not valid JSON");
  });

  it("rejects non-project files and wrong versions", () => {
    expect(() => deserializeProject(JSON.stringify({ app: "other", version: 1 }))).toThrow(
      "not an html-to-pdf project",
    );
    expect(() =>
      deserializeProject(
        JSON.stringify({ app: "html-to-pdf", version: 99, source: "x" }),
      ),
    ).toThrow("Unsupported project version");
  });

  it("rejects projects without source", () => {
    expect(() =>
      deserializeProject(JSON.stringify({ app: "html-to-pdf", version: 1, source: "" })),
    ).toThrow("no HTML source");
  });
});

describe("projectFilename", () => {
  it("swaps .html for .html-to-pdf.json", () => {
    expect(projectFilename("guide.html")).toBe("guide.html-to-pdf.json");
    expect(projectFilename("guide.HTML")).toBe("guide.html-to-pdf.json");
  });

  it("falls back to document for blank names", () => {
    expect(projectFilename("   ")).toBe("document.html-to-pdf.json");
  });
});
