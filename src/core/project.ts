import { clampSettings, DEFAULT_SETTINGS, type PdfSettings } from "./settings";

export const PROJECT_VERSION = 1;

/** Serializable project file (port of book's saveProject/loadProject). */
export interface SavedProject {
  app: "html-to-pdf";
  version: number;
  savedAt: string;
  filename: string;
  /** Raw uploaded HTML source (re-parsed into `.page` blocks on load). */
  source: string;
  settings: PdfSettings;
}

export interface LoadedProject {
  filename: string;
  source: string;
  settings: PdfSettings;
  savedAt: string;
}

/** Serialize a project to a JSON string for download. */
export function serializeProject(
  source: string,
  filename: string,
  settings: PdfSettings,
): string {
  const project: SavedProject = {
    app: "html-to-pdf",
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    filename,
    source,
    settings: clampSettings(settings),
  };
  return JSON.stringify(project);
}

/** Parse + validate a project JSON string. Throws a friendly Error on failure. */
export function deserializeProject(json: string): LoadedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That project file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("That project file has an unexpected shape.");
  }
  const p = raw as Record<string, unknown>;
  if (p["app"] !== "html-to-pdf") {
    throw new Error("That file is not an html-to-pdf project (missing app marker).");
  }
  if (p["version"] !== PROJECT_VERSION) {
    throw new Error(
      `Unsupported project version ${String(p["version"])} (expected ${PROJECT_VERSION}).`,
    );
  }
  if (typeof p["source"] !== "string" || p["source"].length === 0) {
    throw new Error("That project file has no HTML source to restore.");
  }
  const filename = typeof p["filename"] === "string" && p["filename"] ? p["filename"] : "restored.html";
  const savedAt = typeof p["savedAt"] === "string" ? p["savedAt"] : new Date().toISOString();
  let settings = DEFAULT_SETTINGS;
  if (typeof p["settings"] === "object" && p["settings"] !== null) {
    try {
      settings = clampSettings({ ...DEFAULT_SETTINGS, ...(p["settings"] as Partial<PdfSettings>) });
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  }
  return { filename, source: p["source"] as string, settings, savedAt };
}

/** `guide.html` → `guide.html-to-pdf.json`; blanks fall back to a dated name. */
export function projectFilename(filename: string): string {
  const base = filename.trim().replace(/\.html?$/i, "") || "document";
  return `${base}.html-to-pdf.json`;
}
