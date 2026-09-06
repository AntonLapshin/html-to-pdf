import { PreviewGrid } from "../components/organisms/PreviewGrid";

export const name = "PreviewGrid";

const demo = [
  "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#fff" stroke="#e2e8f0"/><text x="105" y="140" text-anchor="middle" font-size="14" fill="#334155">Page 1</text></svg>`,
    ),
  "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#fff" stroke="#e2e8f0"/><text x="105" y="140" text-anchor="middle" font-size="14" fill="#334155">Page 2</text></svg>`,
    ),
];

export const Default = () => (
  <PreviewGrid
    renders={[
      { status: "ready", previewUrl: demo[0], overflow: false, error: null },
      { status: "ready", previewUrl: demo[1], overflow: true, error: null },
      { status: "pending", previewUrl: null, overflow: false, error: null },
    ]}
    onExpand={() => undefined}
  />
);

export const Empty = () => <PreviewGrid renders={[]} onExpand={() => undefined} />;
