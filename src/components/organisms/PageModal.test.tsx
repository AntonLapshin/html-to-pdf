import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PageRender } from "../../ui/usePageRenders";
import { PageModal } from "./PageModal";

const renders: PageRender[] = [
  { status: "ready", previewUrl: "p0", detailUrl: "d0", overflow: false, error: null },
  { status: "ready", previewUrl: "p1", detailUrl: "d1", overflow: true, error: null },
  { status: "pending", previewUrl: null, detailUrl: null, overflow: false, error: null },
];

const base = { renders, onClose: vi.fn(), onSelect: vi.fn() };

describe("PageModal key nav", () => {
  it("moves with ArrowLeft/ArrowRight and closes with Escape", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<PageModal index={1} renders={renders} onClose={onClose} onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenCalledWith(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(<PageModal index={0} {...base} />);
    expect(screen.getByRole("button", { name: /Prev/i })).toBeDisabled();
    rerender(<PageModal index={2} {...base} />);
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("navigates via the thumbnail strip and flags overflow", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageModal index={1} renders={renders} onClose={vi.fn()} onSelect={onSelect} />);
    expect(screen.getByText(/overflows page/i)).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Go to page 3/i }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("ignores out-of-range keys and unrelated key presses", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { unmount } = render(<PageModal index={0} renders={renders} onClose={onClose} onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    render(<PageModal index={2} renders={renders} onClose={onClose} onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
