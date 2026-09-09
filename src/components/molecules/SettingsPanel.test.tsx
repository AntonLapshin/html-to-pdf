import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("clamps out-of-range changes before calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    // DPI slider: dispatch an over-max value; clampSettings brings it to 300.
    const dpi = screen.getByLabelText(/DPI/i);
    await user.click(dpi);
    (dpi as HTMLInputElement).focus();
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(dpi, { target: { value: "999" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dpi: 300 }));
  });

  it("toggles page numbers and switches page size", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    await user.click(screen.getByLabelText(/Show page numbers/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showPageNumbers: false }));

    const size = screen.getByLabelText(/Page size/i);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(size, { target: { value: "letter" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageSize: "letter" }));
  });

  it("shows the HTML-padding notice in html margin mode", () => {
    const { rerender } = render(
      <SettingsPanel
        settings={{ ...DEFAULT_SETTINGS, marginMode: "html" }}
        onChange={() => {}}
        htmlStyles=".page{padding:51pt 51pt 0 51pt;}"
      />,
    );
    expect(screen.getByText(/Using the file's .page padding/i)).toBeInTheDocument();
    rerender(
      <SettingsPanel settings={{ ...DEFAULT_SETTINGS, marginMode: "html" }} onChange={() => {}} htmlStyles="" />,
    );
    expect(screen.getByText(/no .page padding/i)).toBeInTheDocument();
  });
});
