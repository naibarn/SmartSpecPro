import { describe, expect, it } from "vitest";
import {
  buildArticleStoryboardRenderTrackPlan,
  buildArticleStoryboardTtsJobPlan,
  resolveArticleStoryboardAudioStrategy,
  updateArticleStoryboardMeasuredVoiceoverPlan,
  type ArticleStoryboardValidationContext,
  type ArticleStoryboardVoiceConfig,
} from "../index";

const voiceConfig: ArticleStoryboardVoiceConfig = {
  mode: "two_speaker_dialogue",
  provider: "uvoice_premium",
  voiceModelId: "uvoice-premium",
  speakers: [
    { speaker: "พิธีกรชาย", voiceId: "TH-KantapongPremiumHD", voiceModelId: "uvoice-premium" },
    { speaker: "ผู้ช่วยหญิง", voiceId: "TH-FemaleVoiceID", voiceModelId: "uvoice-premium" },
  ],
};

function buildValidationContext(overrides: Partial<ArticleStoryboardValidationContext> = {}): ArticleStoryboardValidationContext {
  return {
    featureFlags: {
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
    },
    videoModel: {
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
      supportsDialogue: false,
    },
    voiceConfig,
    requestedAudioStrategy: "separate_tts_voiceover",
    spokenLanguage: "th-TH",
    ...overrides,
  };
}

describe("section 06 article storyboard audio/render pipeline", () => {
  it("maps UVoice speaker voiceId to provider parameter voiceID", () => {
    const plan = buildArticleStoryboardTtsJobPlan({
      provider: "uvoice_premium",
      voiceConfig: { ...voiceConfig, mode: "single_narrator", speakers: [voiceConfig.speakers[0]!] },
      strategy: "single_request",
      targetDurationSeconds: 8,
      scriptSegments: [{ speaker: "พิธีกรชาย", text: "สวัสดีครับ วันนี้เราจะมาเล่าเรื่องนี้", shotId: "shot-1" }],
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]?.providerParams.voiceID).toBe("TH-KantapongPremiumHD");
    expect(plan.jobs[0]?.providerParams.voiceId).toBeUndefined();
  });

  it("creates ordered UVoice segment jobs for two-speaker dialogue", () => {
    const plan = buildArticleStoryboardTtsJobPlan({
      provider: "uvoice_premium",
      voiceConfig,
      strategy: "segment_then_merge",
      targetDurationSeconds: 12,
      scriptSegments: [
        { speaker: "พิธีกรชาย", text: "เริ่มจากประเด็นแรก", shotId: "shot-1" },
        { speaker: "ผู้ช่วยหญิง", text: "ใช่ค่ะ จุดนี้สำคัญมาก", shotId: "shot-1" },
      ],
    });

    expect(plan.logicalTrack).toBe("A1");
    expect(plan.jobs.map((job) => job.sequenceIndex)).toEqual([0, 1]);
    expect(plan.jobs[1]!.startTimeSeconds).toBeGreaterThan(plan.jobs[0]!.startTimeSeconds);
    expect(plan.jobs.map((job) => job.providerParams.voiceID)).toEqual(["TH-KantapongPremiumHD", "TH-FemaleVoiceID"]);
  });

  it("preserves measured duration after merge", () => {
    const plan = buildArticleStoryboardTtsJobPlan({
      provider: "uvoice_premium",
      voiceConfig,
      strategy: "segment_then_merge",
      targetDurationSeconds: 12,
      scriptSegments: [
        { speaker: "พิธีกรชาย", text: "หนึ่ง", shotId: "shot-1" },
        { speaker: "ผู้ช่วยหญิง", text: "สอง", shotId: "shot-1" },
      ],
    });

    const measured = updateArticleStoryboardMeasuredVoiceoverPlan(plan, { 0: 2.4, 1: 3.1 });

    expect(measured.measuredDurationSeconds).toBe(5.5);
    expect(measured.jobs.map((job) => job.sequenceIndex)).toEqual([0, 1]);
  });

  it("requires explicit fallback when UVoice premium is unavailable", () => {
    const result = resolveArticleStoryboardAudioStrategy(buildValidationContext({
      voiceModel: {
        provider: "uvoice_premium",
        modelId: "uvoice-premium",
        accessible: true,
        available: false,
      },
    }));

    expect(result.resolved).toBeNull();
    expect(result.reasonCode).toBe("uvoice_unavailable");
    expect(result.fallbackOffered).toEqual(["native_video_audio"]);
  });

  it("uses ElevenLabs single request dialogue when the selected model supports dialogue", () => {
    const result = resolveArticleStoryboardAudioStrategy(buildValidationContext({
      voiceModel: {
        provider: "elevenlabs",
        modelId: "elevenlabs-dialogue",
        accessible: true,
        available: true,
        supportsDialogue: true,
      },
      voiceConfig: {
        ...voiceConfig,
        provider: "elevenlabs",
      },
    }));

    expect(result.resolved).toBe("separate_tts_voiceover");
    expect(result.ttsRenderStrategy).toBe("single_request_dialogue");
  });

  it("keeps final composition tracks separated for separate TTS", () => {
    const plan = buildArticleStoryboardRenderTrackPlan({
      audioStrategy: "separate_tts_voiceover",
      hasSeparateVoiceoverAsset: true,
      hasOverlay: true,
      hasStaticSlideFallback: true,
    });

    expect(plan.video).toEqual({ track: "V1", muteEmbeddedAudio: true });
    expect(plan.textOverlay).toEqual({ track: "T1", enabled: true });
    expect(plan.voiceover).toEqual({ track: "A1", enabled: true, attachExternalAudio: true });
    expect(plan.staticSlideFallback.referenceOnly).toBe(true);
  });

  it("does not attach duplicate A1 voiceover for native video audio", () => {
    const plan = buildArticleStoryboardRenderTrackPlan({
      audioStrategy: "native_video_audio",
      hasSeparateVoiceoverAsset: true,
      hasOverlay: true,
      hasStaticSlideFallback: false,
    });

    expect(plan.video.muteEmbeddedAudio).toBe(false);
    expect(plan.voiceover).toEqual({ track: "A1", enabled: false, attachExternalAudio: false });
  });
});
