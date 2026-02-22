import { describe, expect, it } from "vitest";

import { degradeSlidesForExport } from "./presentationExportDegradation";

describe("presentationExportDegradation", () => {
  it("applies deterministic warning precedence per slide", () => {
    const result = degradeSlidesForExport(
      [
        {
          id: 5,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Slide A",
          slideContent: {
            elements: [
              { id: "e-1", type: "video" },
              { id: "e-2", type: "image", src: "" },
            ],
            transition: "wipe",
            durationMs: "fast",
          },
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ],
      3000,
    );

    expect(result.slides).toEqual([
      {
        slideId: 5,
        orderIndex: 0,
        title: "Slide A",
        durationMs: 3000,
        transition: "cut",
      },
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "SLIDE_TRANSITION_UNSUPPORTED",
      "SLIDE_DURATION_INVALID",
      "SLIDE_ELEMENT_UNSUPPORTED",
      "SLIDE_IMAGE_SOURCE_MISSING",
    ]);
  });
});
