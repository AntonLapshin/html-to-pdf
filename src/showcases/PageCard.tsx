import { PageCard } from "../components/molecules/PageCard";

export const name = "PageCard";

const demoUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#fff" stroke="#e2e8f0"/><text x="105" y="140" text-anchor="middle" font-size="14" fill="#334155">Slow living</text></svg>`,
  );

export const Default = () => (
  <div className="max-w-56">
    <PageCard index={0} previewUrl={demoUrl} status="ready" overflow={false} onExpand={() => undefined} />
  </div>
);

export const Overflow = () => (
  <div className="max-w-56">
    <PageCard index={1} previewUrl={demoUrl} status="ready" overflow onExpand={() => undefined} />
  </div>
);

export const Pending = () => (
  <div className="max-w-56">
    <PageCard index={2} previewUrl={null} status="pending" overflow={false} onExpand={() => undefined} />
  </div>
);
