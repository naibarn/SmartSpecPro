import { describe, expect, it } from "vitest";

import {
  buildLocationCameraVariantPrompt,
  buildLocationImageEditPrompt,
  buildLocationVisualPromptsUserPrompt,
} from "../verticalDramaLocationImageGeneration";

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
    expect(prompt).toContain('"preset": "custom"');
  });
});

describe("location image-to-image edit prompt", () => {
  it("keeps the explicit edit request and preserves unspecified source details", () => {
    const prompt = buildLocationImageEditPrompt({
      locationName: "Advisor office",
      description:
        "Small office with structural drawings on the wall and a window-side desk",
      editInstruction:
        "Replace the desk with dark wood and keep the window, room layout, and daylight unchanged.",
      cameraView: {
        preset: "custom",
        label: "window-side desk",
        directive: "camera faces the desk beside the window",
      },
    });

    expect(prompt).toContain("IMAGE-TO-IMAGE EDIT");
    expect(prompt).toContain("Replace the desk with dark wood");
    expect(prompt).toContain("window-side desk");
    expect(prompt).toContain("Preserve the source image's architecture");
  });
});

describe("location camera-variant prompt", () => {
  it("requires a new camera composition while preserving the source location identity", () => {
    const prompt = buildLocationCameraVariantPrompt({
      locationName: "Clinic parking lot",
      description:
        "A small clinic entrance with a glass front and reception counter inside",
      editInstruction:
        "Zoom through the glass to see the reception counter inside",
      cameraView: {
        preset: "insert_detail_shot",
        label: "Detail view",
        directive: "close interior-facing view through the front glass",
      },
    });

    expect(prompt).toContain("IMAGE-TO-IMAGE CAMERA VARIANT");
    expect(prompt).toContain("new camera composition");
    expect(prompt).toContain(
      "Zoom through the glass to see the reception counter inside"
    );
    expect(prompt).toContain(
      "close interior-facing view through the front glass"
    );
    expect(prompt).toContain("Do not return a copy of the original framing");
    expect(prompt).not.toContain("Preserve the source image viewpoint unless");
  });
});
