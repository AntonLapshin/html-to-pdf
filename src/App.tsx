import { useMemo, useState } from "react";
import { AppHeader } from "./components/organisms/AppHeader";
import { PageModal } from "./components/organisms/PageModal";
import { PreviewGrid } from "./components/organisms/PreviewGrid";
import { SettingsPanel } from "./components/molecules/SettingsPanel";
import { UploadZone } from "./components/molecules/UploadZone";
import { buildPageSrcDoc, pageNumberText, parseHtmlPages, type ParsedDocument } from "./core/parseHtml";
import { generatePdf } from "./core/pdf";
import { DEFAULT_SETTINGS, type PdfSettings } from "./core/settings";
import { ShowcaseGallery } from "./ui/ShowcaseGallery";

async function loadSample(): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}sample/slowliving-sample.html`);
  if (!res.ok) throw new Error("Sample file not found");
  return res.text();
}

export default function App() {
  const isShowcase =
    new URLSearchParams(window.location.search).get("view") === "showcase" ||
    new URLSearchParams(window.location.search).get("file") !== null;

  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_SETTINGS);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const applySource = (source: string, filename: string) => {
    try {
      const parsed = parseHtmlPages(source);
      if (parsed.pages.length === 0) {
        setError(
          `No .page blocks found in ${filename}. Ask your agent to split the HTML into <div class="page">…</div> sections.`,
        );
        setDoc(null);
        return;
      }
      setError(null);
      setDoc(parsed);
      setExpanded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse HTML.");
      setDoc(null);
    }
  };

  const onFile = async (file: File) => {
    applySource(await file.text(), file.name);
  };

  const onSample = async () => {
    try {
      applySource(await loadSample(), "slowliving-sample.html");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample.");
    }
  };

  const srcDocs = useMemo(() => {
    if (!doc) return [];
    return doc.pages.map((p, i) =>
      buildPageSrcDoc(p, doc.styles, {
        marginMm: settings.marginMm,
        pageNumberText: pageNumberText(
          settings.showPageNumbers,
          settings.startPageNumber,
          i,
          doc.pages.length,
        ),
      }),
    );
  }, [doc, settings]);

  const onDownload = async () => {
    if (!doc) return;
    setBusy("Rendering…");
    try {
      await generatePdf(
        doc.pages.map((p) => ({ html: p.html, styles: doc.styles })),
        settings,
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <AppHeader
        pageCount={doc?.pages.length ?? 0}
        busy={busy}
        canDownload={!!doc && !busy}
        onDownload={onDownload}
      />
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <UploadZone onFile={onFile} onSample={onSample} />
          {error && (
            <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <PreviewGrid srcDocs={srcDocs} onExpand={setExpanded} />
        </section>
        <aside>
          <SettingsPanel settings={settings} onChange={setSettings} />
          <p className="mt-3 text-xs text-slate-400">
            Workflow: generate HTML with an agent (split into{" "}
            <code>.page</code> divs) → upload → tune margin/page numbers →
            preview → Download PDF.
          </p>
        </aside>
      </main>
      {expanded !== null && srcDocs[expanded] && (
        <PageModal
          index={expanded}
          total={srcDocs.length}
          srcDoc={srcDocs[expanded]}
          onClose={() => setExpanded(null)}
          onPrev={() => setExpanded((v) => (v !== null && v > 0 ? v - 1 : v))}
          onNext={() =>
            setExpanded((v) => (v !== null && v < srcDocs.length - 1 ? v + 1 : v))
          }
        />
      )}
    </div>
  );
}
