/**
 * Shared raster-pipeline types (Phase 1 refactor).
 * Leaf module — imported by `assets.ts`, `raster.ts` and `refs.ts`
 * so those modules never need to import each other for types.
 */
export type RenderStatus = "pending" | "ready" | "error";

export interface RenderInput {
  html: string;
  styles: string;
  /** External stylesheet URLs re-injected into the raster holder (webfonts). */
  links?: string[];
}
