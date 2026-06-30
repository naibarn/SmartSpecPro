import type {
  ArticleStoryboardAudioStrategyResolution,
  ArticleStoryboardReferenceImage,
  ArticleStoryboardVideoShotPlan,
  ArticleStoryboardVoiceConfig,
} from "./contracts";
import { buildArticleStoryboardSeedancePromptText, type ArticleStoryboardScriptSegment } from "./prompting";
import { buildArticleStoryboardReferenceCandidatePrompt } from "./references";

export interface ArticleStoryboardReviewTaskLike {
  id: string;
  index: number;
  status: string;
  type: string;
  prompt: string;
  model: string;
  durationSeconds?: number;
  createdAt: number;
  updatedAt: number;
  storyboardContext?: {
    aspectRatio?: string;
    duration?: number;
    model?: string;
    referenceImages?: Array<{ url: string; name?: string }>;
    referenceVideos?: Array<{ url?: string }>;
    extraParams?: Record<string, unknown>;
  };
}

export interface ArticleStoryboardReviewDraftLike {
  version: 1;
  name?: string | null;
  updatedAt: number;
  taskIds: string[];
  selectedTaskIds: string[];
  tasks: ArticleStoryboardReviewTaskLike[];
  companionAudio: unknown[];
  companionAudioUpdatedAt?: number | null;
  compoundStatus: string | null;
  projectLink: string | null;
  renderJobId: string | null;
  voiceoverFullScript?: string | null;
  useVoiceoverScriptAsConcept?: boolean;
  videoSegmentState?: unknown;
}

export interface ArticleStoryboardVideoHandoffInput {
  sourceDraftId: string;
  projectName: string;
  aspectRatio: string;
  videoModelId: string;
  videoProvider?: string;
  audioResolution: ArticleStoryboardAudioStrategyResolution;
  voiceConfig: ArticleStoryboardVoiceConfig;
  shots: ArticleStoryboardVideoShotPlan[];
  scriptSegments?: ArticleStoryboardScriptSegment[];
  imagePromptByShotId?: Record<string, string>;
  videoPromptOverridesByShotId?: Record<string, string>;
  existingDraft?: Partial<ArticleStoryboardReviewDraftLike> | null;
  now?: number;
}

export interface ArticleStoryboardSourceDraftIdentityInput {
  deckId: string | number;
  topic?: string | null;
  aspectRatio: string;
  videoModelId: string;
  audioStrategy: string;
  voiceConfig: ArticleStoryboardVoiceConfig;
  shots: ArticleStoryboardVideoShotPlan[];
  imagePromptByShotId?: Record<string, string>;
  videoPromptOverridesByShotId?: Record<string, string>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  return [hashA, hashB].map((part) => part.toString(16).padStart(8, "0")).join("");
}

export function buildArticleStoryboardSourceDraftId(input: ArticleStoryboardSourceDraftIdentityInput): string {
  const identity = {
    deckId: String(input.deckId),
    topic: input.topic?.trim() || "",
    aspectRatio: input.aspectRatio,
    videoModelId: input.videoModelId,
    audioStrategy: input.audioStrategy,
    voiceConfig: input.voiceConfig,
    imagePromptByShotId: input.imagePromptByShotId ?? {},
    videoPromptOverridesByShotId: input.videoPromptOverridesByShotId ?? {},
    shots: input.shots.map((shot) => ({
      pageId: shot.pageId,
      pageNumber: shot.pageNumber,
      articleTitle: shot.articleTitle,
      articleText: shot.articleText,
      durationSeconds: shot.durationSeconds,
      overlay: shot.overlay,
      selectedReferenceImages: shot.selectedReferenceImages.map((reference) => ({
        id: reference.id,
        url: reference.url,
        source: reference.source,
      })),
      characterReferenceImages: shot.characterReferenceImages.map((reference) => ({
        id: reference.id,
        url: reference.url,
        source: reference.source,
      })),
    })),
  };
  return `deck-${input.deckId}-article-${stableHash(stableStringify(identity))}`;
}

function referenceToStoryboardImage(reference: ArticleStoryboardReferenceImage): { url: string; name?: string } {
  return {
    url: reference.url,
    name: reference.label || reference.id,
  };
}

function buildTaskPrompt(input: {
  shot: ArticleStoryboardVideoShotPlan;
  audioResolution: ArticleStoryboardAudioStrategyResolution;
  scriptSegments: ArticleStoryboardScriptSegment[];
  videoPromptOverride?: string;
  generatedVideoPrompt?: string;
}): string {
  const trimmedOverride = input.videoPromptOverride?.trim();
  if (trimmedOverride) {
    return trimmedOverride;
  }
  return input.generatedVideoPrompt ?? buildArticleStoryboardSeedancePromptText(input);
}

