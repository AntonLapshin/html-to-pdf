import { useMemo, useState } from "react";
import { AppHeader } from "./components/organisms/AppHeader";
import { PageModal } from "./components/organisms/PageModal";
import { PdfMerger } from "./components/organisms/PdfMerger";
import { PreviewGrid } from "./components/organisms/PreviewGrid";
import { ProjectBar } from "./components/molecules/ProjectBar";
import { SamplesGallery } from "./components/molecules/SamplesGallery";
import { SettingsPanel } from "./components/molecules/SettingsPanel";
import { UploadZone } from "./components/molecules/UploadZone";
import { buildPageSrcDoc, effectiveMargins, pageNumberText } from "./core/parseHtml";
import { generatePdf } from "./core/pdf";
import { clampSettings, extractPagePadding } from "./core/settings";
import { collectExternalRefsForPages } from "./core/refs";
import { ShowcaseGallery } from "./ui/ShowcaseGallery";
import { usePageRenders } from "./ui/usePageRenders";
import { useProjectSource } from "./ui/useProjectSource";

/**
 * Composition root (Phase 2): all project-source state lives in
 * `useProjectSource`; this component wires header / tabs / preview /
 * settings / modal together and owns only UI-local state
 * (`expanded`, `busy`, `mode`).
 */
export default function App() {
  const isShowcase =
    new URLSearchParams(window.location.search).get("view") === "showcase" ||
    new URLSearchParams(window.location.search).get("file") !== null;
  const p = useProjectSource();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"html" | "merge">("html");
  const { renders, corsNotice, rendering } = usePageRenders(p.doc, p.settings);

  const refs = useMemo(
    () =>
      p.doc
        ? collectExternalRefsForPages(p.doc.pages.map((pg) => ({ html: pg.html, styles: p.doc!.styles, links: p.doc!.links })))
        : null,
    [p.doc],
  );
  const htmlDesignNote = useMemo(() => {
    if (!p.doc || p.settings.marginMode !== "html") return null;
    const pad = extractPagePadding(p.doc.styles);
    if (!pad) return null;
    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    return `Using margins from HTML (.page padding → ${fmt(pad.top)}/${fmt(pad.right)}/${fmt(pad.bottom)}/${fmt(pad.left)} mm) — override anytime in General settings.`;
  }, [p.doc, p.settings.marginMode]);
  const expandedSrcDoc = useMemo(() => {
    if (!p.doc || expanded === null || !p.doc.pages[expanded]) return null;
    const s = clampSettings(p.settings);
    return buildPageSrcDoc(p.doc.pages[expanded], p.doc.styles, {
      marginsMm: effectiveMargins(s, p.doc.styles),
      pageNumberText: pageNumberText(s.showPageNumbers, s.startPageNumber, expanded, p.doc.pages.length),
      numberPosition: s.numberPosition,
      pageSize: s.pageSize,
      links: p.doc.links,
    });
  }, [p.doc, expanded, p.settings]);

  const onDownload = async () => {
    if (!p.doc) return;
    setBusy("Rendering…");
    try {
      await generatePdf(
        p.doc.pages.map((pg) => ({ html: pg.html, styles: p.doc!.styles, links: p.doc!.links })),
        clampSettings(p.settings),
        (done, total) => setBusy(`Rendering ${done}/${total}…`),
      );
    } catch (e) {
      p.setError(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setBusy(null);
    }
  };

  if (isShowcase) return <div className="min-h-screen bg-slate-100"><ShowcaseGallery /></div>;
  const overflowCount = renders.filter((r) => r.overflow && r.status === "ready").length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:ring-2 focus:ring-indigo-600">
        Skip to content
      </a>
      <AppHeader
        pageCount={p.doc?.pages.length ?? 0}
        busy={mode === "merge" ? null : (busy ?? (rendering ? "Rendering previews…" : null))}
        canDownload={mode === "html" && !!p.doc && !busy}
        onDownload={onDownload}
        subtitle={mode === "merge" ? "Upload PDFs · drag to reorder · download combined" : undefined}
      />
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6" role="tablist" aria-label="Tool mode">
          {(["html", "merge"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-indigo-600 ${mode === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}>
              {id === "html" ? "HTML → PDF" : "Merge PDFs"}
            </button>
          ))}
        </div>
      </div>
      {mode === "merge" ? (
        <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <PdfMerger />
        </main>
      ) : (
        <main id="main-content" className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
          <section className="min-w-0 space-y-6" aria-label="Document and preview">
            <UploadZone onFile={p.onFile} onSample={() => p.onSample()} onPasteHtml={p.onPasteHtml}
              recents={p.recents} onLoadRecent={p.onLoadRecent} onClearRecents={p.onClearRecents} />
            <div aria-live="polite" className="space-y-3">
              {p.filename && p.doc && (
                <p className="text-xs text-slate-500">Open: <span className="font-medium text-slate-700">{p.filename}</span> · autosaved to this browser.</p>
              )}
              {p.error && <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{p.error}</div>}
              {htmlDesignNote && <div className="border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">{htmlDesignNote}</div>}
              {corsNotice && (
                <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{corsNotice}</p>
                  {(refs?.localImages.length ?? 0) > 0 && (
                    <p className="mt-2"><label className="cursor-pointer font-medium text-amber-900 underline hover:text-amber-950">Attach images…<input type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.bmp" multiple className="hidden" aria-label="Attach local image files" onChange={(e) => { void p.onAttachImages(e.target.files); e.target.value = ""; }} /></label> — pick the referenced images to bake in as data: URLs.</p>
                  )}
                  {(refs?.localFonts.length ?? 0) > 0 && (
                    <p className="mt-2"><label className="cursor-pointer font-medium text-amber-900 underline hover:text-amber-950">Attach font files…<input type="file" accept=".ttf,.otf,.woff,.woff2,.eot" multiple className="hidden" aria-label="Attach local font files" onChange={(e) => { void p.onAttachFonts(e.target.files); e.target.value = ""; }} /></label> — pick the referenced fonts to bake in as data: URLs.</p>
                  )}
                </div>
              )}
              {overflowCount > 0 && (
                <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {overflowCount} page{overflowCount === 1 ? "" : "s"} taller than the usable {p.settings.pageSize.toUpperCase()} area at current margins — content will be clipped in the PDF.
                </div>
              )}
            </div>
            <PreviewGrid renders={renders} onExpand={setExpanded} pageSize={p.settings.pageSize} />
          </section>
          <aside className="min-w-0 space-y-4" aria-label="Settings and project">
            <SettingsPanel settings={p.settings} onChange={p.setSettings} htmlStyles={p.doc?.styles} />
            <ProjectBar hasDoc={!!p.source} lastSavedAt={p.lastSavedAt} onSave={p.onSaveProject} onLoadFile={p.onLoadProjectFile} />
            <SamplesGallery onSelect={(f) => p.onSample(f)} activeFile={null} />
            <p className="text-xs text-slate-400">Workflow: generate HTML with an agent (split into <code>.page</code> divs) → upload, paste, or pick a sample → tune size/margins/numbers/DPI → preview (same raster as PDF) → Download PDF.</p>
          </aside>
        </main>
      )}
      {expanded !== null && mode === "html" && renders[expanded] && (
        <PageModal index={expanded} renders={renders} srcDoc={expandedSrcDoc} pageSize={p.settings.pageSize} onClose={() => setExpanded(null)} onSelect={setExpanded} />
      )}
    </div>
  );
}
