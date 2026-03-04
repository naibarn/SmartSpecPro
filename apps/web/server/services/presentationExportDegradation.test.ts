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
              { id: "e-1b", type: "chart" },
              { id: "e-2", type: "image", src: "" },
              { id: "e-3", type: "image", src: "", imageFormat: "svg" },
              { id: "e-4", type: "image", src: "uploads/icons/logo.svg" },
              { id: "e-5", type: "image", src: "", svgContent: "<div>broken-svg</div>" },
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
      "W_SVG_LOAD_FAILED",
      "W_SVG_PARSE_FAILED",
      "W_SVG_RASTERIZED",
      "W_SVG_PLACEHOLDER",
    ]);
  });

  it("does not emit unsupported warning for supported video and svg content", () => {
    const result = degradeSlidesForExport(
      [
        {
          id: 9,
          deckId: 101,
          orderIndex: 0,
          version: 1,
          title: "Media parity",
          slideContent: {
            elements: [
              { id: "vid-1", type: "video", src: "/api/storage/files/videos/demo.mp4" },
              { id: "svg-1", type: "image", src: "/api/storage/files/icons/logo.svg" },
              {
                id: "svg-2",
                type: "image",
                svgContent: "<svg><rect width='10' height='10' /></svg>",
                src: "",
              },
            ],
          },
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ],
      3000,
    );

    expect(result.warnings.map((warning) => warning.code)).not.toContain("SLIDE_ELEMENT_UNSUPPORTED");
  });
});
