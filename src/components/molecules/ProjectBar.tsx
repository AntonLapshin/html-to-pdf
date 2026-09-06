import { useRef } from "react";
import { Button } from "../atoms/Button";

interface Props {
  hasDoc: boolean;
  lastSavedAt: string | null;
  onSave: () => void;
  onLoadFile: (file: File) => void;
}

/** Molecule: project save/load JSON actions (port of book's saveProject/loadProject). */
export function ProjectBar({ hasDoc, lastSavedAt, onSave, onLoadFile }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <section aria-label="Project actions" className="bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-700">Project</h2>
      <p className="mt-1 text-xs text-slate-500">
        Save pages + settings as JSON, reload later. Autosaves to this browser.
        {lastSavedAt ? ` Last autosave: ${new Date(lastSavedAt).toLocaleTimeString()}.` : ""}
      </p>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Load project JSON file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onLoadFile(f);
        }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onSave} disabled={!hasDoc}>
          Save project
        </Button>
        <Button variant="secondary" onClick={() => ref.current?.click()}>
          Load project
        </Button>
      </div>
    </section>
  );
}
