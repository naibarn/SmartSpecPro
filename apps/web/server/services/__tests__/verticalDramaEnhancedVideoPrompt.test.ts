import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildEnhancedVariantStore,
  buildEnhancedSkillInput,
  buildEnhancedJobKey,
  buildEnhancedInputFingerprint,
  classifyEnhancedBridgeDiagnostic,
  getEnhancedBridgeDiagnosticMetadata,
  classifyEnhancedJobError,
  EnhancedVideoDirectorBridgeError,
  buildUnavailableEnhancedVideoPromptReadiness,
  evaluateEnhancedVideoPromptReadiness,
  getEnhancedBridgeResultValidationError,
  getEnhancedPromptSemanticValidationError,
  isEnhancedCapabilityCompatible,
  isEnhancedJobResultApplicable,
  normalizeEnhancedStoryboardShot,
  resolveEnhancedSpeakerForPrompt,
  selectEnhancedSpeakerIdentityCandidates,
  resolveEnhancedSpeakerIdentity,
  resolveEnhancedRuntimeFacts,
  validateEnhancedBridgeResult,
  type EnhancedVideoPromptReadinessInput,
} from "../verticalDramaEnhancedVideoPrompt";
import { resolveVerticalDramaSpeakerIdentity } from "@shared/verticalDramaSeries/castPositionLock";
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
    supportsFunctionTools: false,
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
  it("extracts safe diagnostic metadata from an unclassified bridge failure", () => {
    const metadata = getEnhancedBridgeDiagnosticMetadata(
      "ENHANCED_AGENT_FAILED: hidden details stage=terminal_prompt exception=RuntimeError",
    );

    expect(metadata).toMatchObject({
      diagnosticCode: "ENHANCED_AGENT_FAILED",
      diagnosticStage: "terminal_prompt",
    });
    expect(metadata.diagnosticFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata).not.toHaveProperty("message");
  });

  it("recognizes a safe diagnostic after SDK warnings without exposing stderr", () => {
    const result = classifyEnhancedBridgeDiagnostic(
      "private SDK warning\nENHANCED_PROVIDER_RATE_LIMIT: secret response omitted",
    );
    expect(result.code).toBe("BRIDGE_PROVIDER_RATE_LIMIT");
    expect(result.message).not.toContain("private");
    expect(result.message).not.toContain("secret");
  });

  it("distinguishes local speaker validation from a provider failure", () => {
    const result = classifyEnhancedBridgeDiagnostic(
      "ENHANCED_SPEAKER_POSITION_BINDING_FAILED: private dialogue",
    );
    expect(result.message).toContain("ENHANCED_SPEAKER_POSITION_BINDING_FAILED");
    expect(result.message).not.toContain("provider boundary");
    expect(result.message).not.toContain("private dialogue");
  });
  it("maps provider budget failures to a safe actionable message", () => {
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_PROVIDER_CREDIT_LIMIT: Provider credit limit reached; secret details omitted",
    )).toEqual({
      code: "BRIDGE_PROVIDER_CREDIT_LIMIT",
      message: expect.stringContaining("credit limit"),
    });
    expect(classifyEnhancedBridgeDiagnostic(
      "Traceback (/home/private/skill.py) ENHANCED_PROVIDER_CREDIT_LIMIT",
    ).code).toBe("BRIDGE_FAILED");
    expect(classifyEnhancedJobError(
      new EnhancedVideoDirectorBridgeError("BRIDGE_PROVIDER_CREDIT_LIMIT", "safe provider limit"),
    )).toMatchObject({ code: "blocked", message: "safe provider limit" });
  });

  it("classifies newly surfaced Agent and provider request diagnostics without leaking stderr", () => {
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_PROVIDER_REQUEST_FAILED: private provider response",
    )).toMatchObject({ code: "BRIDGE_FAILED" });
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_PROVIDER_REQUEST_FAILED: private provider response",
    ).message).not.toContain("private provider response");
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_AGENT_OUTPUT_INVALID: private model output",
    )).toMatchObject({ code: "BRIDGE_FAILED" });
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_AGENT_OUTPUT_INVALID: private model output",
    ).message).not.toContain("private model output");
    expect(classifyEnhancedBridgeDiagnostic(
      "ENHANCED_AGENT_MAX_TURNS: private details",
    ).message).not.toContain("private details");
  });

  it("treats bridge interruption and timeout as retryable worker failures", () => {
    const interrupted = new EnhancedVideoDirectorBridgeError(
      "BRIDGE_INTERRUPTED",
      "bridge interrupted during worker shutdown",
      { class: "retryable" },
    );
    const timedOut = new EnhancedVideoDirectorBridgeError(
      "BRIDGE_TIMEOUT",
      "bridge timed out",
      { class: "retryable" },
    );

    expect(classifyEnhancedJobError(interrupted)).toEqual({
      code: "retryable",
      message: interrupted.message,
    });
    expect(classifyEnhancedJobError(timedOut)).toEqual({
      code: "retryable",
      message: timedOut.message,
    });
    expect((interrupted as unknown as { class: string }).class).toBe("retryable");
  });

  it("preserves provider-qualified authoring routing metadata in the skill input", () => {
    const input = buildEnhancedSkillInput({
      shot: { shotNumber: 1, description: "A woman looks toward the window" },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: {
        ...baseInput.authoringModel,
        providerModelId: "openai/gpt-5.6-sol",
        apiStyle: "responses",
      },
    });
    expect(input.authoringModel).toMatchObject({
      id: "gpt-5.6-sol",
      providerModelId: "openai/gpt-5.6-sol",
      apiStyle: "responses",
      supportsFunctionTools: false,
    });
  });

  it("fails readiness closed for unsupported authoring provider transports", () => {
    expect(evaluateEnhancedVideoPromptReadiness({
      ...baseInput,
      authoringModel: {
        ...baseInput.authoringModel,
        apiStyle: "gemini",
      },
    }).reasons).toContain("AGENT_PROVIDER_TRANSPORT_UNSUPPORTED");
  });

  it("returns a non-throwing unavailable result for display-only preflight", () => {
    expect(buildUnavailableEnhancedVideoPromptReadiness()).toMatchObject({
      ready: false,
      reasons: ["SHOT_PRECONDITION_FAILED"],
      fallback: "none",
      targetVideoModelId: null,
      authoringModelId: null,
      estimatedCredits: null,
    });
  });
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
        source_beat_indexes: [0, 2],
        duration_seconds: 8,
      })
    ).toEqual({
      shotNumber: 1,
      description: "A boy opens a keepsake box",
      cameraSetup: "shot_type: medium_close_up, movement: subtle_push_in",
      characterIds: ["character-4-look-casual_home"],
      locationId: "บ้านของภาคิน",
      continuityNotes: ["Keep the box unchanged"],
      sourceBeatIndexes: [0, 2],
      durationSeconds: 8,
    });
  });

  it("normalizes camelCase source beat indexes and drops invalid entries", () => {
    expect(
      normalizeEnhancedStoryboardShot({
        shotNumber: 2,
        description: "A mother answers her son",
        sourceBeatIndexes: [1, "2", -1, 1.5],
      })
    ).toMatchObject({ sourceBeatIndexes: [1] });
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
    expect(input.videoPromptMaxChars).toBe(2000);
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
    expect(getEnhancedBridgeResultValidationError(valid, 10)).toBe(
      "prompt exceeds resolved 10-character target-model budget"
    );
  });

  it("includes the resolved model budget in the Enhanced input fingerprint", () => {
    const grok = buildEnhancedSkillInput({
      shot: { shot_number: 1, dialogue: [] },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: {
        ...baseInput.targetVideoModel,
        id: "grok-imagine-video-1-5-preview",
      },
      authoringModel: baseInput.authoringModel,
    });
    const omni = buildEnhancedSkillInput({
      shot: { shot_number: 1, dialogue: [] },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: {
        ...baseInput.targetVideoModel,
        id: "gemini-omni-flash-1-1",
      },
      authoringModel: baseInput.authoringModel,
    });

    expect(grok.videoPromptMaxChars).toBe(4096);
    expect(omni.videoPromptMaxChars).toBe(20_000);
    expect(buildEnhancedInputFingerprint(grok)).not.toBe(
      buildEnhancedInputFingerprint(omni)
    );
  });

  it("rejects legacy-style action coupling at the bridge boundary", () => {
    const input = buildEnhancedSkillInput({
      shot: {
        dialogue: [{ speaker: "ภูมิ", text: "แม่ วันนี้ผมจะวาดบ้านของเรา" }],
      },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: {
        ...baseInput.targetVideoModel,
        id: "grok-imagine-video-1-5-preview",
      },
      authoringModel: baseInput.authoringModel,
    });
    const invalid = {
      prompt: 'ภูมิ on viewer-left as they พิมพ์ชนกขยับปาก; ภูมิ says with a clear voice: "แม่ วันนี้ผมจะวาดบ้านของเรา"',
      terminalPromptHash: "a".repeat(64),
      skillVersion: "11.0.0",
      adapterVersion: "1.0.0",
      sdkVersion: "0.22.3",
    };
    expect(getEnhancedPromptSemanticValidationError(invalid, input)).toContain(
      "untrusted action"
    );
  });

  it("rejects canonical lines that are attached to the wrong speaker", () => {
    const input = buildEnhancedSkillInput({
      shot: {
        dialogue: [
          { speaker: "ภูมิ", text: "แม่ วันนี้ผมจะวาดบ้านของเรา" },
          { speaker: "พิมพ์ชนก", text: "ได้เลยลูก แต่อยู่ในสายตาแม่นะ" },
        ],
      },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: {
        ...baseInput.targetVideoModel,
        id: "grok-imagine-video-1-5-preview",
      },
      authoringModel: baseInput.authoringModel,
    });
    const swapped = {
      prompt: [
        'ภูมิ on viewer-left; ภูมิ says with a clear voice: "ได้เลยลูก แต่อยู่ในสายตาแม่นะ"',
        'พิมพ์ชนก on viewer-right; พิมพ์ชนก says with a clear voice: "แม่ วันนี้ผมจะวาดบ้านของเรา"',
      ].join("\n"),
      terminalPromptHash: "a".repeat(64),
      skillVersion: "11.0.0",
      adapterVersion: "1.0.0",
      sdkVersion: "0.22.3",
    };
    expect(getEnhancedPromptSemanticValidationError(swapped, input)).toContain(
      "not bound to speaker ภูมิ"
    );
  });

  it("accepts canonical lines bound by a shot-local character identity override", () => {
    const input = buildEnhancedSkillInput({
      shot: {
        dialogue: [{
          characterKey: "mother",
          speaker: "แม่",
          text: "ช่วยดูเอกสารนี้หน่อย",
        }],
      },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      characterDescriptionOverrides: {
        mother: "ผู้หญิงที่นั่งอยู่ สวมเสื้อสีครีม",
      },
    });
    const result = {
      prompt:
        'แม่ identified by ผู้หญิงที่นั่งอยู่ สวมเสื้อสีครีม; แม่ says with a clear voice: "ช่วยดูเอกสารนี้หน่อย"',
      terminalPromptHash: "a".repeat(64),
      skillVersion: "11.0.0",
      adapterVersion: "1.0.0",
      sdkVersion: "0.22.3",
    };

    expect(getEnhancedPromptSemanticValidationError(result, input)).toBeNull();
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

  it("carries shot-local character identity overrides into Enhanced skill input", () => {
    const overrides = {
      "character-2-look-casual_home":
        "ผู้หญิงที่นั่งอยู่ viewer-left สวมเสื้อสีครีม",
    };
    const input = buildEnhancedSkillInput({
      shot: { shot_number: 1, description: "A woman checks a folder" },
      continuity: {},
      mediaBundle: baseMediaBundle,
      targetVideoModel: baseInput.targetVideoModel,
      authoringModel: baseInput.authoringModel,
      characterDescriptionOverrides: overrides,
    } as any);

    expect(input.shot.characterDescriptionOverrides).toEqual(overrides);
  });
});


