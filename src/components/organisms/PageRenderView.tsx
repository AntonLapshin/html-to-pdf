import type { PageSize } from "../../core/settings";
import { pageAspectRatio } from "../../core/settings";
import type { PageRender } from "../../ui/usePageRenders";

/**
 * Raster/vector page view for the expanded modal (Phase 2 split of
 * `PageModal.tsx`). Defaults to the exact raster ("PDF pixels") embedded in
 * the PDF; "Crisp" is the optional vector view (same margins/numbers).
 */
export function PageRenderView({
  index,
  current,
  srcDoc,
  mode,
  zoom,
  pageSize,
}: {
  index: number;
  current: PageRender | undefined;
  srcDoc?: string | null;
  mode: "crisp" | "pixels";
  zoom: number;
  pageSize: PageSize;
}) {
  const rasterSrc = current?.detailUrl ?? current?.previewUrl ?? null;
  const showVector = mode === "crisp" && !!srcDoc;
  return (
    <div className="overflow-auto bg-slate-200 p-4">
      <div
        className="mx-auto bg-white shadow"
        style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "100%" : "none", aspectRatio: pageAspectRatio(pageSize) }}
      >
        {showVector ? (
          <iframe title={`expanded-page-${index + 1}`} srcDoc={srcDoc} sandbox="" className="h-full w-full bg-white" />
        ) : current?.status === "ready" && rasterSrc ? (
          <img src={rasterSrc} alt={`Page ${index + 1} full preview`} className="h-full w-full object-fill" draggable={false} />
        ) : current?.status === "error" ? (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-red-600">
            Render failed{current.error ? `: ${current.error}` : "."} Try lowering DPI.
          </div>
        ) : srcDoc ? (
          <iframe title={`expanded-page-${index + 1}`} srcDoc={srcDoc} sandbox="" className="h-full w-full bg-white" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">Rendering…</div>
        )}
      </div>
    </div>
  );
}
