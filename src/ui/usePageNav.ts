import { useCallback, useEffect } from "react";

/**
 * Page navigation for the expanded modal (Phase 2 split of `PageModal.tsx`):
 * ←/→/Esc keyboard handling. Returns stable `onPrev` / `onNext` callbacks.
 */
export function usePageNav(
  index: number,
  total: number,
  onSelect: (index: number) => void,
  onClose: () => void,
): { onPrev: () => void; onNext: () => void } {
  const onPrev = useCallback(() => {
    if (index > 0) onSelect(index - 1);
  }, [index, onSelect]);
  const onNext = useCallback(() => {
    if (index < total - 1) onSelect(index + 1);
  }, [index, total, onSelect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return { onPrev, onNext };
}
