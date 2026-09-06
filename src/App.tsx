import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/organisms/AppHeader";
import { PageModal } from "./components/organisms/PageModal";
import { PreviewGrid } from "./components/organisms/PreviewGrid";
import { ProjectBar } from "./components/molecules/ProjectBar";
import { SamplesGallery } from "./components/molecules/SamplesGallery";
import { SettingsPanel } from "./components/molecules/SettingsPanel";
import { UploadZone } from "./components/molecules/UploadZone";
import { buildPageSrcDoc, effectiveMargins, pageNumberText, parseHtmlPages, type ParsedDocument } from "./core/parseHtml";
import { generatePdf } from "./core/pdf";
import { deserializeProject, projectFilename, serializeProject } from "./core/project";
import { SAMPLES } from "./core/samples";
import { clampSettings, DEFAULT_SETTINGS, type PdfSettings } from "./core/settings";
import {
  addRecentFile,
  clearRecentFiles,
  getRecentFiles,
  loadAutosave,
  saveAutosave,
  type RecentFile,
} from "./core/storage";
import { ShowcaseGallery } from "./ui/ShowcaseGallery";
import { usePageRenders } from "./ui/usePageRenders";

async function fetchSample(file: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}sample/${file}`);
  if (!res.ok) throw new Error(`Sample file ${file} not found`);
  return res.text();
}

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const isShowcase =
    new URLSearchParams(window.location.search).get("view") === "showcase" ||
    new URLSearchParams(window.location.search).get("file") !== null;

  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("document.html");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_SETTINGS);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentFile[]>(() => getRecentFiles());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const { renders, corsNotice, rendering } = usePageRenders(doc, settings);

  const applySource = (nextSource: string, nextFilename: string) => {
    try {
      const parsed = parseHtmlPages(nextSource);
      if (parsed.pages.length === 0) {
        setError(
          `No .page blocks found in ${nextFilename}. Ask your agent to split the HTML into <div class="page">…</div> sections.`,
        );
        setDoc(null);
        return;
      }
      setError(null);
      setDoc(parsed);
      setSource(nextSource);
      setFilename(nextFilename);
      setExpanded(null);
      setRecents(
        addRecentFile({
          name: nextFilename,
          savedAt: new Date().toISOString(),
          pageCount: parsed.pages.length,
          source: nextSource,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse HTML.");
      setDoc(null);
    }
  };

  // Phase 3: restore last session once (autosaved source + settings).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const auto = loadAutosave();
    if (auto) {
      try {
        const parsed = parseHtmlPages(auto.source);
        if (parsed.pages.length > 0) {
          setDoc(parsed);
          setSource(auto.source);
          setFilename(auto.filename);
          setSettings(clampSettings(auto.settings));
          setLastSavedAt(auto.savedAt);
        }
      } catch {
        // Corrupt autosave — start fresh.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 3: autosave source + settings to localStorage on every change.
  useEffect(() => {
    if (!source) return;
    const timer = window.setTimeout(() => {
      saveAutosave({ filename, source, settings, savedAt: new Date().toISOString() });
      setLastSavedAt(new Date().toISOString());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [source, settings, filename]);

  const onFile = async (file: File) => {
    applySource(await file.text(), file.name);
  };

  const onSample = async (file = SAMPLES[0].file) => {
    try {
      applySource(await fetchSample(file), file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample.");
    }
  };

  const onPasteHtml = (pasted: string, name: string) => {
    applySource(pasted, name);
  };

  const onLoadRecent = (entry: RecentFile) => {
    applySource(entry.source, entry.name);
  };

  const onSaveProject = () => {
    if (!source) return;
    downloadText(serializeProject(source, filename, settings), projectFilename(filename), "application/json");
  };

  const onLoadProjectFile = async (file: File) => {
    try {
      const loaded = deserializeProject(await file.text());
      setSettings(clampSettings(loaded.settings));
      applySource(loaded.source, loaded.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project.");
    }
  };

  // Crisp vector fallback for the expanded modal (same margins/numbers as raster).
  const expandedSrcDoc = useMemo(() => {
    if (!doc || expanded === null || !doc.pages[expanded]) return null;
    const s = clampSettings(settings);
    return buildPageSrcDoc(doc.pages[expanded], doc.styles, {
      marginsMm: effectiveMargins(s),
      pageNumberText: pageNumberText(
        s.showPageNumbers,
        s.startPageNumber,
        expanded,
        doc.pages.length,
      ),
      numberPosition: s.numberPosition,
      pageSize: s.pageSize,
      links: doc.links,
    });
  }, [doc, expanded, settings]);

  const onDownload = async () => {
    if (!doc) return;
    setBusy("Rendering…");
    try {
      await generatePdf(
        doc.pages.map((p) => ({ html: p.html, styles: doc.styles, links: doc.links })),
        clampSettings(settings),
        (done, total) => setBusy(`Rendering ${done}/${total}…`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setBusy(null);
    }
  };

  if (isShowcase) {
    return (
      <div className="min-h-screen bg-slate-100">
        <ShowcaseGallery />
      </div>
    );
  }

  const overflowCount = renders.filter((r) => r.overflow && r.status === "ready").length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:ring-2 focus:ring-indigo-600"
      >
        Skip to content
      </a>
      <AppHeader
        pageCount={doc?.pages.length ?? 0}
        busy={busy ?? (rendering ? "Rendering previews…" : null)}
        canDownload={!!doc && !busy}
        onDownload={onDownload}
      />
      <main id="main-content" className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-6" aria-label="Document and preview">
          <UploadZone
            onFile={onFile}
            onSample={() => onSample()}
            onPasteHtml={onPasteHtml}
            recents={recents}
            onLoadRecent={onLoadRecent}
            onClearRecents={() => {
              clearRecentFiles();
              setRecents([]);
            }}
          />
          <div aria-live="polite" className="space-y-3">
            {filename && doc && (
              <p className="text-xs text-slate-500">
                Open: <span className="font-medium text-slate-700">{filename}</span> · autosaved to this browser.
              </p>
            )}
            {error && (
              <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {corsNotice && (
              <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {corsNotice}
              </div>
            )}
            {overflowCount > 0 && (
              <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {overflowCount} page{overflowCount === 1 ? "" : "s"} taller than the usable{" "}
                {settings.pageSize.toUpperCase()} area at current margins — content will be clipped
                in the PDF. Reduce content or increase page height by lowering margins.
              </div>
            )}
          </div>
          <PreviewGrid renders={renders} onExpand={setExpanded} pageSize={settings.pageSize} />
        </section>
        <aside className="min-w-0 space-y-4" aria-label="Settings and project">
          <SettingsPanel settings={settings} onChange={setSettings} />
          <ProjectBar
            hasDoc={!!source}
            lastSavedAt={lastSavedAt}
            onSave={onSaveProject}
            onLoadFile={onLoadProjectFile}
          />
          <SamplesGallery onSelect={(f) => onSample(f)} activeFile={null} />
          <p className="text-xs text-slate-400">
            Workflow: generate HTML with an agent (split into{" "}
            <code>.page</code> divs) → upload, paste, or pick a sample → tune size/margins/numbers/DPI →
            preview (same raster as PDF) → Download PDF.
          </p>
        </aside>
      </main>
      {expanded !== null && renders[expanded] && (
        <PageModal
          index={expanded}
          renders={renders}
          srcDoc={expandedSrcDoc}
          pageSize={settings.pageSize}
          onClose={() => setExpanded(null)}
          onSelect={setExpanded}
        />
      )}
    </div>
  );
}
