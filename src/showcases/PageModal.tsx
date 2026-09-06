import { PageModal } from "../components/organisms/PageModal";

export const name = "PageModal";

const demoUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="594"><rect width="420" height="594" fill="#fff" stroke="#e2e8f0"/><text x="210" y="280" text-anchor="middle" font-size="24" fill="#334155">Expanded page raster</text></svg>`,
  );

export const Default = () => (
  <div className="relative h-[560px] overflow-hidden">
    <PageModal
      index={0}
      renders={[
        { status: "ready", previewUrl: demoUrl, detailUrl: demoUrl, overflow: false, error: null },
        { status: "ready", previewUrl: demoUrl, detailUrl: demoUrl, overflow: true, error: null },
        { status: "pending", previewUrl: null, detailUrl: null, overflow: false, error: null },
      ]}
      onClose={() => undefined}
      onSelect={() => undefined}
    />
  </div>
);
