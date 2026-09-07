import type { ComponentType } from "react";
import * as Button from "./Button";
import * as PageCard from "./PageCard";
import * as PageModal from "./PageModal";
import * as PdfMerger from "./PdfMerger";
import * as PreviewGrid from "./PreviewGrid";
import * as ProjectBar from "./ProjectBar";
import * as SamplesGallery from "./SamplesGallery";
import * as SettingsPanel from "./SettingsPanel";
import * as Slider from "./Slider";
import * as Toggle from "./Toggle";
import * as UploadZone from "./UploadZone";

/**
 * Showcase registry — same shape as AntonLapshin/showcase `ShowcaseFile`
 * (`{ name, showcases }`), so the gallery can later be swapped to
 * `import { Showcase } from "showcase"` without changing any showcase file.
 *
 * Phase 3 decision: keep the local gallery. The upstream `showcase` repo
 * still has no published `dist/`, so a `github:` dependency cannot resolve
 * at install/build time.
 */
export interface ShowcaseFile {
  name: string;
  showcases: Record<string, ComponentType>;
}

export const showcaseFiles: readonly ShowcaseFile[] = [
  { name: Button.name, showcases: { Primary: Button.Primary, Secondary: Button.Secondary, Ghost: Button.Ghost } },
  { name: Slider.name, showcases: { Default: Slider.Default, Dpi: Slider.Dpi } },
  { name: Toggle.name, showcases: { On: Toggle.On, Off: Toggle.Off } },
  { name: PageCard.name, showcases: { Default: PageCard.Default, Overflow: PageCard.Overflow, Pending: PageCard.Pending } },
  { name: PreviewGrid.name, showcases: { Default: PreviewGrid.Default, Empty: PreviewGrid.Empty } },
  { name: PageModal.name, showcases: { Default: PageModal.Default } },
  { name: SettingsPanel.name, showcases: { Default: SettingsPanel.Default, NoPageNumbers: SettingsPanel.NoPageNumbers } },
  { name: UploadZone.name, showcases: { Default: UploadZone.Default, WithRecents: UploadZone.WithRecents } },
  { name: SamplesGallery.name, showcases: { Default: SamplesGallery.Default, Active: SamplesGallery.Active } },
  { name: ProjectBar.name, showcases: { Default: ProjectBar.Default, Empty: ProjectBar.Empty } },
  { name: PdfMerger.name, showcases: { Default: PdfMerger.Default } },
];
