import { describe, expect, it } from "vitest";
import {
  buildArticleStoryboardRequiredFeatureFlags,
  buildArticleStoryboardVideoPreview,
  buildArticleStoryboardVideoShotPlans,
  containsUnsafeProviderMetadata,
  DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS,
  getPrimaryBuilderAudioStrategies,
  markArticleStoryboardReferencesChanged,
  resolveArticleStoryboardAudioStrategy,
  type ArticleStoryboardReferenceImage,
  type ArticleStoryboardValidationContext,
} from "../index";

const sceneReference: ArticleStoryboardReferenceImage = {
  id: "scene-1",
  url: "https://cdn.example.com/scene-1.jpg",
  source: "generated_3x3",
  safetyStatus: "approved",
  confirmed: true,
};

const characterReference: ArticleStoryboardReferenceImage = {
  id: "char-1",
  url: "https://cdn.example.com/char-1.png",
  source: "character",
  safetyStatus: "approved",
  confirmed: true,
};

const enabledFlags = {
  presentationArticleStoryboardVideo: true,
  presentationArticleStoryboardVideoPreview: true,
  presentationArticleStoryboardVideoOverlay: true,
  presentationArticleStoryboardVideoReferenceFrames: true,
  presentationArticleStoryboardVideoCharacterReferences: true,
  presentationArticleStoryboardVideoSeedancePrompt: true,
  presentationArticleStoryboardVideoVoiceScript: true,
  presentationArticleStoryboardVideoUvoiceVoiceover: true,
  presentationArticleStoryboardVideoElevenLabsDialogue: true,
  presentationArticleStoryboardVideoNativeAudio: true,
  presentationArticleStoryboardVideoNativeAudioPromptComposer: true,
};

const baseContext: ArticleStoryboardValidationContext = {
  featureFlags: enabledFlags,
  requiredFlags: ["presentationArticleStoryboardVideo"],
  videoModel: {
    provider: "higgsfield",
    modelId: "seedance",
    accessible: true,
    supportsNativeAudio: true,
    supportedSpeechLanguages: ["th-TH"],
  },
  voiceModel: {
    provider: "uvoice_premium",
    modelId: "uvoice-premium",
    accessible: true,
    available: true,
  },
  requestedAudioStrategy: "separate_tts_voiceover",
  voiceConfig: {
    mode: "single_narrator",
    provider: "uvoice_premium",
    voiceModelId: "uvoice-premium",
    speakers: [{ speaker: "Narrator", voiceModelId: "uvoice-premium", voiceId: "TH-KantapongPremiumHD" }],
  },
  requiredSkills: { seedancePrompt: true, voiceScript: true },
  creditEstimateAvailable: true,
};

