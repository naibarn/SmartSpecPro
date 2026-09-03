import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildEnhancedVariantStore,
  buildEnhancedSkillInput,
  buildEnhancedJobKey,
  buildEnhancedInputFingerprint,
  evaluateEnhancedVideoPromptReadiness,
  getEnhancedBridgeResultValidationError,
  isEnhancedCapabilityCompatible,
  isEnhancedJobResultApplicable,
  normalizeEnhancedStoryboardShot,
  resolveEnhancedRuntimeFacts,
  validateEnhancedBridgeResult,
  type EnhancedVideoPromptReadinessInput,
} from "../verticalDramaEnhancedVideoPrompt";
import type { VideoShotMediaBundle } from "@shared/verticalDramaShotMedia";

const h3FrameModes = {
  textToVideo: {
    id: "text-to-video",
    acceptsStartFrame: false,
    acceptsStopFrame: false,
    acceptsReferenceImages: false,
    acceptsReferenceVideos: false,
    acceptsReferenceAudio: false,
    allowsMixedReferences: false,
    maxImages: 0,
    maxVideos: 0,
    maxAudio: 0,
    maxTotalReferences: 0,
    maxPayloadBytes: null,
    maxVideoDurationSec: 15,
    startFrameConsumesImageSlot: false,
    requiresVisualReferenceForAudio: false,
    supportedReferenceRoles: [],
    preservesStartStopSemanticsWithReferences: false,
    transport: "kie" as const,
    nativeFieldMap: {},
  },
  imageToVideo: {
    id: "image-to-video",
    acceptsStartFrame: true,
    acceptsStopFrame: true,
    acceptsReferenceImages: false,
    acceptsReferenceVideos: false,
    acceptsReferenceAudio: false,
    allowsMixedReferences: false,
    maxImages: 0,
    maxVideos: 0,
    maxAudio: 0,
    maxTotalReferences: 0,
    maxPayloadBytes: null,
    maxVideoDurationSec: 15,
    startFrameConsumesImageSlot: false,
    requiresVisualReferenceForAudio: false,
    supportedReferenceRoles: [],
    preservesStartStopSemanticsWithReferences: true,
    transport: "kie" as const,
    nativeFieldMap: {
      startFrame: "first_frame_url",
      stopFrame: "last_frame_url",
    },
  },
};

const minimaxH3CapabilityProfile = {
  providerFamily: "minimax-h3",
  modelKey: "minimax-h3",
  displayName: "MiniMax H3",
  capabilityProfileVersion: "minimax-h3/1",
  capabilitySource: "provider_manifest" as const,
  modes: [h3FrameModes.textToVideo, h3FrameModes.imageToVideo],
};

const geminiOmniFlashCapabilityProfile = {
  providerFamily: "gemini-omni",
  modelKey: "gemini-omni-flash-1-1",
  displayName: "Gemini Omni Flash 1.1",
  capabilityProfileVersion: "gemini-omni/1",
  capabilitySource: "runtime_catalog" as const,
  modes: [
    {
      ...h3FrameModes.imageToVideo,
      id: "mixed-references",
      acceptsReferenceImages: true,
      acceptsReferenceVideos: true,
      acceptsReferenceAudio: true,
      allowsMixedReferences: true,
      maxImages: 7,
      maxVideos: 1,
      maxAudio: 3,
      maxTotalReferences: null,
      supportedReferenceRoles: [
        "reference",
        "character",
        "location",
        "prop",
        "style",
        "continuity",
        "action",
        "barrier_reference",
        "soundscape",
      ],
      nativeFieldMap: {
        startFrame: "first_frame_url",
        stopFrame: "last_frame_url",
        images: "image_urls",
      },
    },
  ],
};

const framePairBundle = {
  contractVersion: "vd-shot-media/1",
  bundleRevision: 5,
  startFrame: {
    assetId: 101,
    mediaType: "image" as const,
    mediaFingerprint: "a".repeat(64),
    resolvedAt: "2026-09-03T00:00:00.000Z",
  },
  stopFrame: {
    assetId: 102,
    mediaType: "image" as const,
    mediaFingerprint: "b".repeat(64),
    resolvedAt: "2026-09-03T00:00:00.000Z",
  },
  references: [
    {
      referenceId: "continuity-1",
      assetId: 103,
      mediaType: "image" as const,
      role: "reference" as const,
      source: "previous_main" as const,
      order: 0,
      label: "CONTINUITY_REFERENCE",
      mediaFingerprint: "c".repeat(64),
    },
  ],
  bundleFingerprint: "d".repeat(64),
} satisfies VideoShotMediaBundle;

