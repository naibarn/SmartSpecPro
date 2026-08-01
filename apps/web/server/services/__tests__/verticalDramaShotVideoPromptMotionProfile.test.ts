import { describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("fs", () => ({ default: { existsSync: vi.fn(), readFileSync: vi.fn() } }));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));
vi.mock("../modelRegistry", () => ({ resolveVerticalDramaCapabilities: vi.fn() }));
vi.mock("../verticalDramaProviderRouting", () => ({ detectProviderFamily: vi.fn() }));
vi.mock("../verticalDramaImproveScript", () => ({ resolveQualityLargeContextModelId: vi.fn() }));
vi.mock("../verticalDramaLlmModelPolicy", () => ({ resolveVerticalDramaSeriesModel: vi.fn() }));

import {
  buildTargetVideoModelFactBlock,
  resolveShotVideoPromptMotionProfile,
  shotVideoPromptOutputSchema,
  VD_MOTION_PROFILE_SKILL_SECTION_NAME,
} from "../verticalDramaVideoMotionPromptGeneration";

const base = {
  family: "veo" as const,
  modelId: "veo-test",
  frameAnalysisRequested: true,
  frameObservabilityRequested: true,
};

const validProfile = {
  characters: [{
    name: " Lead ",
    start_facing: "profile",
    end_facing: "frontal",
    turn_magnitude: "large",
    reveals_hidden_side: true,
    extra: "preserved",
  }],
  camera_motion: "push-in",
  new_character_enters: false,
  identity_risk: "low",
  risk_reasons: ["hidden side"],
};

describe("motion_profile request gate", () => {
  it("is byte-identical when omitted or false", () => {
    expect(buildTargetVideoModelFactBlock(base)).toBe(
      buildTargetVideoModelFactBlock({ ...base, motionContractsEnabled: false }),
    );
  });

  it("adds one line after observability and before Apply", () => {
    const without = buildTargetVideoModelFactBlock(base);
    const withFlag = buildTargetVideoModelFactBlock({ ...base, motionContractsEnabled: true });
    const line = withFlag.split("\n").find(value => value.includes("motion_profile"))!;
    expect(VD_MOTION_PROFILE_SKILL_SECTION_NAME).toBe("MOTION PROFILE + MOTION CONTRACT");
    expect(line).toContain(VD_MOTION_PROFILE_SKILL_SECTION_NAME);
    expect(withFlag.indexOf("frame_observability: REQUIRED")).toBeLessThan(withFlag.indexOf(line));
    expect(withFlag.indexOf(line)).toBeLessThan(withFlag.indexOf("Apply the skill"));
    expect(withFlag.replace(`${line}\n`, "")).toBe(without);
  });
});

describe("motion_profile parsing and status", () => {
  it("keeps the zod boundary lenient and derives a raised risk floor", () => {
    const parsed = shotVideoPromptOutputSchema.parse({
      prompt: "motion",
      motion_profile: validProfile,
    });
    expect(parsed.motion_profile?.characters?.[0]).toHaveProperty("extra", "preserved");
    expect(resolveShotVideoPromptMotionProfile(parsed.motion_profile, true)).toMatchObject({
      motionContractStatus: "emitted",
      effectiveRisk: "high",
      motionProfile: {
        cameraMotion: "push_in",
        effectiveRisk: "high",
      },
    });
  });

  it("distinguishes missing and invalid without guessing a risk", () => {
    expect(resolveShotVideoPromptMotionProfile(undefined, true)).toEqual({
      motionContractStatus: "missing",
    });
    expect(resolveShotVideoPromptMotionProfile({ characters: [] }, true)).toEqual({
      motionContractStatus: "invalid",
    });
  });

  it("ignores volunteered output while the flag is off", () => {
    expect(resolveShotVideoPromptMotionProfile(validProfile, false)).toEqual({});
  });

  it("bounds the profile to six characters", () => {
    const many = {
      ...validProfile,
      characters: Array.from({ length: 20 }, (_, index) => ({
        ...validProfile.characters[0],
        name: `Character ${index}`,
      })),
    };
    expect(resolveShotVideoPromptMotionProfile(many, true).motionProfile?.characters).toHaveLength(6);
  });
});
