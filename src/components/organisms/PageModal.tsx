import { useEffect, useRef, useState } from "react";
import type { PageSize } from "../../core/settings";
import { useFocusTrap } from "../../ui/useFocusTrap";
import { usePageNav } from "../../ui/usePageNav";
import type { PageRender } from "../../ui/usePageRenders";
import { Button } from "../atoms/Button";
import { Slider } from "../atoms/Slider";
import { PageRenderView } from "./PageRenderView";

/**
 * Organism: expanded page view. Zoom 50–300%, keyboard ←/→/Esc, thumbnail
 * strip, per-page status. Focus trap (`useFocusTrap`), key nav
 * (`usePageNav`) and the raster/vector view (`PageRenderView`) are split out
 * so each is independently testable.
 */
export function PageModal({
  index,
  renders,
  srcDoc,
  onClose,
  onSelect,
  pageSize = "a4",
}: {
  index: number;
  renders: PageRender[];
  srcDoc?: string | null;
  onClose: () => void;
  onSelect: (index: number) => void;
  pageSize?: PageSize;
}) {
  const total = renders.length;
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<"crisp" | "pixels">("pixels");
  const current = renders[index];
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset zoom when switching pages; stay on exact PDF pixels by default
  // (render-time adjustment, not effects — no set-state-in-effect warnings).
  const [prevPage, setPrevPage] = useState({ index, srcDoc });
  if (prevPage.index !== index || prevPage.srcDoc !== srcDoc) {
    if (prevPage.index !== index) setZoom(100);
    setMode("pixels");
    setPrevPage({ index, srcDoc });
  }

  const { onPrev, onNext } = usePageNav(index, total, onSelect, onClose);
  useFocusTrap(dialogRef);

  // Re-focus the dialog when the page changes so ←/→ keep working.
  useEffect(() => {
    dialogRef.current?.focus();
  }, [index]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4" onClick={onClose} role="presentation">
      <div ref={dialogRef} id="page-modal-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Page ${index + 1} of ${total}`}
        className="flex max-h-full w-full max-w-4xl flex-col bg-white shadow-xl outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <span className="text-sm text-slate-600">Page {index + 1} of {total}
            {current && <span className={`ml-2 text-xs ${current.status === "ready" ? "text-emerald-600" : current.status === "error" ? "text-red-600" : "text-slate-400"}`}>● {current.status}{current.overflow ? " · ⚠ overflows page" : ""}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onPrev} disabled={index === 0}>← Prev</Button>
            <Button variant="secondary" onClick={onNext} disabled={index === total - 1}>Next →</Button>
            <Button variant="secondary" onClick={onClose}>Close (Esc)</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2">
          <div className="w-48"><Slider label="Zoom" value={zoom} min={50} max={300} step={10} unit="%" onChange={setZoom} /></div>
          {srcDoc && (
            <div className="flex overflow-hidden rounded border border-slate-300 text-xs" role="group" aria-label="Preview mode">
              <button type="button" onClick={() => setMode("crisp")} aria-pressed={mode === "crisp"} className={`px-2.5 py-1.5 font-medium ${mode === "crisp" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Crisp</button>
              <button type="button" onClick={() => setMode("pixels")} aria-pressed={mode === "pixels"} title="Exact raster pixels embedded in the PDF" className={`px-2.5 py-1.5 font-medium ${mode === "pixels" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>PDF pixels</button>
            </div>
          )}
          <span className="text-xs text-slate-400">←/→ to navigate</span>
        </div>
        <PageRenderView index={index} current={current} srcDoc={srcDoc} mode={mode} zoom={zoom} pageSize={pageSize} />
        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2" role="listbox" aria-label="Pages">
          {renders.map((r, i) => (
            <button key={i} role="option" aria-selected={i === index} aria-label={`Go to page ${i + 1} (${r.status})`} onClick={() => onSelect(i)} title={`Go to page ${i + 1} (${r.status})`}
              className={`relative h-16 w-11 shrink-0 overflow-hidden ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${i === index ? "ring-indigo-600" : "ring-slate-200 hover:ring-indigo-300"}`}>
              {r.previewUrl ? <img src={r.previewUrl} alt="" className="h-full w-full object-fill" draggable={false} /> : <span className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400">{r.status}</span>}
              {r.overflow && <span className="absolute left-0 top-0 bg-amber-500 px-1 text-[9px] text-white">⚠</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
