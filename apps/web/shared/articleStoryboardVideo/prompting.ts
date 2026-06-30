import type {
  ArticleStoryboardAudioStrategyResolution,
  ArticleStoryboardReferenceImage,
  ArticleStoryboardVideoShotPlan,
  ArticleStoryboardVoiceConfig,
} from "./contracts";

export interface ArticleStoryboardSeedancePromptInput {
  skillId: "seedance-multishot-review";
  shotId: string;
  pageId: string;
  articleTitle: string;
  visualBrief: string;
  sceneReferenceImages: ArticleStoryboardReferenceImage[];
  characterReferenceImages: ArticleStoryboardReferenceImage[];
  audioPolicy: string;
  nativeSpeechLines: string[];
  overlayInstruction: string;
}

export interface ArticleStoryboardScriptSegment {
  shotId: string;
  pageId: string;
  speaker: string;
  voiceId?: string;
  text: string;
  targetDurationSeconds?: number;
}

export interface ArticleStoryboardVoiceScript {
  mode: ArticleStoryboardVoiceConfig["mode"];
  language: string;
  speakers: ArticleStoryboardVoiceConfig["speakers"];
  segments: ArticleStoryboardScriptSegment[];
  targetDurationSeconds: number;
  warnings: string[];
}

export function buildArticleStoryboardAudioPolicy(input: {
  audioResolution: ArticleStoryboardAudioStrategyResolution;
  scriptSegments?: ArticleStoryboardScriptSegment[];
}): { promptPolicy: string; nativeSpeechLines: string[] } {
  if (input.audioResolution.resolved === "native_video_audio") {
    return {
      promptPolicy: "Native video audio is enabled. Include only the provided Thai speech lines as dialogue/audio guidance.",
      nativeSpeechLines: (input.scriptSegments ?? []).map((segment) => `${segment.speaker}: ${segment.text}`),
    };
  }

  return {
    promptPolicy: "Separate TTS voiceover will be added later. Generate a silent visual-only video: no speech, no spoken dialogue, no lip-sync, no readable captions.",
    nativeSpeechLines: [],
  };
}

export function buildArticleStoryboardSeedancePromptInput(input: {
  shot: ArticleStoryboardVideoShotPlan;
  audioResolution: ArticleStoryboardAudioStrategyResolution;
  scriptSegments?: ArticleStoryboardScriptSegment[];
}): ArticleStoryboardSeedancePromptInput {
  const audioPolicy = buildArticleStoryboardAudioPolicy({
    audioResolution: input.audioResolution,
    scriptSegments: input.scriptSegments,
  });
  return {
    skillId: "seedance-multishot-review",
    shotId: input.shot.id,
    pageId: input.shot.pageId,
    articleTitle: input.shot.articleTitle,
    visualBrief: [
      `Create a moving video shot that presents this article page visually.`,
      `Page ${input.shot.pageNumber}: ${input.shot.articleTitle}`,
      input.shot.articleText,
      `Use the selected scene reference images for composition and mood.`,
      input.shot.characterReferenceImages.length > 0
        ? "Preserve character identity from character references."
        : "No character identity reference is attached.",
    ].filter(Boolean).join("\n"),
    sceneReferenceImages: input.shot.selectedReferenceImages,
    characterReferenceImages: input.shot.characterReferenceImages,
    audioPolicy: audioPolicy.promptPolicy,
    nativeSpeechLines: audioPolicy.nativeSpeechLines,
    overlayInstruction: "Do not draw or render the article text overlay inside the video. CSS overlay text is added later in Storyboard Review.",
  };
}

export function buildArticleStoryboardSeedancePromptText(input: {
  shot: ArticleStoryboardVideoShotPlan;
  audioResolution: ArticleStoryboardAudioStrategyResolution;
  scriptSegments?: ArticleStoryboardScriptSegment[];
}): string {
  const promptInput = buildArticleStoryboardSeedancePromptInput(input);
  const parts = [
    promptInput.visualBrief,
    promptInput.audioPolicy,
    promptInput.nativeSpeechLines.length > 0
      ? `Speech lines:\n${promptInput.nativeSpeechLines.join("\n")}`
      : "",
    promptInput.overlayInstruction,
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function buildArticleStorytellingVoiceScript(input: {
  shots: ArticleStoryboardVideoShotPlan[];
  voiceConfig: ArticleStoryboardVoiceConfig;
  language: string;
}): ArticleStoryboardVoiceScript {
  const speakers = input.voiceConfig.speakers;
  const primarySpeaker = speakers[0] ?? { speaker: "ผู้บรรยาย", voiceId: undefined };
  const secondarySpeaker = speakers[1] ?? { speaker: "ผู้ช่วย", voiceId: undefined };
  const segments: ArticleStoryboardScriptSegment[] = [];

  for (const shot of input.shots) {
    if (input.voiceConfig.mode === "two_speaker_dialogue") {
      segments.push({
        shotId: shot.id,
        pageId: shot.pageId,
        speaker: primarySpeaker.speaker,
        voiceId: primarySpeaker.voiceId,
        text: `วันนี้เราจะพาไปดูประเด็นสำคัญของ ${shot.articleTitle}`,
        targetDurationSeconds: Math.max(2, Math.floor(shot.durationSeconds / 2)),
      });
      segments.push({
        shotId: shot.id,
        pageId: shot.pageId,
        speaker: secondarySpeaker.speaker,
        voiceId: secondarySpeaker.voiceId,
        text: shot.articleText.slice(0, 220) || shot.overlay.headline,
        targetDurationSeconds: Math.max(2, Math.ceil(shot.durationSeconds / 2)),
      });
    } else {
      segments.push({
        shotId: shot.id,
        pageId: shot.pageId,
        speaker: primarySpeaker.speaker,
        voiceId: primarySpeaker.voiceId,
        text: `${shot.articleTitle}: ${shot.articleText || shot.overlay.headline}`.slice(0, 320),
        targetDurationSeconds: shot.durationSeconds,
      });
    }
  }

  return {
    mode: input.voiceConfig.mode,
    language: input.language,
    speakers,
    segments,
    targetDurationSeconds: input.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
    warnings: [],
  };
}
