import type { PageRender } from "../../ui/usePageRenders";
import { PageCard } from "../molecules/PageCard";

/** Organism: accurate preview grid — one card per PDF page. */
export function PreviewGrid({
  renders,
  onExpand,
}: {
  renders: PageRender[];
  onExpand: (index: number) => void;
}) {
  if (renders.length === 0) {
    return (
      <div className="bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Upload an HTML file with <code>.page</code> blocks to see the PDF preview.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {renders.map((r, i) => (
        <PageCard
          key={i}
          index={i}
          previewUrl={r.previewUrl}
          status={r.status}
          overflow={r.overflow}
          onExpand={() => onExpand(i)}
        />
      ))}
    </div>
  );
}
