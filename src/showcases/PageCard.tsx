import { PageCard } from "../components/molecules/PageCard";

export const name = "PageCard";

const demoSrcDoc = `<!doctype html><html><head><style>body{margin:0;font-family:sans-serif;}.page{padding:10mm;}</style></head><body><div class="page"><h1>Slow living</h1><p>Each .page block is one PDF page.</p></div></body></html>`;

export const Default = () => (
  <div className="max-w-56">
    <PageCard index={0} srcDoc={demoSrcDoc} onExpand={() => undefined} />
  </div>
);
