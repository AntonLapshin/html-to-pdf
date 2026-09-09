import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function Dialog() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} tabIndex={-1} data-testid="dialog">
      <button>First</button>
      <button>Second</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the dialog, cycles Tab inside and restores focus", () => {
    const opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Dialog />);
    expect(document.activeElement?.getAttribute("data-testid")).toBe("dialog");

    const dialog = screen.getByTestId("dialog");
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    second.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(second);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("ignores non-Tab keys", () => {
    render(<Dialog />);
    const dialog = screen.getByTestId("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("dialog");
  });

  it("handles dialogs with no tabbable items and skips disabled ones", () => {
    function Empty() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref);
      return (
        <div ref={ref} tabIndex={-1} data-testid="empty">
          <button disabled>Cannot</button>
          <span>text</span>
        </div>
      );
    }
    render(<Empty />);
    const dialog = screen.getByTestId("empty");
    // Only a disabled button: treated as no items → Tab is swallowed.
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("empty");
  });

  it("no-ops when the dialog ref is never attached", () => {
    function Detached() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref);
      return <p>no dialog here</p>;
    }
    expect(() => render(<Detached />)).not.toThrow();
  });
});
