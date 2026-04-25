import { describe, expect, it } from "vitest";

import { applyMediaStudioAspectRatioPromptParams } from "./mediaStudioPromptParams";

describe("applyMediaStudioAspectRatioPromptParams", () => {
  it("injects the Media Studio ratio when skill params are missing", () => {
    const params: Record<string, unknown> = {};

    applyMediaStudioAspectRatioPromptParams(params, "16:9");

    expect(params.aspect_ratio).toBe("16:9");
    expect(params.aspectRatio).toBe("16:9");
  });

  it("replaces auto skill defaults with the selected Media Studio ratio", () => {
    const params: Record<string, unknown> = {
      aspect_ratio: "auto",
    };

    applyMediaStudioAspectRatioPromptParams(params, "16:9");

    expect(params.aspect_ratio).toBe("16:9");
    expect(params.aspectRatio).toBe("16:9");
  });

  it("uses the Media Studio ratio as the page-level source of truth", () => {
    const params: Record<string, unknown> = {
      aspect_ratio: "4:5",
    };

    applyMediaStudioAspectRatioPromptParams(params, "16:9");

    expect(params.aspect_ratio).toBe("16:9");
    expect(params.aspectRatio).toBe("16:9");
  });
});
