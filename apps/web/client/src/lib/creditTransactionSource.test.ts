import { describe, expect, it } from "vitest";
import {
  inferCreditTransactionSourceType,
  resolveCreditTransactionOriginSurface,
} from "./creditTransactionSource";

describe("creditTransactionSource", () => {
  it("prefers declared source types when present", () => {
    expect(
      inferCreditTransactionSourceType({
        sourceType: "api_media",
        description: "Video generation: prompt snippet",
      }),
    ).toBe("api_media");
  });

  it("infers media_video from legacy descriptions without sourceType", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "VIDEO Generation: veo3/generate-veo-3-video-fast",
      }),
    ).toBe("media_video");
  });

  it("infers skill usage from skill execution descriptions", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "Skill execution: Cinematic Video Create Prompt",
      }),
    ).toBe("skill");
  });

  it("extracts the Media Studio origin surface from metadata", () => {
    expect(
      resolveCreditTransactionOriginSurface({
        metadata: { originSurface: "media_studio" },
      }),
    ).toBe("media_studio");
  });

  it("maps admin metadata actions to the admin source", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "Bonus",
        metadata: { action: "admin_add_credits" },
      }),
    ).toBe("admin");
  });

  it("maps presentation orchestration fee rows to other", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "AI Layout from Note (orchestration fee)",
        metadata: { type: "ai_layout_from_note" },
      }),
    ).toBe("other");
  });
});
