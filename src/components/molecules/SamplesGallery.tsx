import { useState } from "react";
import { AGENT_PROMPT_SNIPPET, SAMPLES } from "../../core/samples";
import { Button } from "../atoms/Button";

interface Props {
  onSelect: (file: string) => void;
  activeFile?: string | null;
}

/** Molecule: 2–3 prompt-generated examples + the agent prompt snippet. */
export function SamplesGallery({ onSelect, activeFile }: Props) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — user can still select the text manually.
    }
  };

  return (
    <section aria-label="Samples gallery" className="space-y-3 bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-700">Samples gallery</h2>
      <ul className="space-y-2">
        {SAMPLES.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.file)}
              aria-pressed={activeFile === s.file}
              className={`w-full px-3 py-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                activeFile === s.file
                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                  : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              <span className="font-medium">{s.title}</span>
              <span className="block text-xs text-slate-500">{s.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500">Agent prompt snippet</h3>
          <Button variant="ghost" onClick={copyPrompt} aria-live="polite">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
          {AGENT_PROMPT_SNIPPET}
        </pre>
      </div>
    </section>
  );
}
