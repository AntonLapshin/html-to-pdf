/**
 * PDF-merge presentation helpers (Phase 2 split of `PdfMerger.tsx`).
 * Pure functions — unit tested in `pdfUtils.test.ts`.
 * `mergePdf.ts` re-exports `formatBytes` for backwards compatibility.
 */

/** True for files the merger accepts (MIME or `.pdf` extension). */
export function isPdfFile(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

/** Human-readable byte size (`0 B`, `1.5 KB`, …). Non-finite → `"0 B"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}