describe("Enhanced current-frame speaker candidates", () => {
  const roster = [
    { characterKey: "character", name: "พิมพ์ชนก" },
    { characterKey: "character-look-workwear", name: "พิมพ์ชนก" },
    { characterKey: "character-2-look-workwear", name: "ธีร์" },
    { characterKey: "character-6-look-workwear", name: "รินลดา" },
  ];
  it("resolves episode 259 shot 5's speaker to the approved frame look", () => {
    const candidates = selectEnhancedSpeakerIdentityCandidates({
      roster,
      storyboardCharacterKeys: ["character", "character-2-look-workwear", "character-6-look-workwear"],
      frameCharacterKeys: ["character-look-workwear", "character-2-look-workwear", "character-6-look-workwear"],
    });
    expect(resolveVerticalDramaSpeakerIdentity("พิมพ์ชนก", candidates)).toEqual({
      status: "resolved", characterKey: "character-look-workwear",
    });
    expect(candidates).toHaveLength(3);
  });
  it("keeps explicit screen callers in the candidate set", () => {
    const candidates = selectEnhancedSpeakerIdentityCandidates({
      roster, storyboardCharacterKeys: [],
      frameCharacterKeys: ["character-look-workwear"],
      screenCallerCharacterKeys: ["character-2-look-workwear"],
    });
    expect(resolveVerticalDramaSpeakerIdentity("ธีร์", candidates)).toEqual({
      status: "resolved", characterKey: "character-2-look-workwear",
    });
  });
  it("still rejects two selected people with the same name", () => {
    const candidates = selectEnhancedSpeakerIdentityCandidates({
      roster: [{ characterKey: "a", name: "ชื่อซ้ำ" }, { characterKey: "b", name: "ชื่อซ้ำ" }],
      storyboardCharacterKeys: [], frameCharacterKeys: ["a", "b"],
    });
    expect(resolveVerticalDramaSpeakerIdentity("ชื่อซ้ำ", candidates)).toEqual({ status: "ambiguous" });
  });
  it("falls back to storyboard keys only when frame references are absent", () => {
    const candidates = selectEnhancedSpeakerIdentityCandidates({ roster, storyboardCharacterKeys: ["character"] });
    expect(candidates).toEqual([roster[0]]);
  });
  it("does not admit the whole roster for an explicitly empty cast", () => {
    expect(selectEnhancedSpeakerIdentityCandidates({
      roster, storyboardCharacterKeys: ["character"], frameCharacterKeys: [],
    })).toEqual([]);
  });
});


