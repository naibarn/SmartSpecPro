import type {
  ArticleStoryboardAudioStrategy,
  ArticleStoryboardTtsRenderStrategy,
  ArticleStoryboardVoiceConfig,
  ArticleStoryboardVoiceProvider,
} from "./contracts";
import type { ArticleStoryboardScriptSegment } from "./prompting";
import { evaluateArticleStoryboardTimingMismatch } from "./timing";

export interface ArticleStoryboardTtsJobPlan {
  id: string;
  provider: ArticleStoryboardVoiceProvider;
  providerParams: Record<string, unknown>;
  text: string;
  speaker: string;
  sequenceIndex: number;
  startTimeSeconds: number;
  targetDurationSeconds: number;
}

export interface ArticleStoryboardMergedVoiceoverPlan {
  id: string;
  strategy: ArticleStoryboardTtsRenderStrategy;
  jobs: ArticleStoryboardTtsJobPlan[];
  targetDurationSeconds: number;
  measuredDurationSeconds: number | null;
  logicalTrack: "A1";
}

export interface ArticleStoryboardRenderTrackPlan {
  video: {
    track: "V1";
    muteEmbeddedAudio: boolean;
  };
  textOverlay: {
    track: "T1";
    enabled: boolean;
  };
  voiceover: {
    track: "A1";
    enabled: boolean;
    attachExternalAudio: boolean;
  };
  staticSlideFallback: {
    referenceOnly: boolean;
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function secondsForText(text: string, fallbackSeconds: number): number {
  const clean = cleanText(text);
  if (!clean) return fallbackSeconds;
  return Math.max(1.5, Number((clean.length / 14).toFixed(2)));
}

function getSpeakerVoice(
  voiceConfig: ArticleStoryboardVoiceConfig,
  speakerName: string,
  fallbackIndex: number,
) {
  const normalized = cleanText(speakerName).toLowerCase();
  return voiceConfig.speakers.find((speaker) => cleanText(speaker.speaker).toLowerCase() === normalized)
    ?? voiceConfig.speakers[fallbackIndex]
    ?? voiceConfig.speakers[0];
}

export function buildArticleStoryboardTtsJobPlan(input: {
  provider: ArticleStoryboardVoiceProvider;
  voiceConfig: ArticleStoryboardVoiceConfig;
  scriptSegments: ArticleStoryboardScriptSegment[];
  strategy: ArticleStoryboardTtsRenderStrategy;
  targetDurationSeconds?: number;
}): ArticleStoryboardMergedVoiceoverPlan {
  const targetDurationSeconds = Math.max(1, input.targetDurationSeconds ?? 0);
  const fallbackPerSegment = input.scriptSegments.length > 0
    ? targetDurationSeconds / input.scriptSegments.length
    : targetDurationSeconds;
  const segments = input.strategy === "single_request" || input.strategy === "single_request_dialogue"
    ? [{
        speaker: input.voiceConfig.speakers[0]?.speaker ?? "Narrator",
        text: input.scriptSegments.map((segment) => cleanText(segment.text)).filter(Boolean).join("\n"),
      }]
    : input.scriptSegments.map((segment) => ({
        speaker: cleanText(segment.speaker) || input.voiceConfig.speakers[0]?.speaker || "Narrator",
        text: cleanText(segment.text),
      }));

  let cursor = 0;
  const jobs = segments
    .filter((segment) => segment.text)
    .map((segment, index): ArticleStoryboardTtsJobPlan => {
      const speaker = getSpeakerVoice(input.voiceConfig, segment.speaker, index % Math.max(1, input.voiceConfig.speakers.length));
      const duration = secondsForText(segment.text, fallbackPerSegment);
      const providerParams: Record<string, unknown> = {
        provider: input.provider,
        speaker: segment.speaker,
      };
      if (input.provider === "uvoice_premium" && speaker?.voiceId) {
        providerParams.voiceID = speaker.voiceId;
      } else if (speaker?.voiceId) {
        providerParams.voiceId = speaker.voiceId;
      }
      if (speaker?.voiceModelId || input.voiceConfig.voiceModelId) {
        providerParams.voiceModelId = speaker?.voiceModelId ?? input.voiceConfig.voiceModelId;
      }
      const job: ArticleStoryboardTtsJobPlan = {
        id: `tts-${index + 1}`,
        provider: input.provider,
        providerParams,
        text: segment.text,
        speaker: segment.speaker,
        sequenceIndex: index,
        startTimeSeconds: Number(cursor.toFixed(2)),
        targetDurationSeconds: duration,
      };
      cursor += duration;
      return job;
    });

  return {
    id: "article-storyboard-voiceover",
    strategy: input.strategy,
    jobs,
    targetDurationSeconds: Number((targetDurationSeconds || cursor).toFixed(2)),
    measuredDurationSeconds: null,
    logicalTrack: "A1",
  };
}

export function updateArticleStoryboardMeasuredVoiceoverPlan(
  plan: ArticleStoryboardMergedVoiceoverPlan,
  measuredDurationsBySequenceIndex: Record<number, number>,
): ArticleStoryboardMergedVoiceoverPlan {
  const measuredDurationSeconds = plan.jobs.reduce((sum, job) => {
    const measured = measuredDurationsBySequenceIndex[job.sequenceIndex];
    return sum + (Number.isFinite(measured) && measured > 0 ? measured : job.targetDurationSeconds);
  }, 0);
  return {
    ...plan,
    measuredDurationSeconds: Number(measuredDurationSeconds.toFixed(2)),
  };
}

export function evaluateArticleStoryboardAudioTiming(input: {
  plannedDurationSeconds: number;
  measuredDurationSeconds: number | null | undefined;
}) {
  if (!input.measuredDurationSeconds) {
    return {
      warningCode: "timing_estimated" as const,
      mismatch: false,
      deltaSeconds: 0,
    };
  }
  const result = evaluateArticleStoryboardTimingMismatch(
    input.plannedDurationSeconds,
    input.measuredDurationSeconds,
  );
  return {
    warningCode: result.mismatch ? "timing_mismatch" as const : null,
    mismatch: result.mismatch,
    deltaSeconds: result.deltaSeconds,
  };
}

export function buildArticleStoryboardRenderTrackPlan(input: {
  audioStrategy: ArticleStoryboardAudioStrategy;
  hasSeparateVoiceoverAsset: boolean;
  hasOverlay: boolean;
  hasStaticSlideFallback: boolean;
}): ArticleStoryboardRenderTrackPlan {
  const usesSeparateVoiceover = input.audioStrategy === "separate_tts_voiceover" && input.hasSeparateVoiceoverAsset;
  const usesNativeAudio = input.audioStrategy === "native_video_audio";
  return {
    video: {
      track: "V1",
      muteEmbeddedAudio: usesSeparateVoiceover,
    },
    textOverlay: {
      track: "T1",
      enabled: input.hasOverlay,
    },
    voiceover: {
      track: "A1",
      enabled: usesSeparateVoiceover,
      attachExternalAudio: usesSeparateVoiceover && !usesNativeAudio,
    },
    staticSlideFallback: {
      referenceOnly: input.hasStaticSlideFallback,
    },
  };
}
