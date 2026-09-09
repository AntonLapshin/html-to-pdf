import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedDocument } from "../core/parseHtml";
import { canvasToDetailUrl, canvasToPreviewUrl } from "../core/canvas";
import { collectExternalRefsForPages, corsWarning } from "../core/refs";
import { measureOverflowAsync, renderPageCanvas } from "../core/raster";
import type { RenderStatus } from "../core/renderTypes";
import type { PdfSettings } from "../core/settings";

export interface PageRender {
  status: RenderStatus;
  previewUrl: string | null;
  /** Higher-res raster for the expanded modal (falls back to previewUrl). */
  detailUrl: string | null;
  overflow: boolean;
  error: string | null;
}

/**
 * Render every `.page` through the single raster pipeline (`renderPageCanvas`)
 * and expose downscaled previews + overflow flags + statuses.
 * Re-renders are debounced so margin/DPI sliders feel live.
 */
export function usePageRenders(
  doc: ParsedDocument | null,
  settings: PdfSettings,
): { renders: PageRender[]; corsNotice: string | null; rendering: boolean } {
  const [renders, setRenders] = useState<PageRender[]>([]);
  const [rendering, setRendering] = useState(false);
  const runId = useRef(0);

  const corsNotice = useMemo(() => {
    if (!doc || doc.pages.length === 0) return null;
    return corsWarning(
      collectExternalRefsForPages(
        doc.pages.map((p) => ({ html: p.html, styles: doc.styles, links: doc.links })),
      ),
    );
  }, [doc]);

  // Derive the pending state during render when inputs change (not in an
  // effect): each new doc/settings starts visibly pending before the
  // debounced raster run below fills results in.
  const [prevInputs, setPrevInputs] = useState({ doc, settings });
  if (prevInputs.doc !== doc || prevInputs.settings !== settings) {
    setPrevInputs({ doc, settings });
    if (doc) {
      setRenders(doc.pages.map(() => ({ status: "pending" as const, previewUrl: null, detailUrl: null, overflow: false, error: null })));
      setRendering(true);
    }
  }

  useEffect(() => {
    // No doc: derive empty state during render (see return below) instead of
    // syncing state here — the raster pipeline has nothing to run.
    if (!doc) return;
    const myRun = ++runId.current;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        for (let i = 0; i < doc.pages.length; i++) {
          if (cancelled || runId.current !== myRun) return;
          const page = doc.pages[i];
          try {
            const overflow = (
              await measureOverflowAsync(
                { html: page.html, styles: doc.styles, links: doc.links },
                settings,
                i,
                doc.pages.length,
              )
            ).overflows;
            const canvas = await renderPageCanvas(
              { html: page.html, styles: doc.styles, links: doc.links },
              settings,
              i,
              doc.pages.length,
            );
            if (cancelled || runId.current !== myRun) return;
            const previewUrl = canvasToPreviewUrl(canvas);
            const detailUrl = canvasToDetailUrl(canvas);
            setRenders((prev) => {
              const next = [...prev];
              next[i] = { status: "ready", previewUrl, detailUrl, overflow, error: null };
              return next;
            });
          } catch (e) {
            if (cancelled || runId.current !== myRun) return;
            setRenders((prev) => {
              const next = [...prev];
              next[i] = {
                status: "error",
                previewUrl: null,
                detailUrl: null,
                overflow: false,
                error: e instanceof Error ? e.message : "Render failed",
              };
              return next;
            });
          }
        }
        if (!cancelled && runId.current === myRun) setRendering(false);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc, settings]);

  // Without a doc there is nothing to render: report the empty state
  // directly instead of syncing it into state from the effect above.
  if (!doc) return { renders: [], corsNotice: null, rendering: false };
  return { renders, corsNotice, rendering };
}
