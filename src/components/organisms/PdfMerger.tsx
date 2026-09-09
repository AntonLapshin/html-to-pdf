import { useRef, useState } from "react";
import { formatBytes } from "../../core/pdfUtils";
import { usePdfMerger } from "../../ui/usePdfMerger";
import { Button } from "../atoms/Button";

/**
 * Organism: merge uploaded PDFs — pick files, drag & drop to reorder,
 * download one combined PDF (pages concatenated in list order).
 * Workflow state lives in `usePdfMerger`; this component is presentation
 * only (dropzone, list, buttons). Showcase: `PdfMerger / Default`.
 */
export function PdfMerger() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const m = usePdfMerger();

  return (
    <div className="space-y-4">
      <div
        role="region"
        aria-label="Upload PDFs to merge"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDraggingFiles(true);
          }
        }}
        onDragLeave={() => setDraggingFiles(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            setDraggingFiles(false);
            // Snapshot: DataTransfer FileLists can be cleared by the browser
            // once the drop completes, so copy before the async read.
            void m.addFiles(Array.from(e.dataTransfer.files));
          }
        }}
        className={`bg-white p-6 text-center shadow-sm ring-1 transition sm:p-8 ${
          draggingFiles
            ? "ring-2 ring-indigo-500 outline-dashed outline-indigo-300"
            : "ring-slate-200 outline-dashed outline-slate-300"
        } outline-2 outline-offset-[-8px]`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          aria-label="Choose PDF files to merge"
          onChange={(e) => {
            // Snapshot first: input.files is a live FileList — resetting
            // input.value empties it in place, silently dropping the pick.
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) void m.addFiles(files);
          }}
        />
        <p className="text-sm font-medium text-slate-700">
          {draggingFiles ? "Drop the PDFs to add them" : "Drag & drop PDF files here, or"}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={m.loading}>
            {m.loading ? "Reading…" : "Upload PDFs"}
          </Button>
          {m.entries.length > 0 && (
            <Button variant="ghost" onClick={m.clearAll}>
              Clear all
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Files are merged top-to-bottom. Drag a row to reorder — or use the ↑ ↓ buttons.
        </p>
      </div>

      <div aria-live="polite">
        {m.error && (
          <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {m.error}
          </div>
        )}
      </div>

      {m.entries.length === 0 ? (
        <div className="bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          No PDFs yet — upload two or more PDFs to combine them into one file.
        </div>
      ) : (
        <div className="bg-white shadow-sm ring-1 ring-slate-200">
          <ol aria-label="PDFs in merge order. Drag to reorder." className="divide-y divide-slate-100">
            {m.entries.map((entry, i) => (
              <li
                key={entry.id}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  setDropIndex(null);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragIndex !== null && i !== dropIndex) setDropIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  const from = raw ? Number.parseInt(raw, 10) : dragIndex;
                  if (Number.isInteger(from)) m.commitReorder(from as number, i);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                aria-label={`${entry.name}, ${entry.pageCount} pages, position ${i + 1} of ${m.entries.length}`}
                className={`flex cursor-grab items-center gap-3 px-4 py-3 transition active:cursor-grabbing ${
                  dropIndex === i ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : ""
                } ${dragIndex === i ? "opacity-50" : ""}`}
              >
                <span aria-hidden="true" className="shrink-0 cursor-grab text-slate-300 select-none" title="Drag to reorder">⋮⋮</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800" title={entry.name}>{entry.name}</span>
                  <span className="block text-xs text-slate-500">{entry.pageCount} page{entry.pageCount === 1 ? "" : "s"} · {formatBytes(entry.sizeBytes)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => m.commitReorder(i, i - 1)} disabled={i === 0} aria-label={`Move ${entry.name} up`} title="Move up"
                    className="px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-indigo-600">↑</button>
                  <button type="button" onClick={() => m.commitReorder(i, i + 1)} disabled={i === m.entries.length - 1} aria-label={`Move ${entry.name} down`} title="Move down"
                    className="px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-indigo-600">↓</button>
                  <button type="button" onClick={() => m.removeEntry(entry.id)} aria-label={`Remove ${entry.name}`} title="Remove"
                    className="px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-indigo-600">✕</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{m.entries.length} file{m.entries.length === 1 ? "" : "s"} · {m.totalPages} page{m.totalPages === 1 ? "" : "s"} total</p>
            <Button onClick={() => void m.onDownload()} disabled={m.entries.length === 0 || m.busy !== null}>
              {m.busy ?? "Download combined PDF"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
