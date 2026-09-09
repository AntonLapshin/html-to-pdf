import { useEffect, useRef, useState } from "react";
import { parseHtmlPages, type ParsedDocument } from "../core/parseHtml";
import { deserializeProject, projectFilename, serializeProject } from "../core/project";
import { SAMPLES } from "../core/samples";
import { clampSettings, DEFAULT_SETTINGS, detectPageSize, extractPagePadding, type PdfSettings } from "../core/settings";
import { embedFontsInSource, embedImagesInSource } from "../core/embed";
import { downloadText, fetchSample, readFilesAsDataUrls } from "../core/fileHelpers";
import {
  addRecentFile,
  clearRecentFiles,
  getRecentFiles,
  loadAutosave,
  saveAutosave,
  type RecentFile,
} from "../core/storage";

/**
 * Project-source state extracted from `App.tsx` (Phase 2): file / sample /
 * paste / recent / autosave / settings workflows. `App.tsx` keeps composition
 * only; this hook owns every state transition.
 */
export function useProjectSource() {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("document.html");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PdfSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [recents, setRecents] = useState<RecentFile[]>(() => getRecentFiles());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const applySource = (nextSource: string, nextFilename: string, adoptDesign = true) => {
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
      // Reuse the file's own print design: page size (@page/.page geometry)
      // and margins (.page padding) become the defaults; the user can still
      // override everything in General settings afterwards.
      if (adoptDesign) {
        const size = detectPageSize(parsed.styles);
        const padding = extractPagePadding(parsed.styles);
        if (size || padding) {
          setSettings((prev) =>
            clampSettings({
              ...prev,
              ...(size ? { pageSize: size } : null),
              ...(padding ? { marginMode: "html" as const } : null),
            }),
          );
        }
      }
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

  // Restore last session once (autosaved source + settings).
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

  // Autosave source + settings to localStorage on every change.
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

  const onClearRecents = () => {
    clearRecentFiles();
    setRecents([]);
  };

  const onSaveProject = () => {
    if (!source) return;
    downloadText(serializeProject(source, filename, settings), projectFilename(filename), "application/json");
  };

  const attachFiles = async (files: FileList | null, kind: "fonts" | "images") => {
    if (!files || files.length === 0 || !source) return;
    try {
      const entries = await readFilesAsDataUrls(files);
      const embedder = kind === "fonts" ? embedFontsInSource : embedImagesInSource;
      const { source: embedded, matched } = embedder(source, entries);
      if (matched === 0) {
        setError(
          kind === "fonts"
            ? `None of the ${entries.length} font file(s) match a url(…) in ${filename}. ` +
                `Filenames must match the referenced basename (e.g. NotoSerif-Regular.ttf for url("_fonts/NotoSerif-Regular.ttf")).`
            : `None of the ${entries.length} image file(s) match an <img src> or url(…) in ${filename}. ` +
                `Filenames must match the referenced basename (e.g. cover-photo.jpg for src="cover-photo.jpg").`,
        );
        return;
      }
      setError(null);
      // Keep the user's current settings — only the embedded bytes change.
      applySource(embedded, filename, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : kind === "fonts" ? "Failed to embed fonts." : "Failed to embed images.");
    }
  };

  const onAttachFonts = (files: FileList | null) => void attachFiles(files, "fonts");
  const onAttachImages = (files: FileList | null) => void attachFiles(files, "images");

  const onLoadProjectFile = async (file: File) => {
    try {
      const loaded = deserializeProject(await file.text());
      setSettings(clampSettings(loaded.settings));
      // The project carries its own settings — don't re-adopt the HTML design.
      applySource(loaded.source, loaded.filename, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project.");
    }
  };

  return {
    doc,
    source,
    filename,
    error,
    setError,
    settings,
    setSettings,
    recents,
    lastSavedAt,
    applySource,
    onFile,
    onSample,
    onPasteHtml,
    onLoadRecent,
    onClearRecents,
    onSaveProject,
    onAttachFonts,
    onAttachImages,
    onLoadProjectFile,
  };
}
