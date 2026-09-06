import { SamplesGallery } from "../components/molecules/SamplesGallery";

export const name = "SamplesGallery";

export const Default = () => (
  <div className="max-w-xl">
    <SamplesGallery onSelect={() => undefined} activeFile={null} />
  </div>
);

export const Active = () => (
  <div className="max-w-xl">
    <SamplesGallery onSelect={() => undefined} activeFile="recipe-book-sample.html" />
  </div>
);
