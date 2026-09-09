import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadZone } from "./UploadZone";

const baseProps = () => ({
  onFile: vi.fn(),
  onSample: vi.fn(),
  onPasteHtml: vi.fn(),
  recents: [],
  onLoadRecent: vi.fn(),
  onClearRecents: vi.fn(),
});

describe("UploadZone", () => {
  it("loads pasted HTML containing .page blocks", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<UploadZone {...props} />);
    await user.click(screen.getByRole("button", { name: /Paste HTML/i }));
    const area = screen.getByLabelText(/.page blocks/i);
    await user.type(area, '<div class="page">hi</div>');
    await user.click(screen.getByRole("button", { name: /Load pasted HTML/i }));
    expect(props.onPasteHtml).toHaveBeenCalledWith('<div class="page">hi</div>', "pasted.html");
  });

  it("ignores empty paste submissions", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<UploadZone {...props} />);
    await user.click(screen.getByRole("button", { name: /Paste HTML/i }));
    expect(screen.getByRole("button", { name: /Load pasted HTML/i })).toBeDisabled();
    expect(props.onPasteHtml).not.toHaveBeenCalled();
  });

  it("forwards dropped files to onFile", () => {
    const props = baseProps();
    render(<UploadZone {...props} />);
    const zone = screen.getByRole("region", { name: /Upload HTML/i });
    const file = new File(["<div class=page></div>"], "guide.html", { type: "text/html" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(props.onFile).toHaveBeenCalledWith(file);
  });

  it("forwards picked files and reopens recents", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const recent = { name: "guide.html", savedAt: "t", pageCount: 3, source: "<p>x</p>" };
    render(<UploadZone {...props} recents={[recent]} />);
    await user.click(screen.getByRole("button", { name: /guide.html/i }));
    expect(props.onLoadRecent).toHaveBeenCalledWith(recent);

    const file = new File(["x"], "a.html", { type: "text/html" });
    const input = screen.getByLabelText(/Choose an HTML file/i) as HTMLInputElement;
    const { fireEvent: fire } = await import("@testing-library/react");
    fire.change(input, { target: { files: [file] } });
    expect(props.onFile).toHaveBeenCalledWith(file);
  });
});
