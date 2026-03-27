import { describe, expect, it } from "vitest";
import { sanitizeMediaModelSelectionWithEnabledIds } from "../mediaModelSelection";

describe("sanitizeMediaModelSelectionWithEnabledIds", () => {
  it("keeps enabled selections and drops disabled entries", () => {
    const result = sanitizeMediaModelSelectionWithEnabledIds(
      ["enabled-image", "enabled-video"],
      {
        availableModels: ["enabled-image", "disabled-image", "enabled-video"],
        defaultModel: "disabled-image",
      },
    );

    expect(result).toEqual({
      availableModels: ["enabled-image", "enabled-video"],
      defaultModel: "enabled-image",
    });
  });
});