const baseMediaBundle = {
  contractVersion: "vd-shot-media/1",
  bundleRevision: 4,
  startFrame: null,
  stopFrame: null,
  references: [],
  bundleFingerprint: "b".repeat(64),
} as VideoShotMediaBundle;

const baseInput: EnhancedVideoPromptReadinessInput = {
  flags: { ui: true, jobs: true, apply: true },
  runtime: {
    packageVersion: "11.0.0",
    manifestHash: "manifest",
    sdkVersion: "0.22.3",
    adapterVersion: "1.0.0",
    bridgeAvailable: true,
    allowListEnforced: true,
    manifestHashApproved: true,
  },
  authoringModel: {
    id: "gpt-5.6-sol",
    enabled: true,
    visionCapable: true,
    structuredOutputsCapable: true,
  },
  targetVideoModel: {
    id: "veo-3.1",
    enabled: true,
    capabilityFingerprint: "a".repeat(64),
    providerProfileId: "veo-profile",
    capabilitySnapshot: { providerFamily: "veo", modelKey: "veo-3.1" },
  },
  mediaBundle: baseMediaBundle,
  tenantAuthorized: true,
  storyboardReady: true,
};

describe("vertical drama Enhanced prompt boundary", () => {
  it("does not require Legacy prompt content for Enhanced authoring", () => {
    const input = buildEnhancedSkillInput({
      shot: { shotNumber: 2, description: "A woman reads a document" },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      researchMode: "off",
    });
    expect(input.shot.shotNumber).toBe(2);
    expect(input).not.toHaveProperty("legacyPrompt");
  });

  it("persists Enhanced first without creating a Legacy variant", () => {
    const skillInput = buildEnhancedSkillInput({
      shot: { shotNumber: 4, description: "A woman reads a document" },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      researchMode: "off",
    });
    const store = buildEnhancedVariantStore({
      clip: { clipNumber: 4, sourceShotNumbers: [4], prompt: "" },
      skillInput,
      bridge: {
        prompt: "Preserve the approved opening frame while she reads.",
        terminalPromptHash: "1".repeat(64),
        skillVersion: "11.0.0",
        adapterVersion: "1.0.0",
        sdkVersion: "0.22.3",
      },
      targetModelFingerprint: "2".repeat(64),
      providerProfileId: "veo-profile",
      providerPlanHash: "3".repeat(64),
    });
    expect(store.activeVariant).toBe("enhanced");
    expect(store.variants.legacy).toBeUndefined();
    expect(store.variants.enhanced?.prompt).toContain("approved opening frame");
  });

  it("allows Enhanced readiness for MiniMax H3 Start+Stop authoring with prompt-only references", () => {
    expect(
      isEnhancedCapabilityCompatible({
        model: {
          id: "minimax-h3",
          enabled: true,
          capabilityFingerprint: "e".repeat(64),
          providerProfileId: "minimax-h3",
          capabilitySnapshot: minimaxH3CapabilityProfile,
        },
        mediaBundle: framePairBundle,
      })
    ).toBe(true);
  });

  it("allows Enhanced readiness for Gemini Omni Flash with Start+Stop and references", () => {
    expect(
      isEnhancedCapabilityCompatible({
        model: {
          id: "gemini-omni-flash-1-1",
          enabled: true,
          capabilityFingerprint: "f".repeat(64),
          providerProfileId: "google/gemini-omni-flash-1-1",
          capabilitySnapshot: geminiOmniFlashCapabilityProfile,
        },
        mediaBundle: framePairBundle,
      })
    ).toBe(true);
  });

  it("normalizes persisted snake_case storyboard shots for readiness", () => {
    expect(
      normalizeEnhancedStoryboardShot({
        shot_number: 1,
        visual_description: "A boy opens a keepsake box",
        camera: { shot_type: "medium_close_up", movement: "subtle_push_in" },
        characters: ["character-4-look-casual_home"],
        location: "บ้านของภาคิน",
        continuity_notes: ["Keep the box unchanged"],
        duration_seconds: 8,
      })
    ).toEqual({
      shotNumber: 1,
      description: "A boy opens a keepsake box",
      cameraSetup: "shot_type: medium_close_up, movement: subtle_push_in",
      characterIds: ["character-4-look-casual_home"],
      locationId: "บ้านของภาคิน",
      continuityNotes: ["Keep the box unchanged"],
      durationSeconds: 8,
    });
  });

  it("is ready only when all runtime, flag, model, and media gates pass", () => {
    expect(evaluateEnhancedVideoPromptReadiness(baseInput)).toMatchObject({
      ready: true,
      reasons: [],
    });
    expect(
      evaluateEnhancedVideoPromptReadiness({
        ...baseInput,
        runtime: { ...baseInput.runtime, bridgeAvailable: false },
      })
    ).toMatchObject({ ready: false, reasons: ["AGENT_SDK_UNAVAILABLE"] });
    expect(
      evaluateEnhancedVideoPromptReadiness({
        ...baseInput,
        targetVideoModel: { ...baseInput.targetVideoModel, enabled: false },
      })
    ).toMatchObject({
      ready: false,
      reasons: ["PROVIDER_CAPABILITY_MISMATCH"],
    });
  });

  it("deduplicates readiness reasons when multiple provider gates fail", () => {
    const result = evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      targetVideoModel: {
        ...baseInput.targetVideoModel,
        enabled: false,
      },
      capabilityReady: false,
    });
    expect(result.reasons).toEqual(["PROVIDER_CAPABILITY_MISMATCH"]);
  });

  it("does not silently substitute Legacy when Enhanced jobs are disabled", () => {
    const result = evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      flags: { ...baseInput.flags, jobs: false },
    });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("ENHANCED_JOBS_DISABLED");
    expect(result.fallback).toBe("none");
  });

  it("keeps Apply available for a stored variant when job admission is disabled", () => {
    const result = evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      flags: { ui: true, jobs: false, apply: true },
      operation: "apply",
    });
    expect(result.ready).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("requires an approved package manifest for new Agent work", () => {
    const result = evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      runtime: { ...baseInput.runtime, manifestHashApproved: false },
    });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("AGENT_RUNTIME_NOT_READY");
  });

  it("fails closed when the authoring model cannot guarantee structured output", () => {
    const result = evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      authoringModel: {
        ...baseInput.authoringModel,
        structuredOutputsCapable: false,
      },
    });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("AGENT_STRUCTURED_OUTPUT_REQUIRED");
  });

  it("resolves rollout state from UI/database settings and runtime probe facts", () => {
    const facts = resolveEnhancedRuntimeFacts({
      settings: {
        enabled: true,
        approvedManifestHash: "hash-1",
        approvedSdkVersion: "0.22.3",
        approvedAdapterVersion: "1.0.0",
      },
      probe: {
        bridgeAvailable: true,
        sdkVersion: "0.22.3",
        adapterVersion: "1.0.0",
      },
    });
    expect(facts.allowListEnforced).toBe(true);
    expect(facts.bridgeAvailable).toBe(true);
    expect(facts.manifestHashApproved).toBe(false);
  });

  it("builds locked routing with one target and no Agent fallback authority", () => {
    const input = buildEnhancedSkillInput({
      shot: {
        shotNumber: 2,
        storyBeat: "Mali opens the door",
        dialogue: [{ speaker: "Mali", text: "ไปกันเถอะ" }],
        frameAnalysis: {
          people: [
            { name: "Mali", position: "left", action: "holding the handle" },
          ],
        },
      },
      continuity: { previous: "hand on knob", next: "door open" },
      mediaBundle: baseInput.mediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      researchMode: "off",
    });
    expect(input.modelRouting).toEqual({
      mode: "locked",
      preferredModels: ["veo-3.1"],
      fallbackModels: [],
      allowCrossProviderFallback: false,
    });
    expect(input.generationMode).toBe("plan_only");
    expect(input.dialogue).toEqual([{ speaker: "Mali", text: "ไปกันเถอะ" }]);
    expect(input.shot.frameAnalysis).toEqual({
      people: [
        { name: "Mali", position: "left", action: "holding the handle" },
      ],
    });
    expect(input.mediaBundle.bundleFingerprint).toBe(
      baseInput.mediaBundle.bundleFingerprint
    );
  });

  it("uses an operation-scoped, tenant/shot/idempotency job key", () => {
    expect(
      buildEnhancedJobKey({
        tenantId: "t1",
        userId: "u1",
        seriesId: 2,
        episodeId: 3,
        shotNumber: 4,
        variantId: "enhanced",
        operation: "generate",
        idempotencyKey: "idem",
      })
    ).toBe("vd-enhanced:t1:u1:2:3:4:enhanced:generate:idem");
  });

  it("fails closed for bridge metadata or terminal hash drift", () => {
    const prompt = "START FRAME LOCK: continue from the approved frame.";
    const valid = {
      prompt,
      terminalPromptHash: "" as string,
      skillVersion: "11.0.0",
      adapterVersion: "1.0.0",
      sdkVersion: "0.22.0",
      inputTokens: 10,
      outputTokens: 20,
    };
    valid.terminalPromptHash = createHash("sha256")
      .update(prompt)
      .digest("hex");
    expect(validateEnhancedBridgeResult(valid)).toBe(true);
    expect(
      validateEnhancedBridgeResult({
        ...valid,
        terminalPromptHash: "f".repeat(64),
      })
    ).toBe(false);
    expect(
      validateEnhancedBridgeResult({ ...valid, sdkVersion: "0.21.1" })
    ).toBe(false);
    expect(validateEnhancedBridgeResult({ ...valid, prompt: "" })).toBe(false);
    expect(
      getEnhancedBridgeResultValidationError({ ...valid, audioDirection: null })
    ).toBe("audioDirection must be a string when present");
    expect(getEnhancedBridgeResultValidationError(valid)).toBeNull();
  });

  it("rejects late results when revision or input fingerprint changed", () => {
    expect(
      isEnhancedJobResultApplicable({
        expectedRevision: 3,
        currentRevision: 3,
        expectedInputFingerprint: "a",
        currentInputFingerprint: "a",
        flagEnabled: true,
      })
    ).toBe(true);
    expect(
      isEnhancedJobResultApplicable({
        expectedRevision: 3,
        currentRevision: 4,
        expectedInputFingerprint: "a",
        currentInputFingerprint: "a",
        flagEnabled: true,
      })
    ).toBe(false);
    expect(
      isEnhancedJobResultApplicable({
        expectedRevision: 3,
        currentRevision: 3,
        expectedInputFingerprint: "a",
        currentInputFingerprint: "b",
        flagEnabled: true,
      })
    ).toBe(false);
  });

  it("differentiates input fingerprints when nativeAudioEnabled changes", () => {
    const offInput = buildEnhancedSkillInput({
      shot: { shot_number: 1, dialogue: [] },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      nativeAudioEnabled: false,
    });
    const onInput = buildEnhancedSkillInput({
      shot: { shot_number: 1, dialogue: [] },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      nativeAudioEnabled: true,
    });

    const hashOff = buildEnhancedInputFingerprint(offInput);
    const hashOn = buildEnhancedInputFingerprint(onInput);

    expect(hashOff).toBeTruthy();
    expect(hashOn).toBeTruthy();
    expect(hashOff).not.toEqual(hashOn);
  });

  it("preserves dialogue lines with Thai text and speaker names in buildEnhancedSkillInput", () => {
    const thaiDialogue = [
      {
        lineId: "line-1",
        characterKey: "thanwa",
        speaker: "ธันวา",
        speakerHint: "ธันวา",
        text: "พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น",
        lineTh: "พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น",
        emotion: "ดีใจเบาๆ ปัดฝุ่น",
      },
      {
        lineId: "line-2",
        characterKey: "thanwa",
        speaker: "ธันวา",
        speakerHint: "ธันวา",
        text: "จ่ายแพง ก็หาเงินไป",
        lineTh: "จ่ายแพง ก็หาเงินไป",
        emotion: "ตัดสินใจเด็ดขาดผสมแฝงความเหนื่อย",
      },
    ];

    const input = buildEnhancedSkillInput({
      shot: { shot_number: 1, dialogue: thaiDialogue },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      nativeAudioEnabled: true,
    });

    expect(input.dialogue).toHaveLength(2);
    expect((input.dialogue as any[])[0].text).toBe("พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น");
    expect((input.dialogue as any[])[0].speaker).toBe("ธันวา");
    expect((input.dialogue as any[])[1].text).toBe("จ่ายแพง ก็หาเงินไป");
    expect((input.shot.dialogue as any[])[0].text).toBe("พอแล้ว วันนี้เป็นโชคเกินไปแบบนั้น");
  });
});
