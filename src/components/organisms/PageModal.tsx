import { useCallback, useEffect, useState } from "react";
import type { PageRender } from "../../ui/usePageRenders";
import { Button } from "../atoms/Button";
import { Slider } from "../atoms/Slider";

/**
 * Organism: expanded page view. Zoom 50–200%, keyboard ←/→/Esc,
 * thumbnail strip, per-page render status. Shows the same canvas raster
 * as the grid (preview pixels == PDF pixels); falls back to a crisp
 * vector iframe when `srcDoc` is provided.
 */
export function PageModal({
  index,
  renders,
  srcDoc,
  onClose,
  onSelect,
}: {
  index: number;
  renders: PageRender[];
  srcDoc?: string | null;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const total = renders.length;
  const [zoom, setZoom] = useState(100);
  const current = renders[index];

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

  // Focus trap-lite: focus the dialog on mount for keyboard users.
  useEffect(() => {
    document.getElementById("page-modal-dialog")?.focus();
  }, [index]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        id="page-modal-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Page ${index + 1} of ${total}`}
        className="flex max-h-full w-full max-w-4xl flex-col bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <span className="text-sm text-slate-600">
            Page {index + 1} of {total}
            {current && (
              <span
                className={`ml-2 text-xs ${
                  current.status === "ready"
                    ? "text-emerald-600"
                    : current.status === "error"
                      ? "text-red-600"
                      : "text-slate-400"
                }`}
              >
                ● {current.status}
                {current.overflow ? " · ⚠ overflows page" : ""}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onPrev} disabled={index === 0}>
              ← Prev
            </Button>
            <Button variant="secondary" onClick={onNext} disabled={index === total - 1}>
              Next →
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close (Esc)
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2">
          <div className="w-48">
            <Slider label="Zoom" value={zoom} min={50} max={200} step={10} unit="%" onChange={setZoom} />
          </div>
          <span className="text-xs text-slate-400">←/→ to navigate</span>
        </div>
        <div className="overflow-auto bg-slate-200 p-4">
          <div
            className="mx-auto aspect-[210/297] bg-white shadow"
            style={{ width: `${zoom}%`, maxWidth: "100%" }}
          >
            {current?.status === "ready" && current.previewUrl ? (
              <img
                src={current.previewUrl}
                alt={`Page ${index + 1} full preview`}
                className="h-full w-full object-fill"
                draggable={false}
              />
            ) : current?.status === "error" ? (
              <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-red-600">
                Render failed{current.error ? `: ${current.error}` : "."} Try lowering DPI.
              </div>
            ) : srcDoc ? (
              <iframe title={`expanded-page-${index + 1}`} srcDoc={srcDoc} sandbox="" className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                Rendering…
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2">
          {renders.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              title={`Go to page ${i + 1} (${r.status})`}
              className={`relative h-16 w-11 shrink-0 overflow-hidden ring-2 ${
                i === index ? "ring-indigo-600" : "ring-slate-200 hover:ring-indigo-300"
              }`}
            >
              {r.previewUrl ? (
                <img src={r.previewUrl} alt="" className="h-full w-full object-fill" draggable={false} />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400">
                  {r.status}
                </span>
              )}
              {r.overflow && <span className="absolute left-0 top-0 bg-amber-500 px-1 text-[9px] text-white">⚠</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
