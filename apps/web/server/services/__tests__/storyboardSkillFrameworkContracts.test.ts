import { describe, expect, it } from "vitest";
import {
  assertCanonicalGenerationRequest,
  buildStoryboardConfirmationFingerprint,
  fingerprintStoryboardSnapshot,
  isRetryableStoryboardShotStatus,
  isTerminalStoryboardRunStatus,
  normalizeStoryboardGlobalInput,
  parseStoryboardDialogueDraft,
  redactStoryboardValue,
  storyboardCanonicalSkillResponseSchema,
  STORYBOARD_DEFAULT_SHOTS,
} from "../storyboardSkillFrameworkContracts";

const base = {
  title: "เด็กน้อยกับดาวตก",
  idea: "เด็กน้อยช่วยลูกนกตามหาบ้านในสวน",
  storyType: "mime" as const,
  selectedSkillId: "cute_child_image_generator",
  selectedSkillVersion: "3.0.0",
  imageModelSelection: { modelId: "gpt-image-2.5" },
  videoModelSelection: { modelId: "veo-3" },
};

describe("Storyboard Skill Framework contracts", () => {
  it("applies the nine-shot default and fixed ten-second duration", () => {
    const value = normalizeStoryboardGlobalInput(base);
    expect(value.totalShots).toBe(STORYBOARD_DEFAULT_SHOTS);
    expect(value.shotDurationSec).toBe(10);
    expect(value.outputAspectRatio).toBe("9:16");
  });

  it.each([2, 9, 12])("accepts totalShots=%s", totalShots => {
    expect(
      normalizeStoryboardGlobalInput({ ...base, totalShots })
    ).toMatchObject({ totalShots });
  });

  it.each([1, 13, 2.5])("rejects invalid shot count %s", totalShots => {
    expect(() =>
      normalizeStoryboardGlobalInput({ ...base, totalShots })
    ).toThrow();
  });

  it("rejects dialogue in mime mode and de-duplicates character IDs", () => {
    expect(() =>
      normalizeStoryboardGlobalInput({
        ...base,
        dialogueLines: [{ speaker: "เด็ก", text: "สวัสดี", language: "th" }],
      })
    ).toThrow();
    expect(
      normalizeStoryboardGlobalInput({ ...base, characterIds: ["a", "a", "b"] })
        .characterIds
    ).toEqual(["a", "b"]);
    expect(() =>
      normalizeStoryboardGlobalInput({ ...base, storyType: "dialogue" })
    ).toThrow("dialogue");
  });

  it("fingerprints equivalent object ordering identically", () => {
    expect(fingerprintStoryboardSnapshot({ b: 2, a: 1 })).toBe(
      fingerprintStoryboardSnapshot({ a: 1, b: 2 })
    );
  });

  it("uses the same confirmation fingerprint shape as the server draft", () => {
    const normalized = normalizeStoryboardGlobalInput(base);
    const skill = {
      skillId: normalized.selectedSkillId,
      version: normalized.selectedSkillVersion,
      schemaHash: "a".repeat(64),
    };
    expect(buildStoryboardConfirmationFingerprint(normalized, skill)).toBe(
      fingerprintStoryboardSnapshot({
        normalized,
        skillId: skill.skillId,
        skillVersion: skill.version,
        schemaHash: skill.schemaHash,
      })
    );
  });

  it("parses dialogue rows without weakening the mime contract", () => {
    expect(
      parseStoryboardDialogueDraft("เด็ก: สวัสดี\nเล่าเรื่องต่อ", "th")
    ).toEqual([
      { speaker: "เด็ก", text: "สวัสดี", language: "th" },
      { speaker: "Narrator", text: "เล่าเรื่องต่อ", language: "th" },
    ]);
  });

  it("keeps lifecycle retries and cancellation fail-closed", () => {
    expect(isTerminalStoryboardRunStatus("succeeded")).toBe(true);
    expect(isTerminalStoryboardRunStatus("queued")).toBe(false);
    expect(isRetryableStoryboardShotStatus("failed")).toBe(true);
    expect(isRetryableStoryboardShotStatus("image_succeeded")).toBe(false);
  });

  it("redacts credentials and provider URLs", () => {
    expect(
      redactStoryboardValue({
        apiKey: "secret",
        provider_url: "https://x",
        prompt: "ok",
      })
    ).toEqual({
      apiKey: "[redacted]",
      provider_url: "[redacted]",
      prompt: "ok",
    });
  });

  it("preserves the complete canonical request without rebuilding it", () => {
    const response = storyboardCanonicalSkillResponseSchema.parse({
      success: true,
      result: {
        resolved: {},
        generation_prompt: "canonical prompt",
        generation_request: {
          prompt: "canonical prompt",
          aspect_ratio: "9:16",
          reference_images: [],
          quality: "xhigh",
        },
        prompt_debug: {},
      },
    });
    expect(
      assertCanonicalGenerationRequest(response).result.generation_request
        .quality
    ).toBe("xhigh");
  });
});