describe("article storyboard video shared planning", () => {
  it("creates exactly one shot per article page with default 5-second timing", () => {
    const shots = buildArticleStoryboardVideoShotPlans({
      pages: [
        { id: "p1", pageNumber: 1, title: "First page", keyText: "Point one" },
        { id: "p2", pageNumber: 2, title: "Second page", keyText: "Point two" },
      ],
    });

    expect(shots).toHaveLength(2);
    expect(shots.map((shot) => shot.durationSeconds)).toEqual([
      DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS,
      DEFAULT_ARTICLE_STORYBOARD_SHOT_DURATION_SECONDS,
    ]);
    expect(shots[0]?.overlay.headline).toBe("First page");
  });

  it("returns a blocked preview reason for an empty page list", () => {
    const preview = buildArticleStoryboardVideoPreview([], baseContext);
    expect(preview.accessDecision.allowed).toBe(false);
    expect(preview.accessDecision.reasonCode).toBe("missing_pages");
  });

  it("validates selected scene references independently from character references", () => {
    const shots = buildArticleStoryboardVideoShotPlans({
      pages: [{ id: "p1", title: "Story", body: "Body" }],
      selectedReferenceImagesByPageId: { p1: [sceneReference] },
      characterReferenceImagesByPageId: { p1: [characterReference] },
    });

    const preview = buildArticleStoryboardVideoPreview(shots, baseContext);
    expect(preview.accessDecision.allowed).toBe(true);
    expect(shots[0]?.selectedReferenceImages).toHaveLength(1);
    expect(shots[0]?.characterReferenceImages).toHaveLength(1);
  });

  it("blocks selected scene references outside the 1-5 range", () => {
    const references = Array.from({ length: 6 }, (_, index) => ({
      ...sceneReference,
      id: `scene-${index}`,
    }));
    const shots = buildArticleStoryboardVideoShotPlans({
      pages: [{ id: "p1", title: "Story", body: "Body" }],
      selectedReferenceImagesByPageId: { p1: references },
    });

    const preview = buildArticleStoryboardVideoPreview(shots, baseContext);
    expect(preview.accessDecision.allowed).toBe(false);
    expect(preview.accessDecision.reasonCode).toBe("reference_count_invalid");
  });

  it("marks character reference changes as candidate-sheet and prompt stale", () => {
    const [shot] = buildArticleStoryboardVideoShotPlans({
      pages: [{ id: "p1", title: "Story", body: "Body" }],
      selectedReferenceImagesByPageId: { p1: [sceneReference] },
    });

    const changed = markArticleStoryboardReferencesChanged(shot!, "character_references");
    expect(changed.stale.candidateSheet).toBe(true);
    expect(changed.stale.videoPrompt).toBe(true);
  });

  it("marks selected scene reference changes as prompt stale only", () => {
    const [shot] = buildArticleStoryboardVideoShotPlans({
      pages: [{ id: "p1", title: "Story", body: "Body" }],
      selectedReferenceImagesByPageId: { p1: [sceneReference] },
    });

    const changed = markArticleStoryboardReferencesChanged(shot!, "selected_scene_references");
    expect(changed.stale.candidateSheet).toBe(false);
    expect(changed.stale.videoPrompt).toBe(true);
  });
});

describe("article storyboard video audio strategy", () => {
  it("defaults to separate TTS and does not expose silent as a primary builder option", () => {
    const resolution = resolveArticleStoryboardAudioStrategy({ ...baseContext, requestedAudioStrategy: undefined });
    expect(resolution).toMatchObject({
      requested: "separate_tts_voiceover",
      resolved: "separate_tts_voiceover",
      reasonCode: "ok",
      nativeAudioAllowed: true,
      separateTtsAllowed: true,
      fallbackOffered: [],
    });
    expect(getPrimaryBuilderAudioStrategies()).toEqual(["separate_tts_voiceover", "native_video_audio"]);
  });

  it("blocks native video audio without model language capability", () => {
    const resolution = resolveArticleStoryboardAudioStrategy({
      ...baseContext,
      requestedAudioStrategy: "native_video_audio",
      videoModel: { ...baseContext.videoModel, supportedSpeechLanguages: ["en-US"] },
    });

    expect(resolution.resolved).toBeNull();
    expect(resolution.reasonCode).toBe("native_audio_unsupported");
    expect(resolution.fallbackOffered).toEqual(["separate_tts_voiceover"]);
  });

  it("blocks native video audio when the prompt composer flag is disabled", () => {
    const resolution = resolveArticleStoryboardAudioStrategy({
      ...baseContext,
      requestedAudioStrategy: "native_video_audio",
      featureFlags: { ...enabledFlags, presentationArticleStoryboardVideoNativeAudioPromptComposer: false },
    });

    expect(resolution.reasonCode).toBe("native_audio_prompt_composer_disabled");
  });

  it("blocks separate TTS when a required voice ID is missing", () => {
    const resolution = resolveArticleStoryboardAudioStrategy({
      ...baseContext,
      voiceConfig: {
        ...baseContext.voiceConfig,
        speakers: [{ speaker: "Narrator", voiceModelId: "uvoice-premium" }],
      },
    });

    expect(resolution.resolved).toBeNull();
    expect(resolution.reasonCode).toBe("voice_id_missing");
  });

  it("requires two distinct voice IDs for two-speaker dialogue and maps UVoice to segment_then_merge", () => {
    const sameVoice = resolveArticleStoryboardAudioStrategy({
      ...baseContext,
      voiceConfig: {
        mode: "two_speaker_dialogue",
        provider: "uvoice_premium",
        voiceModelId: "uvoice-premium",
        speakers: [
          { speaker: "Host", voiceModelId: "uvoice-premium", voiceId: "same" },
          { speaker: "Guest", voiceModelId: "uvoice-premium", voiceId: "same" },
        ],
      },
    });
    expect(sameVoice.reasonCode).toBe("voice_id_missing");

    const distinctVoices = resolveArticleStoryboardAudioStrategy({
      ...baseContext,
      voiceConfig: {
        mode: "two_speaker_dialogue",
        provider: "uvoice_premium",
        voiceModelId: "uvoice-premium",
        speakers: [
          { speaker: "Host", voiceModelId: "uvoice-premium", voiceId: "TH-KantapongPremiumHD" },
          { speaker: "Guest", voiceModelId: "uvoice-premium", voiceId: "TH-FemaleVoiceID" },
        ],
      },
    });
    expect(distinctVoices.ttsRenderStrategy).toBe("segment_then_merge");
  });
});

