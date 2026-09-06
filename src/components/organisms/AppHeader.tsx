import { Button } from "../atoms/Button";

/** Organism: top bar with title, page count, showcase link, download. */
export function AppHeader({
  pageCount,
  busy,
  canDownload,
  onDownload,
}: {
  pageCount: number;
  busy: string | null;
  canDownload: boolean;
  onDownload: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">html-to-pdf</h1>
          <p className="text-xs text-slate-500">
            {pageCount} page{pageCount === 1 ? "" : "s"} · each{" "}
            <code>.page</code> = one PDF page
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="?view=showcase"
            className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Showcases
          </a>
          <Button onClick={onDownload} disabled={!canDownload}>
            {busy ?? "Download PDF"}
          </Button>
        </div>
      </div>
    </header>
  );
}
