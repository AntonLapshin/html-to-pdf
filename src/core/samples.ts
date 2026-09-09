/** One gallery entry: sidebar metadata pointing at a bundled HTML file. */
export interface SampleMeta {
  id: string;
  title: string;
  blurb: string;
  file: string;
}

/** Bundled `.page`-split examples shown in the Samples gallery. */
export const SAMPLES: readonly SampleMeta[] = [
  {
    id: "slow-living",
    title: "Slow-living guide",
    blurb: "3 pages · calm cover, morning + evening routines.",
    file: "slowliving-sample.html",
  },
  {
    id: "recipe-book",
    title: "Recipe book",
    blurb: "3 pages · pasta + crumble with ingredient lists.",
    file: "recipe-book-sample.html",
  },
  {
    id: "travel-journal",
    title: "Travel journal",
    blurb: "3 pages · Lisbon mini-journal with day entries.",
    file: "travel-journal-sample.html",
  },
];

/**
 * Exact agent prompt snippet that produces compatible HTML.
 * Shown in the samples gallery and README so a fresh agent
 * session can generate a convertible document in one shot.
 */
export const AGENT_PROMPT_SNIPPET = `Generate a beautiful standalone HTML document with plain
inline <style> CSS (no external files, no Tailwind classes).
Inline images and fonts as data: URLs — external http(s) URLs need
CORS (Access-Control-Allow-Origin) or they render blank in the PDF.
Split the content into <div class="page">…</div> sections —
each .page block becomes exactly one A4 PDF page.
Keep every page short enough to fit one A4 page at 10mm margins.`;
