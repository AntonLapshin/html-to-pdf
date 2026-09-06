import type { RenderStatus } from "../../core/render";
import { pageAspectRatio, type PageSize } from "../../core/settings";

interface Props {
  index: number;
  previewUrl: string | null;
  status: RenderStatus;
  overflow: boolean;
  onExpand: () => void;
  pageSize?: PageSize;
}

/** Molecule: one PDF page thumbnail (canvas raster) — click expands. */
export function PageCard({ index, previewUrl, status, overflow, onExpand, pageSize = "a4" }: Props) {
  return (
    <button
      onClick={onExpand}
      aria-label={`Expand page ${index + 1} preview${overflow ? " (content overflows the page)" : ""}`}
      className="group relative block w-full overflow-hidden bg-white text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      title={`Expand page ${index + 1}`}
    >
      <div className="relative w-full bg-white" style={{ aspectRatio: pageAspectRatio(pageSize) }}>
        {status === "ready" && previewUrl ? (
          <img
            src={previewUrl}
            alt={`Page ${index + 1} preview`}
            className="h-full w-full object-fill"
            draggable={false}
          />
        ) : status === "error" ? (
          <div className="flex h-full w-full items-center justify-center bg-red-50 p-4 text-center text-xs text-red-600">
            Render failed — try lowering DPI or simplifying CSS.
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            Rendering…
          </div>
        )}
        {overflow && status === "ready" && (
          <span
            title="Content is taller than the usable page area and will be clipped in the PDF."
            className="absolute left-1 top-1 bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            ⚠ overflows
          </span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5 text-xs text-slate-500 group-hover:text-indigo-600">
        <span>Page {index + 1} — click to expand</span>
        <span
          className={
            status === "ready"
              ? "text-emerald-600"
              : status === "error"
                ? "text-red-600"
                : "text-slate-400"
          }
        >
          ●
        </span>
      </div>
    </button>
  );
}
