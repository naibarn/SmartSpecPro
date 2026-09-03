import { describe, expect, it } from "vitest";
import {
  VIDEO_PROMPT_VARIANT_STORE_VERSION,
  applyVideoPromptVariant,
  buildLegacyVideoPromptVariant,
  buildEnhancedOnlyVideoPromptVariantStore,
  buildVideoPromptVariantStore,
  computeVideoPromptVariantFingerprint,
  readVideoPromptVariantStore,
  mergeVideoPromptVariantStore,
  preserveVideoPromptVariantsOnLegacyReplacement,
  preserveVideoPromptVariantsOnPackReplacement,
  markEnhancedVideoPromptVariantsStale,
  invalidateVideoPromptVariantsOnInputChange,
  validateVideoPromptVariantForApply,
} from "./videoPromptVariants";

const legacyClip = {
  prompt: "A woman turns toward the window.",
  negativeMotionPrompt: "no jump cuts",
  dialogue: [{ speaker: "Mali", text: "กลับบ้านกันเถอะ" }],
  audioDirection: "soft room tone",
  promptModelTarget: { modelId: "veo-3", family: "veo", generatedAt: "2026-09-01T00:00:00.000Z" },
  frameAnalysis: { people: [{ name: "Mali", position: "left" }] },
  castPositionLock: { Mali: "left" },
  motionProfile: { camera: "slow push-in" },
  effectiveRisk: "low",
  motionContractStatus: "ready",
  promptQuality: { score: 91 },
  selectedVideoModelId: "veo-3",
};

