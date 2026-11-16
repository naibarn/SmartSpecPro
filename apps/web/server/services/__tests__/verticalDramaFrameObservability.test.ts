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
vi.mock("fs", async importOriginal => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() },
  };
});
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));
vi.mock("../modelRegistry", () => ({ resolveVerticalDramaCapabilities: vi.fn() }));
vi.mock("../verticalDramaProviderRouting", () => ({ detectProviderFamily: vi.fn() }));
vi.mock("../verticalDramaImproveScript", () => ({ resolveQualityLargeContextModelId: vi.fn() }));
vi.mock("../verticalDramaLlmModelPolicy", () => ({ resolveVerticalDramaSeriesModel: vi.fn() }));

import {
  buildTargetVideoModelFactBlock,
  normalizeFrameAnalysis,
  shotVideoPromptOutputSchema,
} from "../verticalDramaVideoMotionPromptGeneration";

const base = {
  family: "veo" as const,
  modelId: "veo-test",
  frameAnalysisRequested: true,
};

describe("frame observability fact gate", () => {
  it("is byte-identical when omitted or false", () => {
    expect(buildTargetVideoModelFactBlock(base)).toBe(
      buildTargetVideoModelFactBlock({ ...base, frameObservabilityRequested: false }),
    );
  });

  it("adds exactly one observability line immediately after frame_analysis", () => {
    const without = buildTargetVideoModelFactBlock(base);
    const withFlag = buildTargetVideoModelFactBlock({
      ...base,
      frameObservabilityRequested: true,
    });
    const line = withFlag.split("\n").find(value => value.includes("frame_observability"))!;
    expect(withFlag.indexOf("frame_analysis: REQUIRED")).toBeLessThan(withFlag.indexOf(line));
    expect(withFlag.indexOf(line)).toBeLessThan(withFlag.indexOf("Apply the skill"));
    expect(withFlag.replace(`${line}\n`, "")).toBe(without);
  });
});

describe("frame observability parsing", () => {
  it.each([
    [true, true],
    [false, false],
    ["true", true],
    ["false", false],
    [" TRUE ", true],
    [" False ", false],
  ])("normalizes the vision boolean %j without changing its meaning", (value, expected) => {
    const parsed = shotVideoPromptOutputSchema.parse({
      prompt: "Camera follows the approved action.",
      frame_analysis: {
        people: [{ name: "Mali", position: "left", overlapped_by_other_face: value }],
        faces_separated: value,
      },
      motion_profile: { new_character_enters: value },
    });
    expect(parsed.frame_analysis?.people?.[0].overlapped_by_other_face).toBe(expected);
    expect(parsed.frame_analysis?.faces_separated).toBe(expected);
    expect(parsed.motion_profile?.new_character_enters).toBe(expected);
    expect(normalizeFrameAnalysis(parsed.frame_analysis)?.facesSeparated).toBe(expected);
  });

  it.each(["unknown", "boolean", "yes", "0", "", null, 0, 1])(
    "rejects ambiguous vision safety evidence %j",
    value => {
      for (const fields of [
        { frame_analysis: { faces_separated: value } },
        { frame_analysis: { people: [{ name: "Mali", position: "left", overlapped_by_other_face: value }] } },
        { motion_profile: { new_character_enters: value } },
      ]) {
        expect(shotVideoPromptOutputSchema.safeParse({ prompt: "Camera moves.", ...fields }).success).toBe(false);
      }
    }
  );

  it("accepts lenient observability strings and preserves extra keys", () => {
    const parsed = shotVideoPromptOutputSchema.parse({
      prompt: "motion",
      frame_analysis: {
        people: [{
          name: " A ", position: " Left ", facing: "3/4",
          eyes_visible: "BOTH", occlusion: "Partial", face_size: "Large",
          overlapped_by_other_face: false, vendor_extra: "kept",
        }],
        position_source: " image ",
        faces_separated: true,
      },
    });
    expect(parsed.frame_analysis?.people?.[0]).toHaveProperty("vendor_extra", "kept");
    expect(normalizeFrameAnalysis(parsed.frame_analysis)).toEqual({
      people: [{
        name: "A", position: "Left", facing: "3/4", eyesVisible: "both",
        occlusion: "partial", faceSize: "large", overlappedByOtherFace: false,
      }],
      positionSource: "image",
      facesSeparated: true,
    });
  });
});
