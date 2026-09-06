import { UploadZone } from "../components/molecules/UploadZone";

export const name = "UploadZone";

export const Default = () => (
  <div className="max-w-xl">
    <UploadZone onFile={() => undefined} onSample={() => undefined} />
  </div>
);