describe("article storyboard video preview contracts", () => {
  it("exposes stable accessDecision and audioEstimate fields", () => {
    const shots = buildArticleStoryboardVideoShotPlans({
      pages: [{ id: "p1", title: "Story", body: "Body" }],
      selectedReferenceImagesByPageId: { p1: [sceneReference] },
    });
    const preview = buildArticleStoryboardVideoPreview(shots, baseContext);

    expect(preview.accessDecision).toMatchObject({
      allowed: true,
      reasonCode: "ok",
      videoModelId: "seedance",
      voiceModelId: "uvoice-premium",
      audioStrategy: "separate_tts_voiceover",
      missingFeatureFlags: [],
    });
    expect(preview.audioEstimate).toMatchObject({
      audioStrategy: "separate_tts_voiceover",
      modelPreference: "uvoice_premium",
      estimatedTtsSegments: 1,
    });
    expect(preview.creditBreakdown.map((item) => item.category)).toEqual([
      "reference_generation",
      "character_reference_processing",
      "video_generation",
      "native_video_audio",
      "tts",
      "audio_merge",
      "render",
    ]);
  });

  it("rejects provider tokens, session references, and signed upload URLs", () => {
    expect(containsUnsafeProviderMetadata({ metadata: { accessToken: "secret" } })).toBe(true);
    expect(containsUnsafeProviderMetadata("https://example.com/file.png?X-Amz-Signature=abc")).toBe(true);
  });

  it("builds required feature flags from selected audio and reference routes", () => {
    expect(buildArticleStoryboardRequiredFeatureFlags({
      audioStrategy: "separate_tts_voiceover",
      voiceProvider: "uvoice_premium",
      hasCharacterReferences: true,
    })).toEqual([
      "presentationArticleStoryboardVideo",
      "presentationArticleStoryboardVideoPreview",
      "presentationArticleStoryboardVideoOverlay",
      "presentationArticleStoryboardVideoReferenceFrames",
      "presentationArticleStoryboardVideoSeedancePrompt",
      "presentationArticleStoryboardVideoVoiceScript",
      "presentationArticleStoryboardVideoCharacterReferences",
      "presentationArticleStoryboardVideoUvoiceVoiceover",
    ]);
    expect(buildArticleStoryboardRequiredFeatureFlags({
      audioStrategy: "separate_tts_voiceover",
      voiceProvider: "elevenlabs",
    })).toContain("presentationArticleStoryboardVideoElevenLabsDialogue");
    expect(buildArticleStoryboardRequiredFeatureFlags({
      audioStrategy: "native_video_audio",
    })).toEqual(expect.arrayContaining([
      "presentationArticleStoryboardVideoNativeAudio",
      "presentationArticleStoryboardVideoNativeAudioPromptComposer",
    ]));
  });
});
