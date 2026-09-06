interface Props {
  index: number;
  srcDoc: string;
  onExpand: () => void;
}

/** Molecule: one PDF page thumbnail — click expands. Showcase: `PageCard / Default`. */
export function PageCard({ index, srcDoc, onExpand }: Props) {
  return (
    <button
      onClick={onExpand}
      className="group overflow-hidden bg-white text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-400"
      title={`Expand page ${index + 1}`}
    >
      <div className="aspect-[210/297] w-full bg-white">
        <iframe
          title={`page-${index + 1}`}
          srcDoc={srcDoc}
          sandbox=""
          scrolling="no"
          className="pointer-events-none h-full w-full"
        />
      </div>
      <div className="border-t border-slate-100 px-2 py-1.5 text-xs text-slate-500 group-hover:text-indigo-600">
        Page {index + 1} — click to expand
      </div>
    </button>
  );
}
