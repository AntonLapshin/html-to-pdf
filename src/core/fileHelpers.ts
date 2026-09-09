/**
 * File/Sample IO helpers extracted from `App.tsx` (Phase 2).
 * Pure DOM IO — no React, independently testable where jsdom allows.
 */

/** Fetch a bundled sample HTML file by name. Throws when missing. */
export async function fetchSample(file: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}sample/${file}`);
  if (!res.ok) throw new Error(`Sample file ${file} not found`);
  return res.text();
}

/** Trigger a browser download of in-memory text. */
export function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  downloadBlob(blob, filename);
}

/** Trigger a browser download of a Blob (PDF merge output, exports). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface NamedDataUrl {
  name: string;
  dataUrl: string;
}

/**
 * Read picked files as `data:` URLs (single helper behind the font + image
 * attach paths, which previously duplicated this FileReader loop inline).
 */
export function readFilesAsDataUrls(files: FileList | File[]): Promise<NamedDataUrl[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<NamedDataUrl>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve({ name: f.name, dataUrl: reader.result })
              : reject(new Error(`Could not read ${f.name}.`));
          reader.onerror = () => reject(new Error(`Could not read ${f.name}.`));
          reader.readAsDataURL(f);
        }),
    ),
  );
}
