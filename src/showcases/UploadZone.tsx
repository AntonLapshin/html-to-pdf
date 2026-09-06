import { UploadZone } from "../components/molecules/UploadZone";

export const name = "UploadZone";

const noop = () => undefined;

export const Default = () => (
  <div className="max-w-xl">
    <UploadZone
      onFile={noop}
      onSample={noop}
      onPasteHtml={noop}
      recents={[]}
      onLoadRecent={noop}
      onClearRecents={noop}
    />
  </div>
);

export const WithRecents = () => (
  <div className="max-w-xl">
    <UploadZone
      onFile={noop}
      onSample={noop}
      onPasteHtml={noop}
      recents={[
        { name: "guide.html", savedAt: new Date().toISOString(), pageCount: 3, source: "<div>…</div>" },
        { name: "pasted.html", savedAt: new Date().toISOString(), pageCount: 1, source: "<div>…</div>" },
      ]}
      onLoadRecent={noop}
      onClearRecents={noop}
    />
  </div>
);
