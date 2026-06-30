import { describe, expect, it } from "vitest";
import {
  getArticleStoryboardReviewMetadata,
  isArticleStoryboardOverlayPresetSafe,
  isArticleStoryboardOverlayPromptLike,
  updateArticleStoryboardOverlayMetadata,
  updateArticleStoryboardCurrentPromptMetadata,
  updateArticleStoryboardVoiceMetadata,
} from "../reviewMetadata";

function buildExtraParams(overrides: Record<string, unknown> = {}) {
  return {
    source: "presentation_article_storyboard_video",
    sourceMode: "article-storyboard-video",
    overlay: {
      id: "overlay-1",
      preset: "lower_third",
      headline: "Main idea",
      subtext: "Useful supporting line",
      css: {
        color: "#fff",
      },
      source: "article_title",
      warningCodes: [],
    },
    articleStoryboardVideo: {
      schemaVersion: 1,
      audioStrategy: "separate_tts_voiceover",
      requestedAudioStrategy: "separate_tts_voiceover",
      resolvedAudioStrategy: "separate_tts_voiceover",
      audioReasonCode: "ok",
      nativeAudioAllowed: false,
      separateTtsAllowed: true,
      ttsRenderStrategy: "segment_then_merge",
      imageReferencePrompt: "Create one 3x3 reference image candidate sheet.\n\nCharacter references:\n1. https://cdn.test/character.jpg",
      generatedImageReferencePrompt: "Generated image prompt\n\nBefore edit",
      videoPrompt: "Create a moving video shot.\n\nAudio policy:\nSeparate TTS voiceover will be added later.",
      generatedVideoPrompt: "Generated video prompt\n\nBefore edit",
      videoPromptOverride: "Manual video prompt from Builder.",
      promptSource: "manual_edit",
      voiceConfig: {
        mode: "two_speaker_dialogue",
        provider: "uvoice_premium",
        voiceModelId: "uvoice-premium",
        speakers: [
          { speaker: "Host", voiceId: "TH-KantapongPremiumHD" },
          { speaker: "Guest", voiceId: "TH-FemaleVoiceID" },
        ],
      },
      selectedReferenceImages: [
        { id: "scene-1", url: "https://cdn.test/scene.jpg", source: "generated_3x3" },
      ],
      characterReferenceImages: [
        { id: "char-1", url: "https://cdn.test/character.jpg", source: "character" },
      ],
      scriptSegments: [
        { speaker: "Host", text: "Welcome to the story.", shotId: "shot-1" },
      ],
      timing: {
        plannedDurationSeconds: 8,
        measuredDurationSeconds: 8.4,
        timingSource: "estimated",
      },
      ...(overrides.articleStoryboardVideo as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

describe("section 05 article storyboard review metadata", () => {
  it("separates overlay, voice, character references, and scene references", () => {
    const metadata = getArticleStoryboardReviewMetadata(buildExtraParams());

    expect(metadata?.overlay.headline).toBe("Main idea");
    expect(metadata?.audioStrategy).toBe("separate_tts_voiceover");
    expect(metadata?.requestedAudioStrategy).toBe("separate_tts_voiceover");
    expect(metadata?.resolvedAudioStrategy).toBe("separate_tts_voiceover");
    expect(metadata?.audioReasonCode).toBe("ok");
    expect(metadata?.nativeAudioAllowed).toBe(false);
    expect(metadata?.separateTtsAllowed).toBe(true);
    expect(metadata?.ttsRenderStrategy).toBe("segment_then_merge");
    expect(metadata?.imageReferencePrompt).toContain("3x3 reference image");
    expect(metadata?.generatedImageReferencePrompt).toContain("\n\nBefore edit");
    expect(metadata?.videoPrompt).toContain("moving video shot");
    expect(metadata?.generatedVideoPrompt).toContain("\n\nBefore edit");
    expect(metadata?.imageReferencePrompt).toContain("\n\nCharacter references:");
    expect(metadata?.videoPrompt).toContain("\n\nAudio policy:");
    expect(metadata?.videoPromptOverride).toContain("Manual video prompt");
    expect(metadata?.promptSource).toBe("manual_edit");
    expect(metadata?.voiceConfig.mode).toBe("two_speaker_dialogue");
    expect(metadata?.selectedReferenceImages).toHaveLength(1);
    expect(metadata?.selectedReferenceImages[0]?.source).toBe("generated_3x3");
    expect(metadata?.characterReferenceImages).toHaveLength(1);
    expect(metadata?.characterReferenceImages[0]?.source).toBe("character");
    expect(metadata?.scriptSegments[0]?.text).toContain("Welcome");
  });

  it("updates overlay metadata without mutating the video prompt field", () => {
    const task = {
      prompt: "Keep this visual prompt unchanged.",
      generationExtraParams: buildExtraParams(),
    };

    const nextExtraParams = updateArticleStoryboardOverlayMetadata(task.generationExtraParams, {
      preset: "center_title",
      headline: "New title",
      subtext: "New subtitle",
    });

    expect(task.prompt).toBe("Keep this visual prompt unchanged.");
    expect(getArticleStoryboardReviewMetadata(nextExtraParams)?.overlay).toMatchObject({
      preset: "center_title",
      headline: "New title",
      subtext: "New subtitle",
    });
  });

  it("keeps MVP overlay presets safe and rejects deferred presets", () => {
    expect(isArticleStoryboardOverlayPresetSafe("lower_third")).toBe(true);
    expect(isArticleStoryboardOverlayPresetSafe("center_title")).toBe(true);
    expect(isArticleStoryboardOverlayPresetSafe("top_caption")).toBe(false);
  });

  it("adds recoverable warnings for missing voice IDs and timing mismatch", () => {
    const metadata = getArticleStoryboardReviewMetadata(buildExtraParams({
      articleStoryboardVideo: {
        voiceConfig: {
          mode: "single_narrator",
          provider: "uvoice_premium",
          speakers: [{ speaker: "Narrator" }],
        },
        timing: {
          plannedDurationSeconds: 8,
          measuredDurationSeconds: 12,
        },
      },
    }));

    expect(metadata?.warningCodes).toContain("missing_voice_id_recoverable");
    expect(metadata?.warningCodes).toContain("timing_mismatch");
  });

  it("updates voice IDs as recoverable metadata without changing overlay fields", () => {
    const missingVoiceExtraParams = buildExtraParams({
      articleStoryboardVideo: {
        voiceConfig: {
          mode: "two_speaker_dialogue",
          provider: "uvoice_premium",
          voiceModelId: "uvoice-premium",
          speakers: [
            { speaker: "Host", voiceId: "TH-KantapongPremiumHD" },
            { speaker: "Guest" },
          ],
        },
      },
    });
    expect(getArticleStoryboardReviewMetadata(missingVoiceExtraParams)?.warningCodes)
      .toContain("missing_voice_id_recoverable");

    const nextExtraParams = updateArticleStoryboardVoiceMetadata(missingVoiceExtraParams, {
      voiceModelId: "uvoice-premium-v2",
      speakerVoiceIds: { 1: "TH-FemaleVoiceID" },
    });
    const metadata = getArticleStoryboardReviewMetadata(nextExtraParams);

    expect(metadata?.voiceConfig.voiceModelId).toBe("uvoice-premium-v2");
    expect(metadata?.voiceConfig.speakers[1]?.voiceId).toBe("TH-FemaleVoiceID");
    expect(metadata?.warningCodes).not.toContain("missing_voice_id_recoverable");
    expect(metadata?.overlay.headline).toBe("Main idea");
    expect((nextExtraParams.articleStoryboardVideo as Record<string, unknown>).ttsAudioStale).toBe(true);
  });

  it("records current Storyboard Review prompt edits without losing handoff prompt trace", () => {
    const extraParams = buildExtraParams();
    const nextExtraParams = updateArticleStoryboardCurrentPromptMetadata(
      extraParams,
      "Current prompt edited in Storyboard Review.\n\nKeep this multi-line structure.",
    );
    const metadata = getArticleStoryboardReviewMetadata(nextExtraParams);

    expect(metadata?.videoPrompt).toContain("Create a moving video shot");
    expect(metadata?.generatedVideoPrompt).toContain("Generated video prompt");
    expect(metadata?.currentVideoPrompt).toContain("Current prompt edited");
    expect(metadata?.currentVideoPrompt).toContain("\n\nKeep this multi-line structure.");
    expect(metadata?.currentPromptSource).toBe("manual_edit");
    expect(metadata?.currentPromptUpdatedAt).toBeTruthy();
    expect(metadata?.reviewPromptEditedAt).toBeTruthy();
    expect((nextExtraParams.articleStoryboardVideo as Record<string, unknown>).videoPrompt)
      .toBe((extraParams.articleStoryboardVideo as Record<string, unknown>).videoPrompt);
  });

  it("records regenerated current prompt source without overwriting Builder handoff prompt", () => {
    const extraParams = buildExtraParams();
    const nextExtraParams = updateArticleStoryboardCurrentPromptMetadata(
      extraParams,
      "Regenerated prompt in Storyboard Review.",
      "regenerated",
    );
    const metadata = getArticleStoryboardReviewMetadata(nextExtraParams);

    expect(metadata?.videoPrompt).toContain("Create a moving video shot");
    expect(metadata?.currentVideoPrompt).toBe("Regenerated prompt in Storyboard Review.");
    expect(metadata?.currentPromptSource).toBe("regenerated");
    expect(metadata?.currentPromptUpdatedAt).toBeTruthy();
    expect(metadata?.reviewPromptEditedAt).toBeNull();
    expect(nextExtraParams.promptSource).toBe("regenerated");
  });

  it("detects prompt-like overlay text", () => {
    expect(isArticleStoryboardOverlayPromptLike("cinematic camera shot with reference image")).toBe(true);
    expect(isArticleStoryboardOverlayPromptLike("A clear benefit for today")).toBe(false);
  });
});
