import { describe, expect, it } from "vitest";
import {
  buildArticleStoryboardReviewDraft,
  buildArticleStoryboardSourceDraftId,
  buildArticleStoryboardVideoShotPlans,
  isDuplicateArticleStoryboardVideoHandoff,
  normalizeArticleStoryboardLegacyWarnings,
  type ArticleStoryboardAudioStrategyResolution,
} from "../index";
import { VideoSegmentPlanSchema } from "../../videoSegmentPlanner";

const audioResolution: ArticleStoryboardAudioStrategyResolution = {
  requested: "separate_tts_voiceover",
  resolved: "separate_tts_voiceover",
  reasonCode: "ok",
  message: "ok",
  nativeAudioAllowed: false,
  separateTtsAllowed: true,
  fallbackOffered: [],
  ttsRenderStrategy: "segment_then_merge",
};

function buildFiveShots() {
  return buildArticleStoryboardVideoShotPlans({
    pages: Array.from({ length: 5 }, (_, index) => ({
      id: `page-${index + 1}`,
      pageNumber: index + 1,
      title: `Page ${index + 1}`,
      body: `Article body ${index + 1}`,
      slideImageUrl: `https://cdn.example.com/slide-${index + 1}.png`,
    })),
    selectedReferenceImagesByPageId: Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [
        `page-${index + 1}`,
        [{ id: `scene-${index + 1}`, url: `https://cdn.example.com/ref-${index + 1}.jpg`, source: "generated_3x3" }],
      ]),
    ),
    characterReferenceImagesByPageId: {
      "page-1": [{ id: "char-1", url: "https://cdn.example.com/char.png", source: "character", confirmed: true, safetyStatus: "approved" }],
    },
  });
}

