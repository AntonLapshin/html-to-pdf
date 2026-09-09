import { describe, expect, it } from "vitest";
import { AGENT_PROMPT_SNIPPET, SAMPLES } from "./samples";

describe("samples gallery", () => {
  it("ships three loadable samples", () => {
    expect(SAMPLES).toHaveLength(3);
    for (const s of SAMPLES) {
      expect(s.id).toBeTruthy();
      expect(s.file).toMatch(/\.html$/);
    }
  });

  it("agent snippet produces convertible HTML", () => {
    expect(AGENT_PROMPT_SNIPPET).toContain(".page");
    expect(AGENT_PROMPT_SNIPPET).toContain("A4");
  });
});
