import { useRef, useState } from "react";
import type { RecentFile } from "../../core/storage";
import { Button } from "../atoms/Button";

interface Props {
  onFile: (file: File) => void;
  onSample: () => void;
  onPasteHtml: (source: string, filename: string) => void;
  recents: RecentFile[];
  onLoadRecent: (entry: RecentFile) => void;
  onClearRecents: () => void;
}

/**
 * Molecule: HTML upload — click, drag-and-drop, paste-HTML, recent history.
 * Showcase: `UploadZone / Default`.
 */
export function UploadZone({ onFile, onSample, onPasteHtml, recents, onLoadRecent, onClearRecents }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const submitPaste = () => {
    if (!pasteText.trim()) return;
    onPasteHtml(pasteText, "pasted.html");
    setPasteText("");
    setPasting(false);
  };

  return (
    <div
      role="region"
      aria-label="Upload HTML"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`bg-white p-6 text-center shadow-sm ring-1 transition sm:p-8 ${
        dragging ? "ring-2 ring-indigo-500 outline-dashed outline-indigo-300" : "ring-slate-200 outline-dashed outline-slate-300"
      } outline-2 outline-offset-[-8px]`}
    >
      <input
        ref={ref}
        type="file"
        accept=".html,text/html"
        className="hidden"
        aria-label="Choose an HTML file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <p className="text-sm font-medium text-slate-700">
        {dragging ? "Drop the HTML file to load it" : "Drag & drop an HTML file here, or"}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => ref.current?.click()}>Upload HTML</Button>
        <Button variant="secondary" onClick={onSample}>
          Load sample
        </Button>
        <Button variant="ghost" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
          {pasting ? "Hide paste" : "Paste HTML"}
        </Button>
      </div>
      {pasting && (
        <div className="mt-4 text-left">
          <label htmlFor="paste-html" className="text-xs font-medium text-slate-600">
            Paste raw HTML containing <code>.page</code> blocks
          </label>
          <textarea
            id="paste-html"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder='<div class="page">…</div>'
            className="mt-1 w-full border border-slate-300 p-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-indigo-600"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setPasteText(""); setPasting(false); }}>
              Cancel
            </Button>
            <Button onClick={submitPaste} disabled={!pasteText.trim()}>
              Load pasted HTML
            </Button>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Each <code>.page</code> block becomes exactly one PDF page.
      </p>
      {recents.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-left">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500">Recent files</h3>
            <button
              onClick={onClearRecents}
              className="text-xs text-slate-400 underline hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Clear
            </button>
          </div>
          <ul className="mt-1 space-y-1">
            {recents.map((r) => (
              <li key={`${r.name}:${r.savedAt}`}>
                <button
                  onClick={() => onLoadRecent(r)}
                  className="w-full truncate px-2 py-1 text-left text-xs text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
                  title={`Re-open ${r.name} (${r.pageCount} pages)`}
                >
                  {r.name} · {r.pageCount} page{r.pageCount === 1 ? "" : "s"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