describe("article storyboard video handoff", () => {
  it("creates one ordered video task per article page", () => {
    const draft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: {
        mode: "two_speaker_dialogue",
        speakers: [
          { speaker: "Host", voiceId: "TH-KantapongPremiumHD", voiceModelId: "uvoice-premium" },
          { speaker: "Guest", voiceId: "TH-FemaleVoiceID", voiceModelId: "uvoice-premium" },
        ],
      },
      shots: buildFiveShots(),
      now: 123,
    });

    expect(draft.tasks).toHaveLength(5);
    expect(draft.taskIds).toEqual(draft.tasks.map((task) => task.id));
    expect(draft.tasks.every((task) => task.type === "video")).toBe(true);
    expect(draft.tasks[0]?.model).toBe("seedance");
    expect(draft.tasks[0]?.durationSeconds).toBe(5);
    expect(() => VideoSegmentPlanSchema.parse((draft.videoSegmentState as { videoSegmentPlan?: unknown }).videoSegmentPlan)).not.toThrow();
    expect((draft.videoSegmentState as { videoSegmentPlan?: { mode?: string; effectiveMode?: string } }).videoSegmentPlan).toMatchObject({
      sourceSurface: "storyboard_review",
      mode: "per_shot",
      effectiveMode: "per_shot",
      referenceMode: "single_storyboard_frame",
    });
    expect((draft.videoSegmentState as { effectiveMode?: string }).effectiveMode).toBe("per_shot");
    expect(draft.tasks[0]?.storyboardContext.extraParams).toMatchObject({
      videoSegmentId: "article-video-shot-1",
      videoSegmentShotIds: ["article-video-shot-1"],
      videoSegmentPlanVersion: 1,
    });
  });

  it("keeps overlay text out of task.prompt and stores it in extraParams", () => {
    const [shot] = buildFiveShots();
    const draft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [shot!],
    });

    const task = draft.tasks[0]!;
    expect(task.prompt).not.toContain("lower_third");
    expect(task.prompt).not.toContain("center_title");
    expect(task.prompt).toContain("CSS overlay text is added later");
    expect(task.storyboardContext.extraParams.articleStoryboardVideo).toMatchObject({
      sourceDraftId: "draft-1",
      promptSkillId: "seedance-multishot-review",
      scriptSkillId: "article-storytelling-voiceover-script",
      audioStrategy: "separate_tts_voiceover",
      requestedAudioStrategy: "separate_tts_voiceover",
      resolvedAudioStrategy: "separate_tts_voiceover",
      audioReasonCode: "ok",
      nativeAudioAllowed: false,
      separateTtsAllowed: true,
      fallbackOffered: [],
      ttsRenderStrategy: "segment_then_merge",
      selectedReferenceIds: ["scene-1"],
      staticSlideFallbackUrl: "https://cdn.example.com/slide-1.png",
    });
    expect(task.storyboardContext.referenceImages).toEqual([{ url: "https://cdn.example.com/ref-1.jpg", name: "scene-1" }]);
  });

  it("includes native speech lines only when native audio is selected", () => {
    const nativeDraft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "veo-3.1",
      audioResolution: { ...audioResolution, requested: "native_video_audio", resolved: "native_video_audio", nativeAudioAllowed: true },
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [buildFiveShots()[0]!],
      scriptSegments: [{ shotId: "article-video-shot-1", pageId: "page-1", speaker: "Narrator", text: "พูดในวิดีโอ" }],
    });
    expect(nativeDraft.tasks[0]?.prompt).toContain("Narrator: พูดในวิดีโอ");

    const separateDraft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [buildFiveShots()[0]!],
      scriptSegments: [{ shotId: "article-video-shot-1", pageId: "page-1", speaker: "Narrator", text: "แยกเสียง" }],
    });
    expect(separateDraft.tasks[0]?.prompt).not.toContain("Narrator: แยกเสียง");
  });

  it("uses per-shot manual video prompt overrides and stores image prompt metadata", () => {
    const [shot] = buildFiveShots();
    const draft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [shot!],
      imagePromptByShotId: { [shot!.id]: "manual image reference prompt" },
      videoPromptOverridesByShotId: { [shot!.id]: "manual video prompt for this shot" },
    });

    const task = draft.tasks[0]!;
    expect(task.prompt).toBe("manual video prompt for this shot");
    expect(task.storyboardContext.extraParams.articleStoryboardVideo).toMatchObject({
      imageReferencePrompt: "manual image reference prompt",
      generatedImageReferencePrompt: expect.stringContaining("3x3 reference image candidate sheet"),
      videoPrompt: "manual video prompt for this shot",
      generatedVideoPrompt: expect.stringContaining("Create a moving video shot"),
      videoPromptOverride: "manual video prompt for this shot",
      promptSource: "manual_edit",
    });
    expect((draft.videoSegmentState as { promptSource?: string }).promptSource).toBe("manual_edit");
  });

  it("preserves existing companion audio and voiceover conventions", () => {
    const draft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [buildFiveShots()[0]!],
      existingDraft: {
        companionAudio: [{ id: "audio-1", url: "/audio.mp3" }],
        companionAudioUpdatedAt: 456,
        voiceoverFullScript: "existing",
      },
    });

    expect(draft.companionAudio).toEqual([{ id: "audio-1", url: "/audio.mp3" }]);
    expect(draft.companionAudioUpdatedAt).toBe(456);
  });

  it("guards duplicate handoff and surfaces legacy recoverable warnings", () => {
    const draft = buildArticleStoryboardReviewDraft({
      sourceDraftId: "draft-1",
      projectName: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioResolution,
      voiceConfig: { mode: "single_narrator", speakers: [{ speaker: "Narrator", voiceId: "voice-1" }] },
      shots: [buildFiveShots()[0]!],
    });
    expect(isDuplicateArticleStoryboardVideoHandoff(draft, "draft-1")).toBe(true);
    expect(normalizeArticleStoryboardLegacyWarnings({ tasks: [] })).toEqual(["legacy_metadata_defaults"]);

    const legacyMissingVoice = {
      tasks: [{
        ...draft.tasks[0]!,
        storyboardContext: {
          ...draft.tasks[0]!.storyboardContext,
          extraParams: {
            articleStoryboardVideo: {
              audioStrategy: "separate_tts_voiceover",
              voiceConfig: { speakers: [{ speaker: "Narrator" }] },
            },
          },
        },
      }],
    };
    expect(normalizeArticleStoryboardLegacyWarnings(legacyMissingVoice)).toEqual(["missing_voice_id_recoverable"]);
  });

  it("builds a stable source draft id for duplicate handoff prevention", () => {
    const shots = buildFiveShots();
    const voiceConfig = {
      mode: "single_narrator" as const,
      speakers: [{ speaker: "Narrator", voiceId: "voice-1", voiceModelId: "uvoice-premium" }],
    };
    const first = buildArticleStoryboardSourceDraftId({
      deckId: 42,
      topic: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioStrategy: "separate_tts_voiceover",
      voiceConfig,
      shots,
    });
    const second = buildArticleStoryboardSourceDraftId({
      deckId: 42,
      topic: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioStrategy: "separate_tts_voiceover",
      voiceConfig,
      shots,
    });
    const changedReference = buildArticleStoryboardSourceDraftId({
      deckId: 42,
      topic: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioStrategy: "separate_tts_voiceover",
      voiceConfig,
      shots: shots.map((shot, index) => index === 0
        ? {
            ...shot,
            selectedReferenceImages: [
              { id: "scene-new", url: "https://cdn.example.com/ref-new.jpg", source: "generated_3x3" },
            ],
          }
        : shot),
    });
    const changedManualPrompt = buildArticleStoryboardSourceDraftId({
      deckId: 42,
      topic: "Article Video",
      aspectRatio: "9:16",
      videoModelId: "seedance",
      audioStrategy: "separate_tts_voiceover",
      voiceConfig,
      shots,
      videoPromptOverridesByShotId: { [shots[0]!.id]: "manual prompt" },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^deck-42-article-[a-f0-9]{16}$/);
    expect(changedReference).not.toBe(first);
    expect(changedManualPrompt).not.toBe(first);
  });
});
