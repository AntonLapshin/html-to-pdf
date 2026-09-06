import { PageCard } from "../molecules/PageCard";

/** Organism: accurate preview grid — one card per PDF page. */
export function PreviewGrid({
  srcDocs,
  onExpand,
}: {
  srcDocs: string[];
  onExpand: (index: number) => void;
}) {
  if (srcDocs.length === 0) {
    return (
      <div className="bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Upload an HTML file with <code>.page</code> blocks to see the PDF preview.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {srcDocs.map((srcDoc, i) => (
        <PageCard key={i} index={i} srcDoc={srcDoc} onExpand={() => onExpand(i)} />
      ))}
    </div>
  );
}
