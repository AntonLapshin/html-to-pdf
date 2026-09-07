/** pdf-lib is dynamically imported so the main bundle stays lean —
 *  the heavy merge code only loads when the Merge PDFs tab is used. */
async function loadPdfLib() {
  return import("pdf-lib");
}

async function loadReadablePdf(data: Uint8Array | ArrayBuffer) {
  const { PDFDocument } = await loadPdfLib();
  try {
    return await PDFDocument.load(data, { ignoreEncryption: true });
  } catch {
    throw new Error("One of the PDFs could not be read (corrupt or password-protected).");
  }
}

export interface PdfSourceMeta {
  /** Stable client-side id (for list keys + drag & drop). */
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
}

/** Reorder helper — moves element from `from` to `to` (clamped). Pure. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const clamped = Math.min(Math.max(0, to), next.length - 1);
  if (clamped === from) return next;
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

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

/** Page count of an in-memory PDF. Throws a friendly Error on invalid input. */
export async function getPdfPageCount(data: Uint8Array | ArrayBuffer): Promise<number> {
  const { PDFDocument } = await loadPdfLib();
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    throw new Error("That file is not a readable PDF (corrupt or password-protected).");
  }
}

/**
 * Combine PDFs in the given order — one output page per input page,
 * original page sizes preserved. Pure bytes in, bytes out.
 */
export async function mergePdfBytes(sources: (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error("Add at least one PDF to merge.");
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (const src of sources) {
    const doc = await loadReadablePdf(src);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** Default filename for the combined download. */
export function mergedFilename(): string {
  return "combined.pdf";
}

/** Create a stable-enough id without extra deps. */
export function newPdfId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return `pdf-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
