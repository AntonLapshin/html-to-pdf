import { describe, expect, it } from "vitest";
import {
  assetBasename,
  buildAssetMap,
  embedFontsInSource,
  embedImagesInSource,
  hasImageExtension,
} from "./embed";

const DATA = "data:x;base64,AAA";

describe("embed helpers", () => {
  it("assetBasename strips queries, hashes, dirs and case", () => {
    expect(assetBasename("assets/Cover-Photo.JPG?v=2#x")).toBe("cover-photo.jpg");
    expect(assetBasename("C:\\Windows\\Fonts\\SEGUISYM.ttf")).toBe("seguisym.ttf");
  });

  it("buildAssetMap keeps the first file per basename", () => {
    const m = buildAssetMap([
      { name: "A.ttf", dataUrl: "data:first" },
      { name: "a.TTF", dataUrl: "data:second" },
    ]);
    expect(m.get("a.ttf")).toBe("data:first");
  });

  it("hasImageExtension gates image refs", () => {
    expect(hasImageExtension("photo.JPG")).toBe(true);
    expect(hasImageExtension("font.woff2")).toBe(false);
    expect(hasImageExtension("noext")).toBe(false);
    expect(hasImageExtension("img.svg?x=1")).toBe(true);
  });

  it("embedFontsInSource rewrites quoted and unquoted urls", () => {
    const { source, matched } = embedFontsInSource(
      `<style>@font-face{src:url(_fonts/A.ttf);}b{src:url('B.ttf');}</style>`,
      [
        { name: "a.ttf", dataUrl: DATA },
        { name: "b.ttf", dataUrl: DATA },
      ],
    );
    expect(matched).toBe(2);
    expect(source.split(DATA).length - 1).toBe(2);
  });

  it("embedImagesInSource skips remote/data/blob/fragment and non-images", () => {
    const src =
      `<img src="https://cdn.example/a.png">` +
      `<img src="data:image/png;base64,AAA">` +
      `<img src="blob:xyz">` +
      `<img src=unquoted.jpg>` +
      `<style>a{background:url(#frag);}b{background:url(f.TTF);}c{background:url(ok.png);}</style>`;
    const { source, matched } = embedImagesInSource(src, [
      { name: "a.png", dataUrl: DATA },
      { name: "unquoted.jpg", dataUrl: DATA },
      { name: "f.ttf", dataUrl: DATA },
      { name: "ok.png", dataUrl: DATA },
    ]);
    expect(matched).toBe(2);
    expect(source).toContain("https://cdn.example/a.png");
    expect(source).toContain("url(#frag)");
    expect(source).toContain("f.TTF");
    expect(source).not.toContain("unquoted.jpg");
    expect(source).not.toContain("url(ok.png)");
  });

  it("embedImagesInSource keeps srcset descriptors and skips remote srcset", () => {
    const { source, matched } = embedImagesInSource(
      `<img srcset="a.jpg 1x, https://cdn.example/b.jpg 2x, blob:z 1x">`,
      [{ name: "a.jpg", dataUrl: DATA }],
    );
    expect(matched).toBe(1);
    expect(source).toContain(`${DATA} 1x`);
    expect(source).toContain("https://cdn.example/b.jpg");
    expect(source).toContain("blob:z");
  });
});
