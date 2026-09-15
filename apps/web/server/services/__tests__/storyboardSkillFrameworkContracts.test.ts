import { describe, expect, it } from "vitest";
import {
  assertCanonicalGenerationRequest,
  buildStoryboardConfirmationFingerprint,
  classifyStoryboardGenerationError,
  escalateStoryboardProviderFailure,
  fingerprintStoryboardSnapshot,
  isRetryableStoryboardShotStatus,
  isRepairableStoryboardShot,
  isReusableStoryboardImage,
  isStoryboardExecutionStopped,
  isTerminalStoryboardRunStatus,
  normalizeStoryboardGlobalInput,
  normalizeStoryboardReferenceValue,
  optimizeStoryboardPromptForConstraint,
  parseStoryboardDialogueDraft,
  redactStoryboardValue,
  mapStoryboardIdeaExpansionToSkillInputs,
  storyboardCanonicalSkillResponseSchema,
  storyboardIdeaExpansionSchema,
  STORYBOARD_DEFAULT_SHOTS,
  STORYBOARD_RECOVERY_INDEX_EXCLUDED_STATUSES,
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
  it("classifies policy failures for prompt repair and keeps transient failures reusable", () => {
    expect(classifyStoryboardGenerationError(new Error("provider rejected prompt for safety policy")).class).toBe("policy");
    expect(classifyStoryboardGenerationError(new Error("429 rate limit")).class).toBe("transient");
    expect(classifyStoryboardGenerationError(new Error("STORYBOARD_REFERENCE_ASSET_NOT_FOUND"))).toMatchObject({
      class: "permanent",
      code: "STORYBOARD_REFERENCE_INVALID",
      detail: "STORYBOARD_REFERENCE_ASSET_NOT_FOUND",
    });
    expect(classifyStoryboardGenerationError(new Error("insufficient credits for image generation"))).toMatchObject({
      class: "permanent",
      code: "STORYBOARD_INSUFFICIENT_CREDITS",
    });
    expect(optimizeStoryboardPromptForConstraint("A child helps a bird", "IMAGE_PROMPT_CONSTRAINT")).toContain("Constraint repair");
  });

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
    expect(isTerminalStoryboardRunStatus("cancelled")).toBe(true);
    expect(STORYBOARD_RECOVERY_INDEX_EXCLUDED_STATUSES).toEqual(["succeeded", "cancelled"]);
    expect(isTerminalStoryboardRunStatus("queued")).toBe(false);
    expect(isRetryableStoryboardShotStatus("failed")).toBe(true);
    expect(isStoryboardExecutionStopped("paused")).toBe(true);
    expect(isStoryboardExecutionStopped("cancel_requested")).toBe(true);
    expect(isStoryboardExecutionStopped("cancelled")).toBe(true);
    expect(isStoryboardExecutionStopped("running")).toBe(false);
    expect(isRetryableStoryboardShotStatus("image_succeeded")).toBe(false);
    expect(isReusableStoryboardImage({ status: "succeeded", imageAssetId: 42 })).toBe(true);
    expect(isReusableStoryboardImage({ status: "succeeded", imageAssetId: 42, suppressedResult: true })).toBe(false);
    expect(isReusableStoryboardImage({ status: "generating", imageAssetId: 42 })).toBe(false);
    expect(isReusableStoryboardImage({ status: "succeeded", imageAssetId: null })).toBe(false);
    expect(isRepairableStoryboardShot("failed", { class: "transient" })).toBe(true);
    expect(isRepairableStoryboardShot("failed", { class: "unknown" })).toBe(true);
    expect(classifyStoryboardGenerationError({ statusCode: 500, message: "provider failed" })).toMatchObject({
      class: "transient",
      code: "IMAGE_PROVIDER_TRANSIENT",
    });
    const ambiguous = classifyStoryboardGenerationError(
      new Error("connection reset after submission; token=should-not-leak")
    );
    expect(ambiguous.class).toBe("unknown");
    expect(ambiguous.message).not.toContain("should-not-leak");
    expect(ambiguous.detail).not.toContain("should-not-leak");
    expect(classifyStoryboardGenerationError(new Error("database unavailable"))).toMatchObject({
      class: "transient",
      code: "STORYBOARD_DEPENDENCY_TRANSIENT",
    });
    expect(escalateStoryboardProviderFailure({
      failure: classifyStoryboardGenerationError(new Error("502 provider failure")),
      providerSubmissionStarted: true,
      creditSettled: true,
    })).toMatchObject({
      class: "unknown",
      code: "STORYBOARD_PROVIDER_OPERATION_AMBIGUOUS",
    });
    expect(escalateStoryboardProviderFailure({
      failure: classifyStoryboardGenerationError(new Error("502 provider failure")),
      providerSubmissionStarted: false,
      creditSettled: false,
    }).class).toBe("transient");
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

  it("normalizes uploaded reference keys only when they are owner-scoped", () => {
    expect(normalizeStoryboardReferenceValue(
      "chat/uploads/tenant-a/24/file.png",
      "tenant-a",
      24,
    )).toBe("/api/storage/files/chat%2Fuploads%2Ftenant-a%2F24%2Ffile.png");
    expect(normalizeStoryboardReferenceValue(
      "chat/uploads/tenant-b/24/file.png",
      "tenant-a",
      24,
    )).toBeNull();
    expect(normalizeStoryboardReferenceValue(
      "/api/storage/files/tenant-a/file.png",
      "tenant-a",
      24,
    )).toBe("/api/storage/files/tenant-a/file.png");
  });

  it("requires all five structured idea sections and maps only matching skill fields", () => {
    const expansion = storyboardIdeaExpansionSchema.parse({
      projectTitle: "Cute Dinner",
      videoIdea: "Two toddlers share food and laugh through one continuous meal.",
      sceneDetail: "Warm dining room with large dishes in the foreground.",
      customActivity: "Taste noodles, feed each other, laugh, and look at the food.",
      customNotes: "Photorealistic, natural hands, soft daylight, vertical 9:16.",
    });
    expect(() =>
      storyboardIdeaExpansionSchema.parse({
        ...expansion,
        customNotes: "",
      })
    ).toThrow();

    expect(
      mapStoryboardIdeaExpansionToSkillInputs(
        expansion,
        {
          scene_detail: {},
          custom_activity: {},
          custom_notes: {},
          unrelated_field: {},
        },
        { unrelated_field: "preserve" },
      )
    ).toEqual({
      scene_detail: expansion.sceneDetail,
      custom_activity: expansion.customActivity,
      custom_notes: expansion.customNotes,
      unrelated_field: "preserve",
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
