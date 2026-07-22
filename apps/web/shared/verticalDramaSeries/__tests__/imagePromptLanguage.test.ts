import { describe, expect, it } from "vitest";

import { resolveEffectiveImagePromptLanguage } from "../imagePromptLanguage";

describe("resolveEffectiveImagePromptLanguage", () => {
  it("prefers the explicit start-frame image language", () => {
    expect(
      resolveEffectiveImagePromptLanguage({
        startFramePlan: { imagePromptLanguage: "th" },
        motionPromptPack: { promptLanguage: "en" },
      })
    ).toBe("th");
  });

  it("uses the legacy shared prompt language while no image language exists", () => {
    expect(
      resolveEffectiveImagePromptLanguage({
        startFramePlan: {},
        motionPromptPack: { promptLanguage: "ja" },
      })
    ).toBe("ja");
  });

  it("defaults to English when neither plan has a language", () => {
    expect(resolveEffectiveImagePromptLanguage({})).toBe("en");
  });
});
