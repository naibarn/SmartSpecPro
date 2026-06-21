import { describe, expect, it } from "vitest";

import {
  VideoSegmentPlannerInputSchema,
  VideoSegmentPlanWarningSchema,
} from "../contracts";

const validInput = {
  sourceSurface: "marketplace_capture",
  mode: "per_shot",
  videoModelId: "veo-3.1-lite",
  provider: "kie.ai",
  transport: "gateway_api",
  audioStrategy: "separate_tts_voiceover",
  referenceMode: "single_storyboard_frame",
  shots: [
    {
      shotId: "shot-1",
      index: 0,
      durationSeconds: 5,
      storyboardFrameUrl: "https://example.com/shot-1.png",
    },
  ],
};

describe("video segment planner contracts", () => {
  it("accepts a valid planner input", () => {
    expect(VideoSegmentPlannerInputSchema.parse(validInput)).toMatchObject({
      mode: "per_shot",
      videoModelId: "veo-3.1-lite",
    });
  });

  it("rejects missing shot IDs and invalid modes", () => {
    expect(() =>
      VideoSegmentPlannerInputSchema.parse({
        ...validInput,
        mode: "freeform",
      })
    ).toThrow();
    expect(() =>
      VideoSegmentPlannerInputSchema.parse({
        ...validInput,
        shots: [{ index: 0 }],
      })
    ).toThrow();
  });

  it("supports API-facing warning sources for preview and regeneration", () => {
    expect(
      VideoSegmentPlanWarningSchema.parse({
        code: "mcp_access_missing",
        message: "MCP access is not available.",
        severity: "warning",
        source: "access",
      })
    ).toMatchObject({ source: "access" });
  });
});
