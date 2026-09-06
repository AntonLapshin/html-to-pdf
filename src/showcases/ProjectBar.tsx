import { ProjectBar } from "../components/molecules/ProjectBar";

export const name = "ProjectBar";

export const Default = () => (
  <div className="max-w-xl">
    <ProjectBar hasDoc onSave={() => undefined} onLoadFile={() => undefined} lastSavedAt={new Date().toISOString()} />
  </div>
);

export const Empty = () => (
  <div className="max-w-xl">
    <ProjectBar hasDoc={false} onSave={() => undefined} onLoadFile={() => undefined} lastSavedAt={null} />
  </div>
);
