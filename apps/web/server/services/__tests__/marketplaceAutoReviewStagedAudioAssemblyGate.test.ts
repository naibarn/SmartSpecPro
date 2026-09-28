import { describe, expect, it } from "vitest";

import {
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
  stagedAudioPlanRequiresApproval,
} from "../marketplaceAutoReviewStagedAudioAssembly";

describe("Feature 141 audio and final assembly boundaries", () => {
  it("normalizes a reviewable audio plan and identifies the separate-TTS gate", () => {
    const plan = buildStagedAudioPlan({
      text: "  สวัสดี  ",
      language: " ",
      model: "elevenlabs-tts",
      provider: "media-provider",
      estimatedCredits: 4,
    });
    expect(plan).toMatchObject({ text: "สวัสดี", language: "th" });
    expect(stagedAudioPlanRequiresApproval("separate_tts_voiceover")).toBe(true);
    expect(stagedAudioPlanRequiresApproval("native_video_audio")).toBe(false);
  });

  it("changes final assembly hash when ordered evidence changes", () => {
    const base = { shots: [{ shotId: 1, imageArtifactHash: "a" }], audio: null };
    expect(buildStagedFinalAssemblyHash(base)).not.toBe(
      buildStagedFinalAssemblyHash({ shots: [{ shotId: 2, imageArtifactHash: "a" }], audio: null })
    );
  });
});