function buildArticleStoryboardVideoSegmentPlanWarnings(shots: ArticleStoryboardVideoShotPlan[]) {
  return shots.flatMap((shot) => shot.warningCodes.map((code) => ({
    code,
    message: code.replace(/_/g, " "),
    severity: "warning" as const,
    source: "planner" as const,
    segmentId: shot.id,
    shotIds: [shot.id],
  })));
}

export function buildArticleStoryboardReviewDraft(
  input: ArticleStoryboardVideoHandoffInput,
): ArticleStoryboardReviewDraftLike {
  const now = input.now ?? Date.now();
  const taskIds = input.shots.map((shot) => `article-${input.sourceDraftId}-${shot.pageNumber}`);
  const planHash = `article-storyboard-video-${stableHash(stableStringify({
    sourceDraftId: input.sourceDraftId,
    shots: input.shots.map((shot) => ({
      id: shot.id,
      durationSeconds: shot.durationSeconds,
      references: shot.selectedReferenceImages.map((reference) => reference.url),
    })),
  }))}`;
  const scriptByShotId = new Map<string, ArticleStoryboardScriptSegment[]>();
  for (const segment of input.scriptSegments ?? []) {
    const bucket = scriptByShotId.get(segment.shotId) ?? [];
    bucket.push(segment);
    scriptByShotId.set(segment.shotId, bucket);
  }

  const tasks = input.shots.map((shot, index): ArticleStoryboardReviewTaskLike => {
    const shotScriptSegments = scriptByShotId.get(shot.id) ?? [];
    const videoPromptOverride = input.videoPromptOverridesByShotId?.[shot.id]?.trim();
    const generatedVideoPrompt = buildArticleStoryboardSeedancePromptText({
      shot,
      audioResolution: input.audioResolution,
      scriptSegments: shotScriptSegments,
    });
    const prompt = buildTaskPrompt({
      shot,
      audioResolution: input.audioResolution,
      scriptSegments: shotScriptSegments,
      videoPromptOverride,
      generatedVideoPrompt,
    });
    const generatedImagePrompt = buildArticleStoryboardReferenceCandidatePrompt(shot);
    const imagePrompt = input.imagePromptByShotId?.[shot.id]?.trim() || generatedImagePrompt;
    const promptSource = videoPromptOverride ? "manual_edit" : "initial";
    return {
      id: taskIds[index]!,
      index,
      status: "queued",
      type: "video",
      prompt,
      model: input.videoModelId,
      durationSeconds: shot.durationSeconds,
      createdAt: now,
      updatedAt: now,
      storyboardContext: {
        aspectRatio: input.aspectRatio,
        duration: shot.durationSeconds,
        model: input.videoModelId,
        referenceImages: shot.selectedReferenceImages.map(referenceToStoryboardImage),
        referenceVideos: [],
        extraParams: {
          source: "presentation_article_storyboard_video",
          sourceDraftId: input.sourceDraftId,
          sourceMode: "article-storyboard-video",
          idempotencyKey: `presentation_article_storyboard_video:${input.sourceDraftId}`,
          videoSegmentId: shot.id,
          videoSegmentShotIds: [shot.id],
          videoSegmentPlanVersion: 1,
          videoSegmentPlanHash: planHash,
          videoSegmentPromptStale: false,
          pageId: shot.pageId,
          pageNumber: shot.pageNumber,
          shotId: shot.id,
          overlay: shot.overlay,
          articleStoryboardVideo: {
            schemaVersion: 1,
            sourceDraftId: input.sourceDraftId,
            promptSkillId: "seedance-multishot-review",
            scriptSkillId: "article-storytelling-voiceover-script",
            audioStrategy: input.audioResolution.resolved ?? input.audioResolution.requested,
            requestedAudioStrategy: input.audioResolution.requested,
            resolvedAudioStrategy: input.audioResolution.resolved,
            audioReasonCode: input.audioResolution.reasonCode,
            nativeAudioAllowed: input.audioResolution.nativeAudioAllowed,
            separateTtsAllowed: input.audioResolution.separateTtsAllowed,
            fallbackOffered: input.audioResolution.fallbackOffered,
            ttsRenderStrategy: input.audioResolution.ttsRenderStrategy,
            voiceConfig: input.voiceConfig,
            imageReferencePrompt: imagePrompt,
            generatedImageReferencePrompt: generatedImagePrompt,
            videoPrompt: prompt,
            generatedVideoPrompt,
            videoPromptOverride: videoPromptOverride || null,
            promptSource,
            characterReferenceImages: shot.characterReferenceImages,
            selectedReferenceIds: shot.selectedReferenceImages.map((reference) => reference.id),
            selectedReferenceImages: shot.selectedReferenceImages,
            staticSlideFallbackUrl: shot.staticSlideFallbackUrl ?? null,
            scriptSegments: shotScriptSegments,
            timing: {
              plannedDurationSeconds: shot.durationSeconds,
              measuredDurationSeconds: null,
              timingSource: "estimated",
            },
          },
        },
      },
    };
  });

  return {
    version: 1,
    name: input.projectName,
    updatedAt: now,
    taskIds,
    selectedTaskIds: taskIds,
    tasks,
    companionAudio: Array.isArray(input.existingDraft?.companionAudio)
      ? [...input.existingDraft!.companionAudio]
      : [],
    companionAudioUpdatedAt: typeof input.existingDraft?.companionAudioUpdatedAt === "number"
      ? input.existingDraft.companionAudioUpdatedAt
      : null,
    compoundStatus: input.existingDraft?.compoundStatus ?? null,
    projectLink: input.existingDraft?.projectLink ?? null,
    renderJobId: input.existingDraft?.renderJobId ?? null,
    voiceoverFullScript: input.scriptSegments?.map((segment) => segment.text).join("\n") || input.existingDraft?.voiceoverFullScript || null,
    useVoiceoverScriptAsConcept: true,
    videoSegmentState: {
      schemaVersion: 1,
      effectiveMode: "per_shot",
      promptSource: input.videoPromptOverridesByShotId && Object.values(input.videoPromptOverridesByShotId).some((value) => value.trim())
        ? "manual_edit"
        : "initial",
      staleTaskIds: [],
      staleReason: null,
      videoSegmentPlan: {
        schemaVersion: 1,
        sourceSurface: "storyboard_review",
        mode: "per_shot",
        effectiveMode: "per_shot",
        videoModelId: input.videoModelId,
        ...(input.videoProvider ? { provider: input.videoProvider } : {}),
        audioStrategy: input.audioResolution.resolved ?? input.audioResolution.requested,
        referenceMode: "single_storyboard_frame",
        creativePresets: [],
        segments: input.shots.map((shot, index) => ({
          segmentId: shot.id,
          index,
          shotIds: [shot.id],
          durationSeconds: shot.durationSeconds,
          referenceMode: "single_storyboard_frame",
          referenceImageUrls: shot.selectedReferenceImages.map((reference) => reference.url),
          startFrameUrl: shot.selectedReferenceImages[0]?.url,
          subShots: [{
            shotId: shot.id,
            index: 0,
            durationSeconds: shot.durationSeconds,
            title: shot.articleTitle,
            visualPrompt: buildArticleStoryboardSeedancePromptText({
              shot,
              audioResolution: input.audioResolution,
              scriptSegments: scriptByShotId.get(shot.id) ?? [],
            }),
            voiceover: (scriptByShotId.get(shot.id) ?? []).map((segment) => segment.text).join("\n") || undefined,
          }],
          warnings: shot.warningCodes.map((code) => ({
            code,
            message: code.replace(/_/g, " "),
            severity: "warning",
            source: "planner",
            segmentId: shot.id,
            shotIds: [shot.id],
          })),
        })),
        warnings: buildArticleStoryboardVideoSegmentPlanWarnings(input.shots),
        planHash,
      },
    },
  };
}

