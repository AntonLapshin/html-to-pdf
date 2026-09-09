import { deserializeProject, serializeProject } from "./project";
import type { PdfSettings } from "./settings";

/** Autosaved session snapshot (source + settings + timestamp). */
export interface AutosaveEntry {
  filename: string;
  source: string;
  settings: PdfSettings;
  savedAt: string;
}

/** One sidebar recent-file entry (full source kept for one-click reopen). */
export interface RecentFile {
  name: string;
  savedAt: string;
  pageCount: number;
  /** Full HTML source so a recent entry can be re-opened in one click. */
  source: string;
}

/** localStorage key for the autosaved session. */
export const AUTOSAVE_KEY = "html-to-pdf:autosave:v1";
/** localStorage key for the recent-file history. */
export const RECENTS_KEY = "html-to-pdf:recents:v1";
/** Maximum recent files kept in the sidebar. */
export const MAX_RECENTS = 5;
/** Skip autosaving huge uploads that would blow the ~5MB localStorage quota. */
export const MAX_AUTOSAVE_CHARS = 800_000;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/* ---------- autosave ---------- */

export function saveAutosave(entry: AutosaveEntry): void {
  const store = storage();
  if (!store) return;
  if (entry.source.length > MAX_AUTOSAVE_CHARS) return;
  try {
    store.setItem(AUTOSAVE_KEY, serializeProject(entry.source, entry.filename, entry.settings));
  } catch {
    // Quota exceeded or unavailable (private mode) — autosave is best-effort.
  }
}

/** Read the autosaved session, or null when missing/corrupt/unavailable. */
export function loadAutosave(): AutosaveEntry | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    const loaded = deserializeProject(raw);
    return {
      filename: loaded.filename,
      source: loaded.source,
      settings: loaded.settings,
      savedAt: loaded.savedAt,
    };
  } catch {
    return null;
  }
}

/** Drop the autosaved session (best-effort). */
export function clearAutosave(): void {
  try {
    storage()?.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

/* ---------- recent-file history ---------- */

export function getRecentFiles(): RecentFile[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentFile =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentFile).name === "string" &&
        typeof (e as RecentFile).source === "string",
    );
  } catch {
    return [];
  }
}

/** Prepend an entry to the capped recent-file history (deduped, quota-safe). */
export function addRecentFile(entry: RecentFile): RecentFile[] {
  const next = [
    entry,
    ...getRecentFiles().filter((r) => r.name !== entry.name || r.source !== entry.source),
  ].slice(0, MAX_RECENTS);
  try {
    storage()?.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Quota — drop the largest entry and retry once with a smaller list.
    try {
      storage()?.setItem(RECENTS_KEY, JSON.stringify(next.slice(0, 3)));
      return next.slice(0, 3);
    } catch {
      // ignore
    }
  }
  return next;
}

/** Drop the recent-file history (best-effort). */
export function clearRecentFiles(): void {
  try {
    storage()?.removeItem(RECENTS_KEY);
  } catch {
    // ignore
  }
}
