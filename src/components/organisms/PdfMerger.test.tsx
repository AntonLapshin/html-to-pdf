import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    commitReorder: vi.fn(),
    removeEntry: vi.fn(),
    clearAll: vi.fn(),
    addFiles: vi.fn(),
    onDownload: vi.fn(),
  },
}));

vi.mock("../../ui/usePdfMerger", () => ({
  usePdfMerger: () => ({
    entries: [
      { id: "a", name: "a.pdf", sizeBytes: 1000, pageCount: 2, bytes: new Uint8Array([1]) },
      { id: "b", name: "b.pdf", sizeBytes: 2000, pageCount: 1, bytes: new Uint8Array([2]) },
      { id: "c", name: "c.pdf", sizeBytes: 3000, pageCount: 4, bytes: new Uint8Array([3]) },
    ],
    loading: false,
    busy: null,
    error: null,
    totalPages: 7,
    ...state,
  }),
}));

import { PdfMerger } from "./PdfMerger";

describe("PdfMerger reorder", () => {
  it("moves rows with the ↑ ↓ buttons and removes with ✕", async () => {
    const user = userEvent.setup();
    render(<PdfMerger />);
    await user.click(screen.getByRole("button", { name: /Move b.pdf down/i }));
    expect(state.commitReorder).toHaveBeenCalledWith(1, 2);
    await user.click(screen.getByRole("button", { name: /Move b.pdf up/i }));
    expect(state.commitReorder).toHaveBeenCalledWith(1, 0);
    await user.click(screen.getByRole("button", { name: /Remove c.pdf/i }));
    expect(state.removeEntry).toHaveBeenCalledWith("c");
  });

  it("disables ↑ on the first row and ↓ on the last", () => {
    render(<PdfMerger />);
    expect(screen.getByRole("button", { name: /Move a.pdf up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Move c.pdf down/i })).toBeDisabled();
  });

  it("shows totals in merge order", () => {
    render(<PdfMerger />);
    expect(document.body.textContent).toMatch(/3 files/);
    expect(document.body.textContent).toMatch(/7 pages total/);
  });
});
