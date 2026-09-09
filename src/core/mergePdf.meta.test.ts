import { describe, expect, it } from "vitest";
import { mergedFilename, moveItem, newPdfId } from "./mergePdf";

describe("mergePdf meta helpers", () => {
  it("names the combined download", () => {
    expect(mergedFilename()).toBe("combined.pdf");
  });

  it("mints unique ids", () => {
    const ids = new Set([newPdfId(), newPdfId(), newPdfId()]);
    expect(ids.size).toBe(3);
  });

  it("moveItem leaves the list alone for no-op moves", () => {
    expect(moveItem(["a"], 0, 0)).toEqual(["a"]);
    expect(moveItem([], 0, 1)).toEqual([]);
    expect(moveItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });
});
