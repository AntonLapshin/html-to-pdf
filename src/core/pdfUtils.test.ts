import { describe, expect, it } from "vitest";
import { formatBytes, isPdfFile } from "./pdfUtils";

describe("formatBytes", () => {
  it("formats sub-KB values as bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats KB/MB with one decimal below 100", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("rounds to whole units at 100+", () => {
    expect(formatBytes(150 * 1024)).toBe("150 KB");
  });

  it("guards non-finite and negative input", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("isPdfFile", () => {
  const pdf = (name: string, type: string) => new File(["%PDF"], name, { type });
  it("accepts PDF MIME regardless of extension", () => {
    expect(isPdfFile(pdf("doc.bin", "application/pdf"))).toBe(true);
  });
  it("accepts .pdf extension regardless of MIME", () => {
    expect(isPdfFile(pdf("scan.pdf", "application/octet-stream"))).toBe(true);
  });
  it("rejects non-PDF files", () => {
    expect(isPdfFile(pdf("page.html", "text/html"))).toBe(false);
    expect(isPdfFile(pdf("img.png", "image/png"))).toBe(false);
  });
});
