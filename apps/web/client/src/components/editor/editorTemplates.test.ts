import { describe, it, expect } from "vitest";
import { getEditorTemplatePreset } from "./editorTemplates";

describe("editorTemplates", () => {
  it("uses a wider page canvas preset for long-form editing", () => {
    const preset = getEditorTemplatePreset("page");

    expect(preset.contentInnerClassName).toContain("max-w-6xl");
    expect(preset.contentInnerClassName).toContain("w-full");
  });
});
