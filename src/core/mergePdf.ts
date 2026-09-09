/** pdf-lib is dynamically imported so the main bundle stays lean —
 *  the heavy merge code only loads when the Merge PDFs tab is used. */
async function loadPdfLib() {
  return import("pdf-lib");
}

// Single source of truth lives in `pdfUtils.ts` (Phase 2); re-exported here
// so existing `mergePdf` imports keep working.
export { formatBytes } from "./pdfUtils";

/**
 * Copy input into a fresh zero-offset Uint8Array so the parser always sees
 * exactly these bytes. Views over a larger/shared buffer (subarray, pooled
 * Blob parts) carry a nonzero byteOffset that a parser may ignore, which
 * would misparse one file as a fragment of another — pages collapsing onto
 * each other instead of concatenating.
 */
function toFreshBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.length);
    copy.set(data);
    return copy;
  }
  return new Uint8Array(data.slice(0));
}

async function loadReadablePdf(data: Uint8Array | ArrayBuffer, label: string) {
  const { PDFDocument } = await loadPdfLib();
  try {
    return await PDFDocument.load(toFreshBytes(data), { ignoreEncryption: true });
  } catch {
    throw new Error(`${label} could not be read (corrupt or password-protected).`);
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

export async function getPdfPageCount(data: Uint8Array | ArrayBuffer): Promise<number> {
  const { PDFDocument } = await loadPdfLib();
  try {
    const doc = await PDFDocument.load(toFreshBytes(data), { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    throw new Error("That file is not a readable PDF (corrupt or password-protected).");
  }
}

/**
 * Combine PDFs in the given order — one output page per input page,
 * original page sizes preserved. Pure bytes in, bytes out.
 *
 * No-overlap guarantee: each source page is copied onto its own fresh
 * output page (`copyPages` + `addPage`, never drawing two sources onto one
 * page), and afterwards the output page count is asserted to equal the sum
 * of the input page counts — any collapse/overlap fails loudly instead of
 * producing a silently short document.
 */
export async function mergePdfBytes(sources: (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error("Add at least one PDF to merge.");
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  let expectedPages = 0;
  for (let i = 0; i < sources.length; i++) {
    const doc = await loadReadablePdf(sources[i], `PDF #${i + 1}`);
    const indices = doc.getPageIndices();
    expectedPages += indices.length;
    const pages = await out.copyPages(doc, indices);
    for (const p of pages) out.addPage(p);
  }
  const actualPages = out.getPageCount();
  if (actualPages !== expectedPages) {
    throw new Error(
      `Merge failed integrity check: expected ${expectedPages} pages but got ${actualPages} (pages must never overlap).`,
    );
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