export function isDuplicateArticleStoryboardVideoHandoff(
  existingDraft: Partial<ArticleStoryboardReviewDraftLike> | null | undefined,
  sourceDraftId: string,
): boolean {
  const expectedKey = `presentation_article_storyboard_video:${sourceDraftId}`;
  return Boolean(existingDraft?.tasks?.some((task) => (
    task.storyboardContext?.extraParams?.idempotencyKey === expectedKey
  )));
}

export function normalizeArticleStoryboardLegacyWarnings(
  draft: Partial<ArticleStoryboardReviewDraftLike> | null | undefined,
): string[] {
  if (!draft?.tasks?.length) {
    return ["legacy_metadata_defaults"];
  }
  const warnings: string[] = [];
  for (const task of draft.tasks) {
    const metadata = task.storyboardContext?.extraParams?.articleStoryboardVideo as Record<string, unknown> | undefined;
    if (!metadata) {
      warnings.push("legacy_metadata_defaults");
      continue;
    }
    const voiceConfig = metadata.voiceConfig as { speakers?: Array<{ voiceId?: string }> } | undefined;
    if (metadata.audioStrategy === "separate_tts_voiceover" && voiceConfig?.speakers?.some((speaker) => !speaker.voiceId)) {
      warnings.push("missing_voice_id_recoverable");
    }
  }
  return Array.from(new Set(warnings));
}
