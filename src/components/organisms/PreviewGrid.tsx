import type { PageSize } from "../../core/settings";
import type { PageRender } from "../../ui/usePageRenders";
import { PageCard } from "../molecules/PageCard";

/** Organism: accurate preview grid — one card per PDF page. */
export function PreviewGrid({
  renders,
  onExpand,
  pageSize = "a4",
}: {
  renders: PageRender[];
  onExpand: (index: number) => void;
  pageSize?: PageSize;
}) {
  if (renders.length === 0) {
    return (
      <div className="bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Upload an HTML file with <code>.page</code> blocks to see the PDF preview.
      </div>
    );
  }
  return (
    <div
      role="list"
      aria-label="PDF page previews. Activate a page to expand it."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {renders.map((r, i) => (
        <div key={i} role="listitem" className="min-w-0">
          <PageCard
            index={i}
            previewUrl={r.previewUrl}
            status={r.status}
            overflow={r.overflow}
            pageSize={pageSize}
            onExpand={() => onExpand(i)}
          />
        </div>
      ))}
    </div>
  );
}
