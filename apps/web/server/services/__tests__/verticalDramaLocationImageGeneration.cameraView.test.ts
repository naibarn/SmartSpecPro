import { describe, expect, it } from "vitest";

import { buildLocationVisualPromptsUserPrompt } from "../verticalDramaLocationImageGeneration";

describe("location visual bible camera view input", () => {
  it("passes standard and custom location camera directives to the LLM contract", () => {
    const prompt = buildLocationVisualPromptsUserPrompt({
      userId: 1,
      seriesId: 24,
      locationKey: "lighthouse",
      locationName: "Lighthouse coast",
      description: "A lighthouse on sea rocks",
      cameraView: {
        preset: "custom",
        label: "side of the lighthouse on the sea rocks",
        directive: "side of the lighthouse on the sea rocks, low angle",
      },
    });

    expect(prompt).toContain('"camera_view"');
    expect(prompt).toContain("side of the lighthouse on the sea rocks");
    expect(prompt).toContain("\"preset\": \"custom\"");
  });
});
