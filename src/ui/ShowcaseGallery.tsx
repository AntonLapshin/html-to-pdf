import { useMemo, useState } from "react";
import { showcaseFiles } from "../showcases";

/**
 * Minimal showcase gallery mirroring AntonLapshin/showcase UX
 * (sidebar + canvas + `?file=..&showcase=..` deep-linking).
 * Phase 1 task: replace with `import { Showcase } from "showcase"`.
 */
export function ShowcaseGallery() {
  const initial = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return { file: q.get("file"), showcase: q.get("showcase") };
  }, []);
  const [file, setFile] = useState<string | null>(initial.file);
  const [variant, setVariant] = useState<string | null>(initial.showcase);
  const [expanded, setExpanded] = useState<string | null>(initial.file);

  const select = (f: string, v: string) => {
    setFile(f);
    setVariant(v);
    const url = new URL(window.location.href);
    url.searchParams.set("file", f);
    url.searchParams.set("showcase", v);
    window.history.pushState({}, "", url);
  };

  const active = showcaseFiles.find((f) => f.name === file);
  const Selected = active && variant ? active.showcases[variant] : undefined;

  return (
    <div className="showcase-local mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2 bg-white p-3 ring-1 ring-slate-200">
        <a href={import.meta.env.BASE_URL} className="text-sm text-indigo-600">
          ← Back to app
        </a>
        <h1 className="text-lg font-semibold">Showcases</h1>
        {showcaseFiles.map((f) => (
          <div key={f.name}>
            <button
              onClick={() => setExpanded(expanded === f.name ? null : f.name)}
              className="flex w-full items-center justify-between px-2 py-1 text-sm font-medium hover:bg-slate-100"
            >
              <span>{f.name}</span>
              <span>{expanded === f.name ? "▾" : "▸"}</span>
            </button>
            {expanded === f.name && (
              <ul className="pl-3">
                {Object.keys(f.showcases).map((v) => (
                  <li key={v}>
                    <button
                      onClick={() => select(f.name, v)}
                      className={`w-full px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                        file === f.name && variant === v ? "text-indigo-600" : "text-slate-600"
                      }`}
                    >
                      {v}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </aside>
      <main className="bg-white p-6 ring-1 ring-slate-200">
        <h2 className="mb-4 text-sm text-slate-500">
          {file && variant ? `${file} / ${variant}` : "Select a showcase"}
        </h2>
        {Selected ? <Selected /> : <p className="text-sm text-slate-400">Pick a variant from the sidebar.</p>}
      </main>
    </div>
  );
}