function enhancedVariant() {
  return {
    variantId: "enhanced" as const,
    status: "ready" as const,
    prompt: "Preserve the opening frame, then use a restrained push-in as Mali turns toward the window.",
    negativeMotionPrompt: "no identity drift, no jump cuts",
    dialogue: legacyClip.dialogue,
    audioDirection: legacyClip.audioDirection,
    promptModelTarget: legacyClip.promptModelTarget,
    frameAnalysis: legacyClip.frameAnalysis,
    castPositionLock: legacyClip.castPositionLock,
    motionProfile: legacyClip.motionProfile,
    effectiveRisk: legacyClip.effectiveRisk,
    motionContractStatus: legacyClip.motionContractStatus,
    promptQuality: { score: 98 },
    mediaBundle: {
      contractVersion: "vd-shot-media/1",
      bundleRevision: 3,
      startFrame: null,
      stopFrame: null,
      references: [],
      bundleFingerprint: "b".repeat(64),
    },
    sourceImageModelId: "image-model-1",
    authoringModelId: "authoring-model-1",
    targetVideoModelId: "veo-3",
    targetModelSnapshot: { providerFamily: "veo", modelKey: "veo-3" },
    targetModelFingerprint: "c".repeat(64),
    providerProfileId: "profile-veo-3",
    providerPlanHash: "d".repeat(64),
    inputFingerprint: "e".repeat(64),
    terminalPromptHash: "f".repeat(64),
    skillVersion: "11.0.0",
    adapterVersion: "1.0.0",
    sdkVersion: "0.22.0",
    warnings: [],
    assumptions: [],
    researchProvenance: [],
    revision: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("video prompt variant contract", () => {
  it("reads a missing store as legacy without changing the active projection", () => {
    const result = readVideoPromptVariantStore(undefined, legacyClip);
    expect(result.kind).toBe("legacy_compatibility");
    expect(result.activeVariant).toBe("legacy");
    expect(result.activeProjection.prompt).toBe(legacyClip.prompt);
  });

  it("quarantines malformed and future stores instead of treating them as success", () => {
    const malformed = readVideoPromptVariantStore({ version: VIDEO_PROMPT_VARIANT_STORE_VERSION, activeVariant: "enhanced" }, legacyClip);
    const future = readVideoPromptVariantStore({ version: "vd-video-prompt-variants/99", activeVariant: "enhanced" }, legacyClip);
    expect(malformed.kind).toBe("invalid");
    expect(future.kind).toBe("invalid");
    expect(malformed.activeProjection.prompt).toBe(legacyClip.prompt);
    expect(future.activeProjection.prompt).toBe(legacyClip.prompt);
  });

  it("builds a lazy Legacy snapshot and keeps it byte-equivalent to the source bundle", () => {
    const legacy = buildLegacyVideoPromptVariant({
      clip: legacyClip,
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    expect(legacy.variantId).toBe("legacy");
    expect(legacy.prompt).toBe(legacyClip.prompt);
    expect(legacy.negativeMotionPrompt).toBe(legacyClip.negativeMotionPrompt);
    expect(legacy.dialogue).toEqual(legacyClip.dialogue);
    expect(legacy.status).toBe("ready");
  });

  it("merges Enhanced into a store without changing active Legacy", () => {
    const result = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.activeVariant).toBe("legacy");
    expect(result.variants.legacy?.prompt).toBe(legacyClip.prompt);
    expect(result.variants.enhanced?.prompt).toContain("restrained push-in");
  });

  it("supports an Enhanced-only clip without manufacturing a Legacy prompt", () => {
    const store = buildEnhancedOnlyVideoPromptVariantStore({
      enhanced: enhancedVariant(),
    });
    const result = readVideoPromptVariantStore(store, {
      clipNumber: 4,
      sourceShotNumbers: [4],
    });
    expect(store.activeVariant).toBe("enhanced");
    expect(store.variants.legacy).toBeUndefined();
    expect(result.kind).toBe("ready");
    expect(result.activeVariant).toBe("enhanced");
    expect(result.activeProjection.prompt).toContain("restrained push-in");
  });

  it("moves the complete bundle on Apply and rejects stale Enhanced metadata", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const ready = validateVideoPromptVariantForApply(store, "enhanced", {
      targetVideoModelId: "veo-3",
      targetModelFingerprint: "c".repeat(64),
      mediaBundleFingerprint: "b".repeat(64),
      expectedRevision: 1,
    });
    expect(ready.ok).toBe(true);
    const applied = applyVideoPromptVariant(legacyClip, store, "enhanced", { expectedRevision: 1 });
    expect(applied.activeVariant).toBe("enhanced");
    expect(applied.projection.prompt).toContain("restrained push-in");
    expect(applied.projection.negativeMotionPrompt).toContain("identity drift");
    expect(validateVideoPromptVariantForApply(store, "enhanced", {
      targetVideoModelId: "other-model",
      targetModelFingerprint: "c".repeat(64),
      mediaBundleFingerprint: "b".repeat(64),
      expectedRevision: 1,
    }).ok).toBe(false);
  });

  it("preserves unknown clip fields and the other variant on a clip-scoped merge", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const merged = mergeVideoPromptVariantStore({
      clip: { ...legacyClip, futureField: { keep: true } },
      existing: store,
      patch: { variants: { enhanced: { ...enhancedVariant(), prompt: "edited" } } },
    });
    expect(merged.variants.legacy?.prompt).toBe(legacyClip.prompt);
    expect(merged.variants.enhanced?.prompt).toBe("edited");
  });

  it("produces a stable fingerprint independent of object key order", () => {
    const one = computeVideoPromptVariantFingerprint({ prompt: "x", targetVideoModelId: "m", revision: 1 });
    const two = computeVideoPromptVariantFingerprint({ revision: 1, targetVideoModelId: "m", prompt: "x" });
    expect(one).toBe(two);
    expect(one).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves Enhanced history when a Legacy writer replaces the clip", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const replaced = preserveVideoPromptVariantsOnLegacyReplacement({
      previousClip: { ...legacyClip, videoPromptVariants: store },
      nextClip: { ...legacyClip, prompt: "new Legacy prompt" },
      selectedVideoModelId: "veo-3",
      now: "2026-09-01T00:01:00.000Z",
    });
    const next = readVideoPromptVariantStore(replaced.videoPromptVariants, replaced);
    expect(next.kind).toBe("ready");
    expect(next.activeVariant).toBe("legacy");
    expect(next.activeProjection.prompt).toBe("new Legacy prompt");
    expect(next.store?.variants.enhanced?.prompt).toContain("restrained push-in");
    expect(next.store?.variants.enhanced?.status).toBe("stale");
  });

  it("preserves stores across whole-pack Legacy replacement and marks canonical changes stale", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const next = preserveVideoPromptVariantsOnPackReplacement({
      previousPack: { clips: [{ ...legacyClip, clipNumber: 1, videoPromptVariants: store }] },
      nextPack: { selectedVideoModelId: "veo-3", clips: [{ ...legacyClip, clipNumber: 1, prompt: "new legacy" }] },
      now: "2026-09-01T00:01:00.000Z",
    });
    expect(next.clips[0].videoPromptVariants?.activeVariant).toBe("legacy");
    expect(next.clips[0].videoPromptVariants?.variants.enhanced?.status).toBe("stale");
    const stale = markEnhancedVideoPromptVariantsStale({ clips: next.clips });
    expect(stale.clips[0].videoPromptVariants?.variants.enhanced?.status).toBe("stale");
  });

  it("marks known renders mismatched and legacy renders unknown when Apply changes projection", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const rendered = { ...legacyClip, videoTask: { videoUrl: "https://cdn.test/clip.mp4" } };
    const applied = applyVideoPromptVariant(rendered, store, "enhanced", { expectedRevision: 1 });
    expect(applied.projection.videoTask?.provenanceUnknown).toBe(true);
    const known = { ...rendered, videoTask: { videoUrl: "https://cdn.test/clip.mp4", promptProvenance: { variantId: "legacy", promptHash: computeVideoPromptVariantFingerprint({ prompt: legacyClip.prompt }), capturedAt: "2026-09-01T00:00:00.000Z" } } };
    const knownApplied = applyVideoPromptVariant(known, store, "enhanced", { expectedRevision: 1 });
    expect(knownApplied.projection.videoTask?.promptMismatch).toBe(true);
  });

  it("retains an opted-in clip when approved visual input changes", () => {
    const store = buildVideoPromptVariantStore({
      clip: legacyClip,
      enhanced: enhancedVariant(),
      selectedVideoModelId: "veo-3",
      inputFingerprint: "1".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const invalidated = invalidateVideoPromptVariantsOnInputChange(
      { ...legacyClip, videoPromptVariants: store, videoTask: { videoUrl: "https://cdn.test/clip.mp4" } },
      "approved_start_frame_changed",
      "2026-09-01T00:02:00.000Z",
    );
    expect(invalidated.promptStaleReason).toBe("approved_start_frame_changed");
    expect(invalidated.videoPromptVariants?.variants.enhanced?.status).toBe("stale");
    expect(invalidated.videoTask?.provenanceUnknown).toBe(true);
  });
});
