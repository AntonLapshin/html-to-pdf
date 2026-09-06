import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedDocument } from "../core/parseHtml";
import {
  canvasToPreviewUrl,
  collectExternalRefs,
  corsWarning,
  measureOverflow,
  renderPageCanvas,
  type RenderStatus,
} from "../core/render";
import type { PdfSettings } from "../core/settings";

export interface PageRender {
  status: RenderStatus;
  previewUrl: string | null;
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
    return corsWarning(collectExternalRefs({ html: doc.pages[0].html, styles: doc.styles }));
  }, [doc]);

  useEffect(() => {
    if (!doc) {
      setRenders([]);
      setRendering(false);
      return;
    }
    const myRun = ++runId.current;
    setRendering(true);
    setRenders(doc.pages.map(() => ({ status: "pending" as const, previewUrl: null, overflow: false, error: null })));

    const timer = window.setTimeout(() => {
      void (async () => {
        for (let i = 0; i < doc.pages.length; i++) {
          if (runId.current !== myRun) return;
          const page = doc.pages[i];
          try {
            const overflow = measureOverflow(
              { html: page.html, styles: doc.styles },
              settings,
              i,
              doc.pages.length,
            ).overflows;
            const canvas = await renderPageCanvas(
              { html: page.html, styles: doc.styles },
              settings,
              i,
              doc.pages.length,
            );
            if (runId.current !== myRun) return;
            const previewUrl = canvasToPreviewUrl(canvas);
            setRenders((prev) => {
              const next = [...prev];
              next[i] = { status: "ready", previewUrl, overflow, error: null };
              return next;
            });
          } catch (e) {
            if (runId.current !== myRun) return;
            setRenders((prev) => {
              const next = [...prev];
              next[i] = {
                status: "error",
                previewUrl: null,
                overflow: false,
                error: e instanceof Error ? e.message : "Render failed",
              };
              return next;
            });
          }
        }
        if (runId.current === myRun) setRendering(false);
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      if (runId.current === myRun) setRendering(false);
    };
  }, [doc, settings]);

  return { renders, corsNotice, rendering };
}
