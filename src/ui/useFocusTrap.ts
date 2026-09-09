import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap for modal dialogs (Phase 2 split of `PageModal.tsx`).
 * Remembers the opener, focuses the dialog, cycles Tab inside,
 * restores focus on close. Independently testable via jsdom.
 */
export function useFocusTrap(dialogRef: RefObject<HTMLDivElement | null>): void {
  const previousFocus = useRef<Element | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement;
    dialogRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onTab);
    return () => {
      dialog.removeEventListener("keydown", onTab);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [dialogRef]);
}
