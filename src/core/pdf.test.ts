import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";

type AnyMock = Mock<(...args: unknown[]) => unknown>;

const { renderPageCanvasMock, reencodeMock, instances } = vi.hoisted(() => {
  const renderPageCanvasMock: AnyMock = vi.fn();
  const reencodeMock: AnyMock = vi.fn(() => "data:image/jpeg;base64,FAKE");
  const instances: { addPage: AnyMock; addImage: AnyMock; save: AnyMock }[] = [];
  return { renderPageCanvasMock, reencodeMock, instances };
});

vi.mock("./raster", () => ({ renderPageCanvas: renderPageCanvasMock }));
vi.mock("./canvas", () => ({ reencodeImage: reencodeMock }));
vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function (this: unknown, _opts: unknown) {
    const inst = { addPage: vi.fn(), addImage: vi.fn(), save: vi.fn() };
    instances.push(inst);
    return inst;
  }),
}));

import { jsPDF } from "jspdf";
import { generatePdf } from "./pdf";

const pages = [
  { html: "<p>one</p>", styles: "p{color:red;}" },
  { html: "<p>two</p>", styles: "" },
  { html: "<p>three</p>", styles: "", links: ["https://cdn.example/x.css"] },
];

beforeEach(() => {
  instances.length = 0;
  renderPageCanvasMock.mockReset();
  reencodeMock.mockClear();
  vi.mocked(jsPDF).mockClear();
  renderPageCanvasMock.mockImplementation(async () => ({}) as HTMLCanvasElement);
});

describe("generatePdf (main output path)", () => {
  it("renders one PDF page per .page with N/total overlay wiring", async () => {
    const onProgress: [number, number][] = [];
    await generatePdf(pages, DEFAULT_SETTINGS, (d, t) => onProgress.push([d, t]), "out.pdf");

    // Overlay wiring: (page, settings, index, total) per page.
    expect(renderPageCanvasMock).toHaveBeenCalledTimes(3);
    expect(renderPageCanvasMock).toHaveBeenNthCalledWith(1, pages[0], DEFAULT_SETTINGS, 0, 3);
    expect(renderPageCanvasMock).toHaveBeenNthCalledWith(2, pages[1], DEFAULT_SETTINGS, 1, 3);
    expect(renderPageCanvasMock).toHaveBeenNthCalledWith(3, pages[2], DEFAULT_SETTINGS, 2, 3);
    expect(onProgress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("uses A4 geometry full-bleed and saves with the given filename", async () => {
    await generatePdf(pages, DEFAULT_SETTINGS, undefined, "guide.pdf");
    const doc = instances[0];
    expect(doc.addPage).toHaveBeenCalledTimes(2); // first page is implicit
    expect(doc.addImage).toHaveBeenCalledTimes(3);
    for (const call of doc.addImage.mock.calls) {
      expect(call[0]).toBe("data:image/jpeg;base64,FAKE");
      expect(call[1]).toBe("JPEG");
      expect(call.slice(2, 6)).toEqual([0, 0, 210, 297]);
    }
    expect(doc.save).toHaveBeenCalledWith("guide.pdf");
    // Portrait, mm, compressed A4.
    expect(vi.mocked(jsPDF)).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: "portrait", unit: "mm", format: "a4", compress: true }),
    );
  });

  it("uses Letter dimensions when configured", async () => {
    await generatePdf([pages[0]], { ...DEFAULT_SETTINGS, pageSize: "letter" });
    const doc = instances[0];
    expect(vi.mocked(jsPDF)).toHaveBeenCalledWith(
      expect.objectContaining({ format: [215.9, 279.4] }),
    );
    expect(doc.addImage).toHaveBeenCalledTimes(1);
    expect(doc.addImage.mock.calls[0].slice(2, 6)).toEqual([0, 0, 215.9, 279.4]);
    expect(doc.addPage).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalledWith("document.pdf");
  });

  it("re-encodes every canvas at the configured quality", async () => {
    await generatePdf(pages, { ...DEFAULT_SETTINGS, quality: 0.5 });
    expect(reencodeMock).toHaveBeenCalledTimes(3);
    for (const call of reencodeMock.mock.calls) expect(call[1]).toBe(0.5);
  });

  it("saves an (empty) document when there are no pages", async () => {
    await generatePdf([], DEFAULT_SETTINGS);
    expect(renderPageCanvasMock).not.toHaveBeenCalled();
    expect(instances[0].save).toHaveBeenCalledWith("document.pdf");
  });
});
