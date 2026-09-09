import { useState } from "react";
import {
  getPdfPageCount,
  mergedFilename,
  mergePdfBytes,
  moveItem,
  newPdfId,
} from "../core/mergePdf";
import { isPdfFile } from "../core/pdfUtils";
import { downloadBlob } from "../core/fileHelpers";

export interface PdfEntry {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  bytes: Uint8Array;
}

/**
 * Merge workflow state extracted from `PdfMerger.tsx` (Phase 2): file
 * loading, reorder, merge + download. The component keeps presentation only
 * (dropzone, list, buttons); this hook owns every state transition and is
 * independently testable with mocked `core/mergePdf`.
 */
export function usePdfMerger() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(isPdfFile);
    if (list.length === 0) {
      setError("Only PDF files (.pdf) can be merged — pick one or more PDFs.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const loaded: PdfEntry[] = [];
      for (const f of list) {
        const buf = new Uint8Array(await f.arrayBuffer());
        try {
          const pageCount = await getPdfPageCount(buf);
          loaded.push({ id: newPdfId(), name: f.name, sizeBytes: f.size, pageCount, bytes: buf });
        } catch (e) {
          setError(e instanceof Error ? `${f.name}: ${e.message}` : `${f.name} could not be read as a PDF.`);
        }
      }
      if (loaded.length > 0) setEntries((prev) => [...prev, ...loaded]);
    } finally {
      setLoading(false);
    }
  };

  const commitReorder = (from: number, to: number) => {
    setEntries((prev) => moveItem(prev, from, to));
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAll = () => setEntries([]);

  const onDownload = async () => {
    if (entries.length === 0 || busy) return;
    setBusy("Merging…");
    setError(null);
    try {
      const merged = await mergePdfBytes(entries.map((e) => e.bytes));
      // Copy into a fresh ArrayBuffer-backed Uint8Array: pdf-lib may return
      // a view over a larger pooled buffer, and Blob rejects shared views.
      const bytes = new Uint8Array(merged.length);
      bytes.set(merged);
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), mergedFilename());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merging failed.");
    } finally {
      setBusy(null);
    }
  };

  const totalPages = entries.reduce((n, e) => n + e.pageCount, 0);

  return {
    entries,
    loading,
    busy,
    error,
    totalPages,
    addFiles,
    commitReorder,
    removeEntry,
    clearAll,
    onDownload,
  };
}