it("maps canonical speaker keys through the user's selected look without guessing by name", () => {
  const candidates = [{ characterKey: "character-look-workwear", name: "พิมพ์ชนก" }];
  expect(resolveEnhancedSpeakerIdentity("character", candidates, [
    { baseCharacterKey: "character", selectedLookKey: "character-look-workwear" },
  ])).toEqual({ status: "resolved", characterKey: "character-look-workwear" });
  expect(resolveEnhancedSpeakerIdentity("character", candidates)).toEqual({ status: "missing" });
});

it("keeps an authored speaker outside the selected shot cast as off-screen metadata", () => {
  expect(resolveEnhancedSpeakerForPrompt({
    authoredSpeaker: "ธีร์",
    candidates: [{ characterKey: "pimchanok", name: "พิมพ์ชนก" }],
  })).toEqual({
    status: "offscreen",
    characterKey: "ธีร์",
    offscreen: true,
  });
});

it("still fails closed when a speaker matches multiple selected identities", () => {
  expect(resolveEnhancedSpeakerForPrompt({
    authoredSpeaker: "ชื่อซ้ำ",
    candidates: [
      { characterKey: "look-a", name: "ชื่อซ้ำ" },
      { characterKey: "look-b", name: "ชื่อซ้ำ" },
    ],
  })).toEqual({ status: "ambiguous" });
});

it("rejects conflicting selected-look assignments and preserves exact selected keys", () => {
  const candidates = [
    { characterKey: "look-a", name: "same" },
    { characterKey: "look-b", name: "same" },
  ];
  const assignments = [
    { baseCharacterKey: "base", selectedLookKey: "look-a" },
    { baseCharacterKey: "base", selectedLookKey: "look-b" },
  ];
  expect(resolveEnhancedSpeakerIdentity("base", candidates, assignments)).toEqual({ status: "ambiguous" });
  expect(resolveEnhancedSpeakerIdentity("look-a", candidates, assignments)).toEqual({ status: "resolved", characterKey: "look-a" });
});
