import type { ComponentType } from "react";
import * as Button from "./Button";
import * as PageCard from "./PageCard";
import * as SettingsPanel from "./SettingsPanel";
import * as UploadZone from "./UploadZone";

/**
 * Showcase registry — same shape as AntonLapshin/showcase `ShowcaseFile`
 * (`{ name, showcases }`), so the gallery can later be swapped to
 * `import { Showcase } from "showcase"` without changing any showcase file.
 */
export interface ShowcaseFile {
  name: string;
  showcases: Record<string, ComponentType>;
}

export const showcaseFiles: readonly ShowcaseFile[] = [
  { name: Button.name, showcases: { Primary: Button.Primary, Secondary: Button.Secondary, Ghost: Button.Ghost } },
  { name: PageCard.name, showcases: { Default: PageCard.Default } },
  { name: SettingsPanel.name, showcases: { Default: SettingsPanel.Default, NoPageNumbers: SettingsPanel.NoPageNumbers } },
  { name: UploadZone.name, showcases: { Default: UploadZone.Default } },
];
