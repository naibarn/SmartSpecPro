import type {
  StoryboardClipMediaType,
  StoryboardClipTransition,
  StoryboardCompanionAudioCandidate,
} from "@/lib/storyboardVideoProject";
import type { StoryboardReviewTask } from "@/components/media/StoryboardBatchReviewDialog";
import { normalizeStoryboardMediaUrl } from "@/lib/storyboardReviewMedia";
import {
  buildVeo31StoryboardVideoPrompt,
  extractStoryboardNativeSpeechText,
  type StoryboardPromptSpeechMode,
} from "@shared/storyboardPromptAudio";
import { updateArticleStoryboardCurrentPromptMetadata } from "@shared/articleStoryboardVideo";
import type { MediaTaskTransportMetadata } from "@shared/mcpConnectTypes";
import {
  normalizeVideoSegmentCreativeBrief,
  planVideoSegments,
  synthesizePerShotVideoSegmentPlan,
  type VideoSegmentAudioStrategy,
  type VideoSegment,
  type VideoSegmentPlan,
  type VideoSegmentPlannerShot,
  type VideoSegmentReferenceMode,
  type VideoSegmentStructureMode,
} from "@shared/videoSegmentPlanner";

export interface StoryboardReferenceImage {
  url: string;
  name?: string;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
  productionContext?: StoryboardProductionContext | null;
}

export type StoryboardReferenceFrameRole = "start" | "stop" | "reference";

export interface StoryboardReferenceVideo {
  url?: string;
}

export interface StoryboardVideoGenerationContext {
  aspectRatio: string;
  duration?: number;
  model?: string;
  referenceImages: StoryboardReferenceImage[];
  referenceVideos: StoryboardReferenceVideo[];
  extraParams?: Record<string, any>;
  apiConfig?: Record<string, string>;
  resolution?: string;
  referenceVideoUrl?: string;
  useReferenceVideoUrlFallback?: boolean;
  productionContext?: StoryboardProductionContext | null;
  transportMetadata?: Partial<MediaTaskTransportMetadata> | null;
}

export interface StoryboardGenerationTask {
  id: string;
  index: number;
  status: "queued" | "generating" | "completed" | "error";
  type: string;
  prompt: string;
  model: string;
  durationSeconds?: number;
  transition?: StoryboardClipTransition;
  createdAt: number;
  updatedAt: number;
  url?: string;
  error?: string;
  backendTaskId?: string;
  providerTaskId?: string;
  statusDetail?: string;
  source?: "generated" | "imported";
  aspectRatio?: string;
  storyboardContext?: StoryboardVideoGenerationContext;
  transportMetadata?: Partial<MediaTaskTransportMetadata> | null;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
  productionContext?: StoryboardProductionContext | null;
}

export interface MarketplaceProductReferenceContext {
  productId?: string | null;
  platform: "shopee" | "tiktok_shop";
  productName?: string | null;
  shopName?: string | null;
  shopId?: string | null;
  itemId?: string | null;
  sourceUrl?: string | null;
  affiliateUrl?: string | null;
}

export interface StoryboardProductionContext {
  productionRunId?: string | null;
  productionProjectTitle?: string | null;
  productionStoryConceptId?: string | null;
  productionStoryConceptTitle?: string | null;
  productionStoryConceptAngle?: string | null;
  productionStoryConceptDetails?: string | null;
  videoConcept?: string | null;
  voiceoverFullScript?: string | null;
  storyboardGuide?: string | null;
  sourceGridUrl?: string | null;
  sourceShotId?: string | null;
  sourceShotTitle?: string | null;
  sourceShotTimeRange?: string | null;
  sourceShotScript?: string | null;
  sourceShotVideoPrompt?: string | null;
}

export interface StoryboardReviewDraft {
  version: 1;
  reviewId?: number | null;
  name?: string | null;
  updatedAt: number;
  taskIds: string[];
  selectedTaskIds: string[];
  tasks: StoryboardGenerationTask[];
  companionAudio: StoryboardCompanionAudioCandidate[];
  companionAudioUpdatedAt?: number | null;
  compoundStatus: string | null;
  projectLink: string | null;
  renderJobId: string | null;
  /** Marketplace product context attached to this storyboard for story/script generation */
  marketplaceContext?: MarketplaceProductReferenceContext | null;
  /** Manual Storyboard Review identity for HyperFrames renders without Marketplace Capture context */
  manualHyperframesProductId?: string | null;
  manualHyperframesRunId?: string | null;
  /** Production project/concept context propagated from Media Studio into Storyboard Review */
  productionContext?: StoryboardProductionContext | null;
  /** Production Director concept details used as creative guidance for prompt planning */
  conceptDetails?: string | null;
  /** Storyboard guide/instructions used as scene and voiceover planning context */
  storyboardGuide?: string | null;
  /** User-editable combined narration used for prompt planning and speech regeneration */
  voiceoverFullScript?: string | null;
  /** When true, planner treats voiceoverFullScript as the primary concept/content source */
  useVoiceoverScriptAsConcept?: boolean;
  videoSegmentState?: StoryboardVideoSegmentState | null;
}

const MANUAL_STORYBOARD_TASK_ID_PATTERN = /^manual-shot-\d+-(.+)$/;

export function deriveManualHyperframesIdentityFromStoryboardTasks(
  tasks: Array<Pick<StoryboardGenerationTask, "id">> | null | undefined,
): { productId: string; runId: string } | null {
  if (!Array.isArray(tasks)) return null;
  const suffixes = new Set<string>();
  for (const task of tasks) {
    const id = typeof task.id === "string" ? task.id.trim() : "";
    const suffix = id.match(MANUAL_STORYBOARD_TASK_ID_PATTERN)?.[1]?.trim();
    if (suffix) suffixes.add(suffix);
  }
  if (suffixes.size !== 1) return null;
  const [suffix] = [...suffixes];
  return {
    productId: `manual_storyboard_product_${suffix}`,
    runId: `manual_storyboard_run_${suffix}`,
  };
}

export interface StoryboardVideoSegmentState {
  schemaVersion: 1;
  videoSegmentPlan: VideoSegmentPlan;
  effectiveMode: string;
  promptSource: "initial" | "regenerated" | "manual_edit";
  lastPromptGeneratedAt?: string | null;
  staleTaskIds?: string[];
  staleReason?: string | null;
  splitRetryRequiresConfirmation?: boolean;
}

export interface ApplyStoryboardReviewVideoOptionsInput {
  videoModel: string;
  videoStructureMode: VideoSegmentStructureMode;
  manualVideoGroupSize?: number | null;
  provider?: string | null;
  transport?: "gateway_api" | "mcp" | null;
  transportMetadata?: Partial<MediaTaskTransportMetadata> | null;
  includeVoiceover: boolean;
  speechMode?: StoryboardPromptSpeechMode;
  speechLanguage?: string | null;
  includeSound?: boolean;
  promptTone?: string | null;
  promptLanguage?: string | null;
  creativeBrief?: string | null;
  now?: number;
}

export function evaluateStoryboardVideoSegmentPromptGenerationGate(input: {
  taskId: string;
  taskExtraParams?: Record<string, unknown> | null;
  videoSegmentState?: StoryboardVideoSegmentState | null;
}): { allowed: true } | { allowed: false; reasonCode: string; message: string } {
  const extraParams = input.taskExtraParams ?? {};
  const staleFromTask = extraParams.videoSegmentPromptStale === true;
  const staleFromState =
    input.videoSegmentState?.staleTaskIds?.includes(input.taskId) ?? false;
  if (!staleFromTask && !staleFromState) return { allowed: true };
  const promptSource =
    typeof extraParams.promptSource === "string"
      ? extraParams.promptSource
      : input.videoSegmentState?.promptSource;
  const explicitlyKept =
    extraParams.videoSegmentPromptExplicitlyKept === true ||
    extraParams.videoSegmentPromptKeepCurrent === true;
  if (promptSource === "manual_edit" || explicitlyKept) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reasonCode: "video_segment_prompt_stale",
    message:
      "This video segment prompt is stale. Regenerate the segment prompt or explicitly keep the current prompt before paid generation.",
  };
}

export function applyRegeneratedVideoSegmentPromptToDraft(
  draft: StoryboardReviewDraft,
  input: {
    segmentId: string;
    prompt: string;
    taskIds?: string[];
    generatedAt?: string;
    creativeBriefHash?: string;
    now?: number;
  },
): StoryboardReviewDraft {
  const segmentId = input.segmentId.trim();
  const prompt = input.prompt.trim();
  if (!segmentId || !prompt) return draft;
  const explicitTaskIds = (input.taskIds ?? []).map((id) => id.trim()).filter(Boolean);
  const hasExplicitTaskIds = explicitTaskIds.length > 0;
  const targetTaskIds = new Set(explicitTaskIds);
  const now = input.now ?? Date.now();
  const generatedAt = input.generatedAt ?? new Date(now).toISOString();
  const nextTasks = draft.tasks.map((task) => {
    const extraParams = task.storyboardContext?.extraParams ?? {};
    const taskSegmentId =
      typeof extraParams.videoSegmentId === "string" ? extraParams.videoSegmentId.trim() : "";
    const matchesSegment = taskSegmentId === segmentId;
    const shouldUpdate = hasExplicitTaskIds
      ? targetTaskIds.has(task.id)
      : matchesSegment;
    if (!shouldUpdate) return task;
    targetTaskIds.add(task.id);
    const nextExtraParams = updateArticleStoryboardCurrentPromptMetadata(
      {
        ...extraParams,
        promptSource: "regenerated",
        videoSegmentPrompt: prompt,
        videoSegmentPromptStale: false,
        videoSegmentPromptGeneratedAt: generatedAt,
        ...(input.creativeBriefHash
          ? { videoSegmentPromptCreativeBriefHash: input.creativeBriefHash }
          : {}),
      },
      prompt,
      "regenerated",
    );
    return {
      ...task,
      prompt,
      updatedAt: now,
      storyboardContext: task.storyboardContext
        ? {
            ...task.storyboardContext,
            extraParams: nextExtraParams,
          }
        : task.storyboardContext,
    };
  });
  const previousStaleTaskIds = draft.videoSegmentState?.staleTaskIds ?? [];
  const nextStaleTaskIds = previousStaleTaskIds.filter((id) => !targetTaskIds.has(id));
  return {
    ...draft,
    updatedAt: now,
    tasks: nextTasks,
    videoSegmentState: draft.videoSegmentState
      ? {
          ...draft.videoSegmentState,
          promptSource: "regenerated",
          lastPromptGeneratedAt: generatedAt,
          staleTaskIds: nextStaleTaskIds,
          staleReason: nextStaleTaskIds.length > 0
            ? draft.videoSegmentState.staleReason ?? null
            : null,
        }
      : draft.videoSegmentState,
  };
}

function sanitizeStoryboardSegmentId(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "shot";
}

function getStoryboardTaskSegmentId(task: StoryboardGenerationTask): string {
  const value = task.storyboardContext?.extraParams?.videoSegmentId;
  return typeof value === "string" ? value.trim() : "";
}

function getStoryboardTaskSegmentShotIds(task: StoryboardGenerationTask): string[] {
  const value = task.storyboardContext?.extraParams?.videoSegmentShotIds;
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function findStoryboardVideoSegment(
  plan: VideoSegmentPlan | null | undefined,
  task: StoryboardGenerationTask,
): VideoSegment | null {
  if (!plan) return null;
  const segmentId = getStoryboardTaskSegmentId(task);
  const shotIds = getStoryboardTaskSegmentShotIds(task);
  return plan.segments.find((segment) => {
    if (segmentId && segment.segmentId === segmentId) return true;
    if (shotIds.length > 1 && shotIds.every((shotId) => segment.shotIds.includes(shotId))) return true;
    return false;
  }) ?? null;
}

export function splitStoryboardVideoSegmentTaskToPerShotFallback(
  draft: StoryboardReviewDraft,
  input: {
    taskId: string;
    confirmed: boolean;
    now?: number;
  },
): StoryboardReviewDraft {
  const taskIndex = draft.tasks.findIndex((task) => task.id === input.taskId);
  if (taskIndex < 0) return draft;
  const sourceTask = draft.tasks[taskIndex];
  if (!sourceTask?.storyboardContext) return draft;
  const segment = findStoryboardVideoSegment(draft.videoSegmentState?.videoSegmentPlan, sourceTask);
  const segmentShotIds = segment?.shotIds ?? getStoryboardTaskSegmentShotIds(sourceTask);
  if (segmentShotIds.length <= 1) return draft;

  const now = input.now ?? Date.now();
  if (!input.confirmed) {
    return {
      ...draft,
      updatedAt: now,
      videoSegmentState: draft.videoSegmentState
        ? {
            ...draft.videoSegmentState,
            splitRetryRequiresConfirmation: true,
            staleReason: "split_retry_requires_confirmation",
          }
        : draft.videoSegmentState,
      tasks: draft.tasks.map((task) => task.id === input.taskId
        ? {
            ...task,
            status: "error",
            updatedAt: now,
            error: task.error,
            storyboardContext: {
              ...task.storyboardContext!,
              extraParams: {
                ...(task.storyboardContext?.extraParams ?? {}),
                splitRetryRequiresConfirmation: true,
                splitFallbackOriginalError:
                  task.error?.trim() ||
                  task.storyboardContext?.extraParams?.splitFallbackOriginalError ||
                  null,
              },
            },
          }
        : task),
    };
  }

  const sourceContext = sourceTask.storyboardContext;
  const sourceExtraParams = sourceContext.extraParams ?? {};
  const sourceSegmentId = (segment?.segmentId ?? getStoryboardTaskSegmentId(sourceTask)) || sourceTask.id;
  const sourceReferenceImages = sourceContext.referenceImages ?? [];
  const sourceDuration = normalizeStoryboardShotDurationSeconds(sourceTask.durationSeconds ?? sourceContext.duration);
  const originalError =
    (typeof sourceExtraParams.splitFallbackOriginalError === "string"
      ? sourceExtraParams.splitFallbackOriginalError.trim()
      : "") ||
    sourceTask.error?.trim() ||
    null;
  const splitTasks: StoryboardGenerationTask[] = segmentShotIds.map((shotId, index) => {
    const subShot = segment?.subShots.find((item) => item.shotId === shotId) ?? segment?.subShots[index];
    const splitSegmentId = `${sanitizeStoryboardSegmentId(sourceSegmentId)}_${sanitizeStoryboardSegmentId(shotId)}`;
    const prompt = subShot?.visualPrompt?.trim()
      ? subShot.visualPrompt.trim()
      : sourceTask.prompt;
    const referenceUrls = segment?.referenceImageUrls?.length
      ? segment.referenceImageUrls
      : sourceReferenceImages.map((image) => image.url).filter(Boolean);
    const referenceImages = referenceUrls.length > 0
      ? referenceUrls.map((url, refIndex) => ({
          ...(sourceReferenceImages[refIndex] ?? {}),
          url,
        }))
      : sourceReferenceImages;
    return {
      ...sourceTask,
      id: `${sourceTask.id}-split-${index + 1}`,
      index: sourceTask.index + index,
      status: "queued" as const,
      prompt,
      durationSeconds: subShot?.durationSeconds ?? Math.max(1, Math.round(sourceDuration / segmentShotIds.length)),
      createdAt: now,
      updatedAt: now,
      url: undefined,
      error: undefined,
      backendTaskId: undefined,
      providerTaskId: undefined,
      statusDetail: undefined,
      storyboardContext: {
        ...sourceContext,
        aspectRatio: sourceContext.aspectRatio,
        duration: subShot?.durationSeconds ?? sourceContext.duration,
        referenceImages,
        extraParams: {
          ...sourceExtraParams,
          shotId,
          videoSegmentId: splitSegmentId,
          videoSegmentShotIds: [shotId],
          originalVideoSegmentId: sourceSegmentId,
          videoSegmentPrompt: prompt,
          videoSegmentPromptStale: false,
          splitFallbackFromSegmentId: sourceSegmentId,
          splitFallbackOriginalError: originalError,
          splitRetryRequiresConfirmation: false,
          splitRetryConfirmedAt: new Date(now).toISOString(),
        },
      },
    };
  });

  const nextTasks = [
    ...draft.tasks.slice(0, taskIndex),
    ...splitTasks,
    ...draft.tasks.slice(taskIndex + 1),
  ].map((task, index): StoryboardGenerationTask => ({ ...task, index }));
  const nextTaskIds = nextTasks.map((task) => task.id);
  const selected = new Set(draft.selectedTaskIds);
  selected.delete(sourceTask.id);
  splitTasks.forEach((task) => selected.add(task.id));
  const nextPlan = draft.videoSegmentState?.videoSegmentPlan
    ? (() => {
        const nextSegments = draft.videoSegmentState!.videoSegmentPlan.segments.flatMap((item) => {
          if (item.segmentId !== sourceSegmentId) return [item];
          return splitTasks.map((task, index) => {
            const shotId = getStoryboardTaskSegmentShotIds(task)[0] ?? task.id;
            return {
              ...item,
              segmentId: getStoryboardTaskSegmentId(task),
              index: item.index + index,
              shotIds: [shotId],
              durationSeconds: task.durationSeconds ?? sourceDuration,
              referenceImageUrls: task.storyboardContext?.referenceImages.map((image) => image.url).filter(Boolean) ?? [],
              subShots: item.subShots.filter((subShot) => subShot.shotId === shotId).slice(0, 1),
              warnings: [
                ...item.warnings,
                {
                  code: "split_fallback_per_shot",
                  message: "Multi-shot segment was split back to per-shot fallback after user confirmation.",
                  severity: "info" as const,
                  source: "fallback" as const,
                  segmentId: getStoryboardTaskSegmentId(task),
                  shotIds: [shotId],
                },
              ],
            };
          });
        }).map((segment, index) => ({ ...segment, index }));
        return {
          ...draft.videoSegmentState!.videoSegmentPlan,
          effectiveMode: nextSegments.every((item) => item.shotIds.length === 1)
            ? "per_shot" as const
            : draft.videoSegmentState!.videoSegmentPlan.effectiveMode,
          segments: nextSegments,
          fallbackReason: "split_fallback_per_shot",
          planHash: `${draft.videoSegmentState!.videoSegmentPlan.planHash}_split_${sanitizeStoryboardSegmentId(sourceSegmentId)}`.slice(0, 96),
        };
      })()
    : undefined;

  return {
    ...draft,
    updatedAt: now,
    taskIds: nextTaskIds,
    selectedTaskIds: nextTaskIds.filter((id) => selected.has(id)),
    tasks: nextTasks,
    videoSegmentState: draft.videoSegmentState
      ? {
          ...draft.videoSegmentState,
          effectiveMode: nextPlan?.effectiveMode ?? draft.videoSegmentState.effectiveMode,
          videoSegmentPlan: nextPlan ?? draft.videoSegmentState.videoSegmentPlan,
          splitRetryRequiresConfirmation: false,
          staleTaskIds: (draft.videoSegmentState.staleTaskIds ?? []).filter((id) => id !== sourceTask.id),
          staleReason: null,
        }
      : draft.videoSegmentState,
  };
}

export interface FirstLastFrameStoryboardImage {
  url: string;
  name?: string;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
  productionContext?: StoryboardProductionContext | null;
}

export interface ReplaceStoryboardReferenceFrameInput {
  taskId: string;
  frameIndex: 0 | 1;
  image: StoryboardReferenceImage;
  now?: number;
  statusDetail?: string;
}

export interface ReplaceStoryboardVideoSlotInput {
  taskId: string;
  mode: "replace" | "insert-after";
  importedTask: StoryboardGenerationTask;
  now?: number;
}

export interface BuildFirstLastFrameStoryboardTasksOptions {
  model: string;
  aspectRatio: string;
  duration?: number;
  extraParams?: Record<string, any>;
  marketplaceContext?: MarketplaceProductReferenceContext | null;
  apiConfig?: Record<string, string>;
  resolution?: string;
  now?: number;
  idPrefix?: string;
  statusDetail?: string;
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  voiceoverFullScript?: string | null;
  productionContext?: StoryboardProductionContext | null;
  includeVoiceover?: boolean;
  speechMode?: StoryboardPromptSpeechMode;
  speechLanguage?: string | null;
  includeSound?: boolean;
  soundBrief?: string | null;
  promptTone?: string | null;
  promptLanguage?: string | null;
}

export const STORYBOARD_REVIEW_DRAFT_STORAGE_KEY = "smartspec_media_studio_storyboard_review_draft_v1";
const STORYBOARD_REVIEW_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS = 8;
const STORYBOARD_VIDEO_SEGMENT_MAX_SHOT_DURATION_SECONDS = 60;
export const STORYBOARD_REVIEW_LEGACY_VIDEO_MODEL_REPLACEMENTS: Record<string, string> = {
  "higgsfield/seedance_unlimited": "higgsfield/seedance_2_0_fast",
  "higgsfield-mcp/enhanced-seedance-2-fast-unlimited": "higgsfield/seedance_2_0_fast",
};

export function normalizeStoryboardReviewVideoModelId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const modelId = value.trim();
  if (!modelId || modelId === "unknown") return undefined;
  return STORYBOARD_REVIEW_LEGACY_VIDEO_MODEL_REPLACEMENTS[modelId] ?? modelId;
}

export function normalizeStoryboardTransportMetadata(
  value: unknown,
): Partial<MediaTaskTransportMetadata> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      transport: "gateway_api",
      originSurface: "storyboard_review",
      creditPolicy: "smartspec_credits",
    };
  }
  const record = value as Record<string, unknown>;
  // Feature 135 — Hermes Grok media worker (section 09 carry-forward from
  // section-08 review): this normalizer previously narrowed `transport` to
  // only "mcp" | "gateway_api" and `creditPolicy` to only
  // "provider_credits_tracked" | "smartspec_credits" — silently corrupting
  // a genuine "hermes_worker" transport / "provider_account" credit policy
  // value down to the gateway defaults. Now that media.ts's async
  // procedures (which storyboard review consumes) have a hermes arm
  // (section 09), this narrowing must preserve those values explicitly.
  const transport =
    record.transport === "mcp"
      ? "mcp"
      : record.transport === "hermes_worker"
        ? "hermes_worker"
        : "gateway_api";
  return {
    transport,
    originSurface: record.originSurface === "storyboard_review" ? "storyboard_review" : "storyboard_review",
    assetType: record.assetType === "image" ? "image" : "video",
    providerKey: typeof record.providerKey === "string" ? record.providerKey : undefined,
    providerDisplayName: typeof record.providerDisplayName === "string" ? record.providerDisplayName : undefined,
    connectionId: typeof record.connectionId === "string" ? record.connectionId : undefined,
    shareId: typeof record.shareId === "string" ? record.shareId : undefined,
    sharedGroupId: typeof record.sharedGroupId === "number" ? record.sharedGroupId : undefined,
    connectionScope: record.connectionScope === "shared" ? "shared" : record.connectionScope === "personal" ? "personal" : undefined,
    creditPolicy:
      record.creditPolicy === "provider_credits_tracked"
        ? "provider_credits_tracked"
        : record.creditPolicy === "provider_account"
          ? "provider_account"
          : "smartspec_credits",
    providerModelId: typeof record.providerModelId === "string" ? record.providerModelId : undefined,
    toolName: typeof record.toolName === "string" ? record.toolName : undefined,
    argumentShape: typeof record.argumentShape === "string" ? record.argumentShape : undefined,
    schemaHash: typeof record.schemaHash === "string" ? record.schemaHash : undefined,
  };
}

function normalizeStoryboardGenerationModelId(value: unknown): string | undefined {
  return normalizeStoryboardReviewVideoModelId(value);
}

export function getStoryboardTaskEffectiveGenerationContext(
  task: StoryboardGenerationTask,
  draft?: Pick<StoryboardReviewDraft, "videoSegmentState"> | null,
): StoryboardVideoGenerationContext | null {
  const context = task.storyboardContext;
  if (!context) return null;
  const model =
    normalizeStoryboardGenerationModelId(draft?.videoSegmentState?.videoSegmentPlan.videoModelId) ??
    normalizeStoryboardGenerationModelId(task.model) ??
    normalizeStoryboardGenerationModelId(context.model);
  const transportMetadataSource =
    task.transportMetadata ??
    context.transportMetadata ??
    context.extraParams?.transportMetadata ??
    null;
  const transportMetadata = transportMetadataSource
    ? normalizeStoryboardTransportMetadata(transportMetadataSource)
    : null;
  return {
    ...context,
    ...(model ? { model } : {}),
    transportMetadata,
  };
}

function normalizeStoryboardProductionContext(value: unknown): StoryboardProductionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const context: StoryboardProductionContext = {};
  ([
    "productionRunId",
    "productionProjectTitle",
    "productionStoryConceptId",
    "productionStoryConceptTitle",
    "productionStoryConceptAngle",
    "productionStoryConceptDetails",
    "videoConcept",
    "voiceoverFullScript",
    "storyboardGuide",
    "sourceGridUrl",
    "sourceShotId",
    "sourceShotTitle",
    "sourceShotTimeRange",
    "sourceShotScript",
    "sourceShotVideoPrompt",
  ] as const).forEach((key) => {
    const text = typeof record[key] === "string" ? record[key].trim() : "";
    if (text) context[key] = text;
  });
  return Object.keys(context).length > 0 ? context : null;
}

function normalizeStoryboardShotDurationSeconds(value: unknown): number {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    return DEFAULT_STORYBOARD_REVIEW_SHOT_DURATION_SECONDS;
  }
  return Math.min(
    STORYBOARD_VIDEO_SEGMENT_MAX_SHOT_DURATION_SECONDS,
    Math.round(duration * 100) / 100,
  );
}

function normalizeStoryboardVideoStructureModeValue(
  value: unknown,
): VideoSegmentStructureMode {
  return value === "adaptive_multi_shot" ||
    value === "compact_multi_shot" ||
    value === "manual_group_size"
    ? value
    : "per_shot";
}

function normalizeStoryboardVideoAudioStrategyValue(
  value: unknown,
): VideoSegmentAudioStrategy {
  return value === "native_video_audio" ||
    value === "separate_tts_voiceover" ||
    value === "silent"
    ? value
    : "auto";
}

function normalizeStoryboardVideoReferenceModeValue(
  value: unknown,
): VideoSegmentReferenceMode {
  return value === "start_stop" || value === "segment_start_end"
    ? value
    : "single_storyboard_frame";
}

function normalizeStoryboardManualGroupSize(value: unknown): number | undefined {
  const size = Number(value);
  if (!Number.isFinite(size)) return undefined;
  const rounded = Math.trunc(size);
  return rounded >= 1 && rounded <= 12 ? rounded : undefined;
}

function getStoryboardTaskShotId(task: StoryboardGenerationTask, index: number): string {
  const existing = task.storyboardContext?.extraParams?.shotId;
  return typeof existing === "string" && existing.trim()
    ? existing.trim()
    : task.id || `shot-${index + 1}`;
}

function getStoryboardTaskTitle(task: StoryboardGenerationTask): string | undefined {
  const extraParams = task.storyboardContext?.extraParams ?? {};
  const productionContext = normalizeStoryboardProductionContext(
    task.productionContext ??
      task.storyboardContext?.productionContext ??
      extraParams.productionContext,
  );
  const title =
    typeof extraParams.sourceShotTitle === "string"
      ? extraParams.sourceShotTitle.trim()
      : productionContext?.sourceShotTitle?.trim() ?? "";
  return title || undefined;
}

function getStoryboardTaskVoiceover(task: StoryboardGenerationTask): string | undefined {
  const extraParams = task.storyboardContext?.extraParams ?? {};
  const planner =
    extraParams.storyboardPromptPlanner &&
    typeof extraParams.storyboardPromptPlanner === "object" &&
    !Array.isArray(extraParams.storyboardPromptPlanner)
      ? extraParams.storyboardPromptPlanner as Record<string, unknown>
      : {};
  const voiceover =
    typeof planner.voiceoverScript === "string" && planner.voiceoverScript.trim()
      ? planner.voiceoverScript.trim()
      : typeof extraParams.voiceoverScript === "string" && extraParams.voiceoverScript.trim()
        ? extraParams.voiceoverScript.trim()
        : extractStoryboardNativeSpeechText(task.prompt);
  return voiceover || undefined;
}

function buildStoryboardVideoSegmentPlannerShots(
  draft: Pick<StoryboardReviewDraft, "taskIds" | "tasks">,
): VideoSegmentPlannerShot[] {
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  return draft.taskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task) && task?.type !== "image")
    .map((task, index) => ({
      shotId: getStoryboardTaskShotId(task, index),
      index,
      title: getStoryboardTaskTitle(task),
      visualPrompt: task.prompt,
      voiceover: getStoryboardTaskVoiceover(task),
      durationSeconds: normalizeStoryboardShotDurationSeconds(
        task.durationSeconds ?? task.storyboardContext?.duration,
      ),
      storyboardFrameUrl: task.storyboardContext?.referenceImages?.[0]?.url,
      startFrameUrl: task.storyboardContext?.referenceImages?.[0]?.url,
      stopFrameUrl: task.storyboardContext?.referenceImages?.[1]?.url,
    }));
}

function inferStoryboardVideoReferenceMode(
  draft: Pick<StoryboardReviewDraft, "taskIds" | "tasks">,
  fallback?: VideoSegmentReferenceMode,
): VideoSegmentReferenceMode {
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  const firstVideoTask = draft.taskIds
    .map((taskId) => taskById.get(taskId))
    .find((task): task is StoryboardGenerationTask => Boolean(task) && task?.type !== "image");
  if (!firstVideoTask?.storyboardContext) {
    return fallback ?? "single_storyboard_frame";
  }
  const roles = Array.isArray(firstVideoTask.storyboardContext.extraParams?.referenceFrameRoles)
    ? firstVideoTask.storyboardContext.extraParams.referenceFrameRoles
    : [];
  const hasStartStopRoles = roles[0] === "start" && roles[1] === "stop";
  const hasTwoFrames = (firstVideoTask.storyboardContext.referenceImages ?? [])
    .filter((image) => String(image?.url ?? "").trim())
    .length >= 2;
  return hasStartStopRoles || hasTwoFrames
    ? "start_stop"
    : fallback ?? "single_storyboard_frame";
}

function resolveStoryboardReviewVideoOptionsAudioStrategy(
  draft: StoryboardReviewDraft,
  includeVoiceover: boolean,
): VideoSegmentAudioStrategy {
  const existingPlanAudio = draft.videoSegmentState?.videoSegmentPlan.audioStrategy;
  const firstTaskAudio = draft.tasks
    .map((task) =>
      normalizeStoryboardVideoAudioStrategyValue(
        task.storyboardContext?.extraParams?.resolvedAudioStrategy ??
          task.storyboardContext?.extraParams?.audioStrategy,
      )
    )
    .find((value) => value !== "auto");
  if (includeVoiceover) return "native_video_audio";
  if (existingPlanAudio === "separate_tts_voiceover" || firstTaskAudio === "separate_tts_voiceover") {
    return "separate_tts_voiceover";
  }
  return "silent";
}

function storyboardStringArraysEqual(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return right.every((value, index) => left[index] === value);
}

function normalizeStoryboardVideoSegmentState(
  value: unknown
): StoryboardVideoSegmentState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const plan = record.videoSegmentPlan;
  if (!plan || typeof plan !== "object") return null;
  return {
    schemaVersion: 1,
    videoSegmentPlan: plan as VideoSegmentPlan,
    effectiveMode:
      typeof record.effectiveMode === "string"
        ? record.effectiveMode
        : (plan as VideoSegmentPlan).effectiveMode,
    promptSource:
      record.promptSource === "regenerated" || record.promptSource === "manual_edit"
        ? record.promptSource
        : "initial",
    lastPromptGeneratedAt:
      typeof record.lastPromptGeneratedAt === "string"
        ? record.lastPromptGeneratedAt
        : null,
    staleTaskIds: Array.isArray(record.staleTaskIds)
      ? record.staleTaskIds.filter((id): id is string => typeof id === "string")
      : [],
    staleReason:
      typeof record.staleReason === "string" ? record.staleReason : null,
    splitRetryRequiresConfirmation: Boolean(
      record.splitRetryRequiresConfirmation
    ),
  };
}

function synthesizeStoryboardVideoSegmentState(
  draft: Pick<StoryboardReviewDraft, "tasks">
): StoryboardVideoSegmentState | null {
  const videoTasks = draft.tasks.filter(task => task.type !== "image");
  if (videoTasks.length === 0) return null;
  const firstTask = videoTasks[0];
  const plan = synthesizePerShotVideoSegmentPlan({
    sourceSurface: "storyboard_review",
    videoModelId: firstTask?.model || firstTask?.storyboardContext?.model || "unknown",
    transport:
      firstTask?.transportMetadata?.transport === "mcp" ||
      firstTask?.storyboardContext?.transportMetadata?.transport === "mcp"
        ? "mcp"
        : "gateway_api",
    audioStrategy:
      firstTask?.storyboardContext?.extraParams?.resolvedAudioStrategy ??
      firstTask?.storyboardContext?.extraParams?.audioStrategy ??
      "auto",
    referenceMode:
      firstTask?.storyboardContext?.referenceImages?.length === 2
        ? "start_stop"
        : "single_storyboard_frame",
    shots: videoTasks.map((task, index) => {
      const frameTask = task as StoryboardGenerationTask & {
        startFrameUrl?: string | null;
        stopFrameUrl?: string | null;
      };
      return {
        shotId:
          typeof task.storyboardContext?.extraParams?.shotId === "string"
            ? task.storyboardContext.extraParams.shotId
            : task.id,
        index,
        title:
          typeof task.storyboardContext?.extraParams?.sourceShotTitle === "string"
            ? task.storyboardContext.extraParams.sourceShotTitle
            : undefined,
        visualPrompt: task.prompt,
        voiceover:
          typeof task.storyboardContext?.extraParams?.voiceoverScript === "string"
            ? task.storyboardContext.extraParams.voiceoverScript
            : undefined,
        durationSeconds: normalizeStoryboardShotDurationSeconds(
          task.durationSeconds ?? task.storyboardContext?.duration
        ),
        storyboardFrameUrl: task.storyboardContext?.referenceImages?.[0]?.url,
        startFrameUrl:
          frameTask.startFrameUrl ?? task.storyboardContext?.referenceImages?.[0]?.url,
        stopFrameUrl:
          frameTask.stopFrameUrl ?? task.storyboardContext?.referenceImages?.[1]?.url,
      };
    }),
  });
  return {
    schemaVersion: 1,
    videoSegmentPlan: plan,
    effectiveMode: plan.effectiveMode,
    promptSource: "initial",
    staleTaskIds: [],
  };
}

export function applyStoryboardReviewVideoOptionsToDraft(
  draft: StoryboardReviewDraft,
  input: ApplyStoryboardReviewVideoOptionsInput,
): StoryboardReviewDraft {
  const requestedModel = normalizeStoryboardReviewVideoModelId(input.videoModel) ?? "";
  const fallbackModel =
    normalizeStoryboardReviewVideoModelId(draft.videoSegmentState?.videoSegmentPlan.videoModelId) ||
    normalizeStoryboardReviewVideoModelId(draft.tasks.find((task) => task.type !== "image")?.storyboardContext?.model) ||
    normalizeStoryboardReviewVideoModelId(draft.tasks.find((task) => task.type !== "image")?.model) ||
    "veo3/generate-veo-3-video-lite";
  const videoModel = requestedModel || fallbackModel;
  const videoStructureMode = normalizeStoryboardVideoStructureModeValue(
    input.videoStructureMode,
  );
  const manualGroupSize =
    videoStructureMode === "manual_group_size"
      ? normalizeStoryboardManualGroupSize(input.manualVideoGroupSize) ?? 3
      : undefined;
  const speechMode = input.includeVoiceover
    ? input.speechMode ?? "th"
    : "none";
  const speechLanguage = input.includeVoiceover
    ? String(
        input.speechLanguage ??
          (speechMode === "th" ? "Thai" : speechMode === "en" ? "English" : ""),
      ).trim()
    : "";
  const includeSound = Boolean(input.includeSound);
  const promptTone = typeof input.promptTone === "string" ? input.promptTone.trim() : "";
  const promptLanguage = typeof input.promptLanguage === "string" ? input.promptLanguage.trim() : "";
  const audioStrategy = resolveStoryboardReviewVideoOptionsAudioStrategy(
    draft,
    Boolean(input.includeVoiceover),
  );
  const currentPlan = draft.videoSegmentState?.videoSegmentPlan ?? null;
  const nextTransport = input.transport === "mcp" ? "mcp" : input.transport === "gateway_api"
    ? "gateway_api"
    : currentPlan?.transport ?? "gateway_api";
  const nextProvider = typeof input.provider === "string" && input.provider.trim()
    ? input.provider.trim()
    : currentPlan?.provider;
  const hasInputTransportMetadata = Object.prototype.hasOwnProperty.call(input, "transportMetadata");
  const nextTransportMetadata = hasInputTransportMetadata ? input.transportMetadata ?? null : null;
  const shots = buildStoryboardVideoSegmentPlannerShots(draft);
  const referenceMode = normalizeStoryboardVideoReferenceModeValue(
    currentPlan?.referenceMode ?? inferStoryboardVideoReferenceMode(draft),
  );
  const nextPlan = shots.length > 0
    ? planVideoSegments({
        sourceSurface: "storyboard_review",
        mode: videoStructureMode,
        manualGroupSize,
        videoModelId: videoModel,
        provider: nextProvider,
        transport: nextTransport,
        audioStrategy,
        referenceMode,
        creativeBrief:
          normalizeVideoSegmentCreativeBrief(input.creativeBrief) ??
          currentPlan?.creativeBrief,
        creativePresets: currentPlan?.creativePresets ?? [],
        shots,
      })
    : currentPlan;
  if (!nextPlan) return draft;

  const previousPlan = currentPlan;
  const structureChanged =
    previousPlan?.mode !== nextPlan.mode ||
    previousPlan?.effectiveMode !== nextPlan.effectiveMode ||
    previousPlan?.manualGroupSize !== nextPlan.manualGroupSize ||
    previousPlan?.planHash !== nextPlan.planHash;
  const modelChanged = previousPlan?.videoModelId !== nextPlan.videoModelId;
  const transportChanged =
    previousPlan?.transport !== nextPlan.transport ||
    (previousPlan?.provider ?? "") !== (nextPlan.provider ?? "");
  const audioChanged = previousPlan?.audioStrategy !== nextPlan.audioStrategy;
  const now = input.now ?? Date.now();
  const segmentByShotId = new Map<string, VideoSegment>();
  nextPlan.segments.forEach((segment) => {
    segment.shotIds.forEach((shotId) => {
      segmentByShotId.set(shotId, segment);
    });
  });

  let changed = !previousPlan ||
    structureChanged ||
    modelChanged ||
    audioChanged ||
    draft.videoSegmentState?.effectiveMode !== nextPlan.effectiveMode;
  const staleTaskIds = new Set(draft.videoSegmentState?.staleTaskIds ?? []);
  const nextTasks = draft.tasks.map((task, taskIndex): StoryboardGenerationTask => {
    if (task.type === "image" || !task.storyboardContext) return task;

    const extraParams = task.storyboardContext.extraParams ?? {};
    const shotId = getStoryboardTaskShotId(task, taskIndex);
    const segment = segmentByShotId.get(shotId);
    const existingPlanner =
      extraParams.storyboardPromptPlanner &&
      typeof extraParams.storyboardPromptPlanner === "object" &&
      !Array.isArray(extraParams.storyboardPromptPlanner)
        ? extraParams.storyboardPromptPlanner as Record<string, unknown>
        : {};
    const segmentChanged = Boolean(
      segment &&
        (extraParams.videoSegmentId !== segment.segmentId ||
          !storyboardStringArraysEqual(extraParams.videoSegmentShotIds, segment.shotIds)),
    );
    const segmentPlanMetadataChanged =
      extraParams.videoSegmentPlanVersion !== nextPlan.schemaVersion ||
      extraParams.videoSegmentPlanHash !== nextPlan.planHash ||
      extraParams.shotId !== shotId;
    const audioMetadataChanged =
      extraParams.audioStrategy !== audioStrategy ||
      (audioStrategy !== "auto" && extraParams.resolvedAudioStrategy !== audioStrategy);
    const plannerChanged =
      existingPlanner.includeVoiceover !== input.includeVoiceover ||
      existingPlanner.speechMode !== speechMode ||
      String(existingPlanner.speechLanguage ?? "") !== speechLanguage ||
      existingPlanner.includeSound !== includeSound ||
      (promptTone ? existingPlanner.tone !== promptTone : false) ||
      (promptLanguage ? existingPlanner.language !== promptLanguage : false);
    const taskModelChanged =
      task.model !== videoModel || task.storyboardContext.model !== videoModel;
    const appliedTaskTransportMetadata = hasInputTransportMetadata
      ? nextTransportMetadata
      : task.transportMetadata ?? null;
    const appliedContextTransportMetadata = hasInputTransportMetadata
      ? nextTransportMetadata
      : task.storyboardContext.transportMetadata ?? null;
    const taskTransportChanged =
      JSON.stringify(task.transportMetadata ?? null) !== JSON.stringify(appliedTaskTransportMetadata) ||
      JSON.stringify(task.storyboardContext.transportMetadata ?? null) !== JSON.stringify(appliedContextTransportMetadata);
    const shouldInvalidateGeneratedClip =
      task.status !== "generating" &&
      (taskModelChanged || transportChanged || structureChanged || audioChanged || plannerChanged);
    const shouldUpdateTask =
      shouldInvalidateGeneratedClip ||
      plannerChanged ||
      taskModelChanged ||
      transportChanged ||
      taskTransportChanged ||
      segmentChanged ||
      segmentPlanMetadataChanged ||
      audioMetadataChanged;
    if (shouldUpdateTask) {
      changed = true;
    }
    if (structureChanged || modelChanged || transportChanged || audioChanged || plannerChanged) {
      staleTaskIds.add(task.id);
    }
    if (!shouldUpdateTask) return task;
    return {
      ...task,
      model: videoModel,
      status: shouldInvalidateGeneratedClip && task.status === "completed"
        ? "queued"
        : task.status,
      url: shouldInvalidateGeneratedClip && task.status === "completed"
        ? undefined
        : task.url,
      backendTaskId: shouldInvalidateGeneratedClip && task.status !== "generating"
        ? undefined
        : task.backendTaskId,
      providerTaskId: shouldInvalidateGeneratedClip && task.status !== "generating"
        ? undefined
        : task.providerTaskId,
      error: shouldInvalidateGeneratedClip ? undefined : task.error,
      statusDetail: shouldInvalidateGeneratedClip
        ? "Video options changed. Regenerate this clip with the updated settings."
        : task.statusDetail,
      updatedAt: shouldInvalidateGeneratedClip || plannerChanged || taskModelChanged || transportChanged || taskTransportChanged
        ? now
        : task.updatedAt,
      transportMetadata: appliedTaskTransportMetadata,
      storyboardContext: {
        ...task.storyboardContext,
        model: videoModel,
        transportMetadata: appliedContextTransportMetadata,
        extraParams: {
          ...(task.storyboardContext.extraParams ?? {}),
          mediaTransport: nextPlan.transport,
          mediaProvider: nextPlan.provider,
          audioStrategy,
          resolvedAudioStrategy:
            audioStrategy === "auto"
              ? task.storyboardContext.extraParams?.resolvedAudioStrategy
              : audioStrategy,
          shotId,
          videoSegmentPlanVersion: nextPlan.schemaVersion,
          videoSegmentPlanHash: nextPlan.planHash,
          ...(segment
            ? {
                videoSegmentId: segment.segmentId,
                videoSegmentShotIds: segment.shotIds,
              }
            : {}),
          ...(structureChanged || audioChanged || plannerChanged
            ? {
                videoSegmentPromptStale: true,
                promptSource:
                  extraParams.promptSource === "manual_edit"
                    ? "manual_edit"
                    : "initial",
              }
            : {}),
          storyboardPromptPlanner: {
            ...existingPlanner,
            includeVoiceover: Boolean(input.includeVoiceover),
            speechMode,
            speechLanguage,
            includeSound,
            ...(promptTone ? { tone: promptTone } : {}),
            ...(promptLanguage ? { language: promptLanguage } : {}),
          },
        },
      },
    };
  });

  if (!changed) return draft;

  return {
    ...draft,
    updatedAt: now,
    tasks: nextTasks,
    projectLink: null,
    renderJobId: null,
    compoundStatus: null,
    videoSegmentState: {
      schemaVersion: 1,
      videoSegmentPlan: nextPlan,
      effectiveMode: nextPlan.effectiveMode,
      promptSource: structureChanged || audioChanged ? "initial" : draft.videoSegmentState?.promptSource ?? "initial",
      lastPromptGeneratedAt: draft.videoSegmentState?.lastPromptGeneratedAt ?? null,
      staleTaskIds: Array.from(staleTaskIds),
      staleReason: staleTaskIds.size > 0
        ? structureChanged
          ? "video_structure_changed"
          : modelChanged || transportChanged
            ? "video_model_changed"
            : audioChanged
              ? "audio_prompt_options_changed"
              : draft.videoSegmentState?.staleReason ?? "prompt_planner_options_changed"
        : null,
      splitRetryRequiresConfirmation:
        draft.videoSegmentState?.splitRetryRequiresConfirmation ?? false,
    },
  };
}

export function normalizeStoryboardReviewDraft(parsed: Partial<StoryboardReviewDraft> | null | undefined): StoryboardReviewDraft | null {
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.taskIds) || !Array.isArray(parsed.tasks)) {
    return null;
  }

  const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
  const companionAudio = Array.isArray(parsed.companionAudio)
    ? (parsed.companionAudio as StoryboardCompanionAudioCandidate[]).map((audio) => ({
      ...audio,
      url: typeof audio.url === "string" ? normalizeStoryboardMediaUrl(audio.url) : audio.url,
    }))
    : [];
  const companionAudioUpdatedAt = typeof parsed.companionAudioUpdatedAt === "number" && Number.isFinite(parsed.companionAudioUpdatedAt)
    ? parsed.companionAudioUpdatedAt
    : null;
  const baseDraft: StoryboardReviewDraft = {
    version: 1,
    reviewId: typeof parsed.reviewId === "number" ? parsed.reviewId : null,
    name: typeof parsed.name === "string" ? parsed.name : null,
    updatedAt,
    taskIds: parsed.taskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    selectedTaskIds: Array.isArray(parsed.selectedTaskIds)
      ? parsed.selectedTaskIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    tasks: parsed.tasks as StoryboardGenerationTask[],
    companionAudio,
    companionAudioUpdatedAt,
    compoundStatus: typeof parsed.compoundStatus === "string" ? parsed.compoundStatus : null,
    projectLink: typeof parsed.projectLink === "string" ? parsed.projectLink : null,
    renderJobId: typeof parsed.renderJobId === "string" ? parsed.renderJobId : null,
    marketplaceContext: parsed.marketplaceContext ?? null,
    manualHyperframesProductId: typeof parsed.manualHyperframesProductId === "string" ? parsed.manualHyperframesProductId.trim() || null : null,
    manualHyperframesRunId: typeof parsed.manualHyperframesRunId === "string" ? parsed.manualHyperframesRunId.trim() || null : null,
    productionContext: normalizeStoryboardProductionContext(parsed.productionContext),
    conceptDetails: typeof parsed.conceptDetails === "string" ? parsed.conceptDetails : null,
    storyboardGuide: typeof parsed.storyboardGuide === "string" ? parsed.storyboardGuide : null,
    voiceoverFullScript: typeof parsed.voiceoverFullScript === "string" ? parsed.voiceoverFullScript : null,
    useVoiceoverScriptAsConcept: Boolean(parsed.useVoiceoverScriptAsConcept),
    videoSegmentState: normalizeStoryboardVideoSegmentState(
      (parsed as Record<string, unknown>).videoSegmentState
    ),
  };
  return {
    ...baseDraft,
    videoSegmentState:
      baseDraft.videoSegmentState ?? synthesizeStoryboardVideoSegmentState(baseDraft),
  };
}

export function readStoryboardReviewDraft(): StoryboardReviewDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeStoryboardReviewDraft(JSON.parse(raw) as Partial<StoryboardReviewDraft>);
    if (!parsed) return null;
    if (Date.now() - parsed.updatedAt > STORYBOARD_REVIEW_DRAFT_TTL_MS) {
      window.localStorage.removeItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
      return null;
    }
    if (parsed.companionAudio.length > 0 && getStoryboardCompanionAudioUpdatedAt(parsed) <= 0) {
      return {
        ...parsed,
        companionAudio: [],
        companionAudioUpdatedAt: null,
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoryboardReviewDraft(draft: StoryboardReviewDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // The in-memory review page can continue even when local storage is unavailable.
  }
}

export function clearStoryboardReviewDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function getTaskUpdatedAt(task: unknown): number {
  if (!task || typeof task !== "object") return 0;
  const updatedAt = (task as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskUrl(task: unknown): string {
  if (!task || typeof task !== "object") return "";
  const url = (task as { url?: unknown }).url;
  return typeof url === "string" ? url : "";
}

export function getStoryboardCompanionAudioUpdatedAt(draft: Partial<StoryboardReviewDraft> | null | undefined): number {
  const value = draft?.companionAudioUpdatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

export function mergeFresherStoryboardReviewTasks<T extends Partial<StoryboardReviewDraft> | null | undefined>(
  existingDraft: Partial<StoryboardReviewDraft> | null | undefined,
  incomingDraft: T,
): T {
  if (!existingDraft || !incomingDraft) return incomingDraft;
  if (!Array.isArray(existingDraft.tasks) || !Array.isArray(incomingDraft.tasks)) return incomingDraft;

  const existingTaskById = new Map(existingDraft.tasks.map((task) => [task.id, task]));
  const incomingTaskIds = new Set(incomingDraft.tasks.map((task) => task.id));
  const incomingOrder = Array.isArray(incomingDraft.taskIds) ? incomingDraft.taskIds : [];
  const incomingOrderSet = new Set(incomingOrder);
  const incomingUpdatedAt = typeof incomingDraft.updatedAt === "number" ? incomingDraft.updatedAt : 0;
  const existingCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(existingDraft);
  const incomingCompanionAudioUpdatedAt = getStoryboardCompanionAudioUpdatedAt(incomingDraft);
  let changed = false;
  const mergedTasks = incomingDraft.tasks.map((incomingTask) => {
    const existingTask = existingTaskById.get(incomingTask.id);
    if (!existingTask) return incomingTask;
    if (
      getTaskUpdatedAt(existingTask) > getTaskUpdatedAt(incomingTask)
      && getTaskUrl(existingTask) !== getTaskUrl(incomingTask)
    ) {
      changed = true;
      return existingTask;
    }
    return incomingTask;
  });
  const missingLocalTasks = existingDraft.tasks.filter((existingTask) => {
    if (incomingTaskIds.has(existingTask.id)) return false;
    if (Array.isArray(existingDraft.taskIds) && !existingDraft.taskIds.includes(existingTask.id)) return false;
    return existingTask.source === "imported" || getTaskUpdatedAt(existingTask) > incomingUpdatedAt;
  });
  if (missingLocalTasks.length > 0) {
    changed = true;
    mergedTasks.push(...missingLocalTasks);
  }

  const missingLocalTaskIds = new Set(missingLocalTasks.map((task) => task.id));
  const mergedTaskIds = missingLocalTasks.length > 0
    ? [
        ...(Array.isArray(existingDraft.taskIds)
          ? existingDraft.taskIds.filter((id) => incomingOrderSet.has(id) || missingLocalTaskIds.has(id))
          : []),
        ...incomingOrder.filter((id) => {
          const existingOrder = Array.isArray(existingDraft.taskIds) ? existingDraft.taskIds : [];
          return !existingOrder.includes(id);
        }),
      ]
    : incomingDraft.taskIds;
  const mergedSelectedTaskIds = missingLocalTasks.length > 0 && Array.isArray(incomingDraft.selectedTaskIds)
    ? [
        ...incomingDraft.selectedTaskIds,
        ...missingLocalTasks
          .map((task) => task.id)
          .filter((id) => (
            Array.isArray(existingDraft.selectedTaskIds)
            && existingDraft.selectedTaskIds.includes(id)
            && !incomingDraft.selectedTaskIds?.includes(id)
          )),
      ]
    : incomingDraft.selectedTaskIds;

  const incomingCompanionAudio = Array.isArray(incomingDraft.companionAudio) ? incomingDraft.companionAudio : [];
  const existingCompanionAudio = Array.isArray(existingDraft.companionAudio) ? existingDraft.companionAudio : [];
  const shouldUseExistingCompanionAudio = existingCompanionAudioUpdatedAt > incomingCompanionAudioUpdatedAt;
  const mergedCompanionAudio = shouldUseExistingCompanionAudio
    ? existingCompanionAudio
    : incomingDraft.companionAudio;
  if (shouldUseExistingCompanionAudio) {
    changed = true;
  }

  return changed
    ? {
        ...incomingDraft,
        taskIds: mergedTaskIds,
        selectedTaskIds: mergedSelectedTaskIds,
        tasks: mergedTasks,
        companionAudio: mergedCompanionAudio,
        companionAudioUpdatedAt: Math.max(existingCompanionAudioUpdatedAt, incomingCompanionAudioUpdatedAt) || incomingDraft.companionAudioUpdatedAt,
      } as T
    : incomingDraft;
}

export function getStoryboardReviewName(draft: StoryboardReviewDraft): string {
  const explicitName = draft.name?.trim();
  if (explicitName) return explicitName;
  const firstPrompt = draft.tasks[0]?.prompt?.trim();
  const base = firstPrompt ? firstPrompt.slice(0, 52) : "Storyboard Review";
  return `${base}${firstPrompt && firstPrompt.length > 52 ? "..." : ""}`;
}

function normalizeDraftTaskOrder(draft: StoryboardReviewDraft, orderedTaskIds: string[]): StoryboardReviewDraft {
  const order = new Map(orderedTaskIds.map((id, index) => [id, index]));
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  const orderedTasks = orderedTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is StoryboardGenerationTask => Boolean(task))
    .map((task, index) => ({ ...task, index, updatedAt: draft.updatedAt }));
  const orphanTasks = draft.tasks.filter((task) => !order.has(task.id));
  return {
    ...draft,
    taskIds: orderedTaskIds,
    selectedTaskIds: draft.selectedTaskIds.filter((id) => order.has(id)),
    tasks: [...orderedTasks, ...orphanTasks],
  };
}

function compactPromptPlannerOption(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildSplitStoryboardSoundBrief(options: BuildFirstLastFrameStoryboardTasksOptions): string {
  const explicitBrief = compactPromptPlannerOption(options.soundBrief);
  if (explicitBrief) return explicitBrief;
  if (!options.includeSound) return "";
  return "Soft ecommerce room tone with subtle product movement accents.";
}

function pickOrderedStoryboardLine(lines: string[], taskIndex: number, totalTasks: number): string {
  if (lines.length === 0) return "";
  const lastSlotIndex = Math.max(0, totalTasks - 1);
  if (taskIndex <= 0) return lines[0]!;
  if (taskIndex >= lastSlotIndex) return lines[lines.length - 1]!;
  if (lines.length <= 2) return lines[0]!;

  const middleLines = lines.slice(1, -1);
  const middleSlotCount = Math.max(1, lastSlotIndex - 1);
  const middlePosition = Math.max(0, taskIndex - 1);
  const lineIndex = Math.min(
    middleLines.length - 1,
    Math.round((middlePosition / Math.max(1, middleSlotCount - 1)) * (middleLines.length - 1)),
  );
  return middleLines[lineIndex]!;
}

function extractStoryboardShotVoiceoverLines(script: string): string[] {
  const normalized = String(script ?? "")
    .replace(/\r/g, "\n")
    .replace(/VOICEOVER\s+SCRIPT\s+BY\s+SHOT\s*:/gi, "\n")
    .trim();
  if (!normalized) return [];

  const markers: Array<{ start: number; contentStart: number }> = [];
  const markerPattern = /(^|[^\d])(\d{1,2})\.\s+/g;
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(normalized)) !== null) {
    const prefixLength = match[1]?.length ?? 0;
    markers.push({
      start: match.index + prefixLength,
      contentStart: markerPattern.lastIndex,
    });
  }
  if (markers.length === 0) {
    const speechText = extractStoryboardNativeSpeechText(normalized);
    return speechText ? [speechText] : [normalized].filter(Boolean);
  }

  return markers
    .map((marker, index) => {
      const nextStart = markers[index + 1]?.start ?? normalized.length;
      return cleanStoryboardShotVoiceoverLine(normalized.slice(marker.contentStart, nextStart));
    })
    .filter(Boolean);
}

function cleanStoryboardShotVoiceoverLine(raw: string): string {
  let text = raw
    .replace(/^\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*s?\s*/i, "")
    .replace(/^\s*[\d.]+\s*s\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const speechMatch = text.match(/บทพูด\s*(?:\([^)]*\))?\s*[:：]\s*([\s\S]+)/i);
  if (speechMatch?.[1]) {
    text = speechMatch[1].trim();
  } else {
    const colonIndex = text.indexOf(":");
    if (colonIndex >= 0 && colonIndex < 90) {
      text = text.slice(colonIndex + 1).trim();
    }
  }
  return text
    .replace(/^(?:ภาพ|มุมกล้อง|อารมณ์)\s*[:：]\s*/i, "")
    .replace(/^[-–:\s]+/, "")
    .trim();
}

function pickStoryboardVoiceoverLine(lines: string[], taskIndex: number, totalTasks: number): string {
  if (lines.length === 0) return "";
  if (lines.length > totalTasks && taskIndex >= Math.max(0, totalTasks - 1)) {
    return lines[lines.length - 1]!;
  }
  return lines[Math.min(Math.max(0, taskIndex), lines.length - 1)]!;
}

function neutralizeThaiStoryboardFallbackPoliteParticles(value: string): string {
  return compactPromptPlannerOption(value)
    .replace(/นะคะ/g, "นะ")
    .replace(/นะครับ/g, "นะ")
    .replace(/ค่ะ|คะ|ครับ/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildNaturalThaiSplitStoryboardVoiceover(
  options: BuildFirstLastFrameStoryboardTasksOptions,
  taskIndex: number,
  totalTasks: number,
  productName: string,
): string {
  const context = [
    productName,
    options.conceptDetails,
    options.storyboardGuide,
  ].map(compactPromptPlannerOption).join(" ").toLowerCase();
  const isChildDining = /(เก้าอี้.*เด็ก|กินข้าวเด็ก|โต๊ะกินข้าวเด็ก|เด็ก\s*6\s*เดือน|high chair|baby)/i.test(context);
  const isBedsideTable = /(โต๊ะข้างเตียง|ข้างเตียง|ชั้นวาง|bedside|nightstand|side table)/i.test(context);

  if (isChildDining) {
    return pickOrderedStoryboardLine([
      "มื้ออาหารจะง่ายขึ้นมาก แค่เริ่มจากที่นั่งที่ปรับพอดีกับโต๊ะ แล้วรัดเข็มขัดให้ลูกนั่งนิ่งสบายตั้งแต่มื้อแรกค่ะ",
      "พอปรับระดับให้ใกล้โต๊ะ ลูกก็นั่งร่วมมื้ออาหารกับบ้านได้เป็นจังหวะขึ้น ผู้ปกครองป้อนข้าวได้ถนัดกว่าเดิมค่ะ",
      "เข็มขัดนิรภัยช่วยจัดท่านั่งให้อยู่ตำแหน่งเดิม ไม่ต้องคอยขยับซ้ำบ่อย ๆ ระหว่างมื้อก็รู้สึกมั่นใจขึ้นค่ะ",
      "ช็อตนี้ให้เห็นว่าพื้นที่กินข้าวไม่ต้องใหญ่ แค่จัดมุมให้พร้อมใช้ทุกมื้อ ของรอบตัวก็ดูเป็นระเบียบขึ้นค่ะ",
      "พอลูกเริ่มชินกับที่นั่งเดิม มื้ออาหารก็ไหลลื่นกว่าเดิม ผู้ปกครองมีเวลาสนใจกับการกินมากกว่าการจัดท่าค่ะ",
      "ของใช้รอบตัวถูกจัดไว้ใกล้มือ จะหยิบผ้า ช้อน หรือของจำเป็นระหว่างมื้อก็ไม่ต้องลุกไปหาให้วุ่นวายค่ะ",
      "พอมุมกินข้าวเป็นระเบียบ บ้านก็ดูพร้อมสำหรับมื้อต่อไป ไม่ต้องเก็บตั้งต้นใหม่ทุกครั้งหลังใช้งานค่ะ",
      "ทำซ้ำไม่กี่มื้อ มุมกินข้าวก็เป็นระเบียบและพร้อมใช้ทุกวัน ลูกนั่งคุ้นที่เดิม ส่วนผู้ปกครองก็จัดการง่ายขึ้นค่ะ",
    ], taskIndex, totalTasks);
  }

  if (isBedsideTable) {
    return pickOrderedStoryboardLine([
      "มุมข้างเตียงรก ๆ แบบนี้ แค่มีที่วางของเป็นสัดส่วน ห้องก็ดูโล่งขึ้นทันที และหยิบของก่อนนอนได้ง่ายขึ้นค่ะ",
      "เริ่มจากวางโต๊ะให้พอดีกับข้างเตียง ของที่ใช้บ่อยจะอยู่ใกล้มือขึ้น ไม่ต้องวางกองไว้บนพื้นหรือหัวเตียงค่ะ",
      "โคมไฟกับนาฬิกามีที่วางชัดเจน ก่อนนอนก็ไม่ต้องย้ายของไปมา แถมตอนตื่นเช้ายังหยิบใช้งานได้ทันทีค่ะ",
      "หนังสือหรือสมุดเล่มเล็ก ๆ เก็บไว้ชั้นล่างได้ มุมนี้เลยดูไม่แน่นเกินไป แต่ยังมีของจำเป็นอยู่ครบค่ะ",
      "ของใช้ประจำวันอย่างแก้วน้ำหรือรีโมตมีตำแหน่งประจำ จะหยิบตอนเช้าหรือวางคืนก่อนนอนก็เป็นจังหวะเดิมค่ะ",
      "พอจัดของแยกชั้น บนโต๊ะยังดูโล่ง แต่ของจำเป็นก็ยังอยู่ครบ ช่วยให้ห้องดูสะอาดขึ้นโดยไม่ต้องจัดใหญ่ค่ะ",
      "ช็อตนี้ช่วยให้เห็นสเกลจริง ว่ามุมเล็ก ๆ ก็ใช้ประโยชน์ได้โดยไม่เกะกะ และยังเข้ากับห้องนอนได้ง่ายค่ะ",
      "มองรวมแล้วห้องดูสะอาดขึ้น โดยไม่ต้องเปลี่ยนเฟอร์นิเจอร์ชิ้นใหญ่ แค่เพิ่มที่เก็บของให้เข้าที่มากขึ้นค่ะ",
      "ถ้าอยากให้มุมเล็ก ๆ ดูพร้อมใช้ทุกวัน ตัวนี้ช่วยจัดของให้เข้าที่ได้ดี ทั้งโคมไฟ หนังสือ และของหยิบใช้บ่อยค่ะ",
    ], taskIndex, totalTasks);
  }

  return pickOrderedStoryboardLine([
    productName
      ? `ถ้าใช้งานจริงแล้วยังไม่ค่อยลงตัว ลองดูว่า${productName}ช่วยให้ขั้นตอนนี้ง่ายขึ้นยังไง ตั้งแต่เริ่มจัดพื้นที่จนถึงตอนใช้ทุกวันค่ะ`
      : "ถ้าใช้งานจริงแล้วยังไม่ค่อยลงตัว ลองดูวิธีทำให้มุมนี้ใช้ง่ายขึ้น ตั้งแต่การจัดพื้นที่จนถึงตอนหยิบใช้ทุกวันค่ะ",
    "เริ่มจากมุมที่ยังจัดไม่เข้าที่ แล้วค่อย ๆ เห็นตำแหน่งใช้งานที่ชัดขึ้น ของที่ต้องใช้ก็ไม่กระจายเหมือนเดิมค่ะ",
    "พอดูรายละเอียดใกล้ขึ้น จะเห็นว่าของแต่ละชิ้นมีหน้าที่ชัด ไม่ต้องเดาเวลาใช้ และไม่ต้องเสียเวลาหาซ้ำค่ะ",
    "จุดที่น่าสนใจคือมันช่วยลดขั้นตอนเล็ก ๆ ที่ทำให้การใช้งานประจำวันสะดุด พอทุกอย่างอยู่ถูกที่ก็ไหลลื่นขึ้นค่ะ",
    "พอจัดเข้ากับพื้นที่จริง มุมนี้จะดูเป็นระเบียบขึ้นโดยไม่ต้องทำอะไรซับซ้อน แค่มีตำแหน่งให้ของแต่ละอย่างค่ะ",
    "ช็อตนี้ช่วยให้เห็นภาพการใช้จริง ว่าไม่ได้มีแค่สวย แต่ต้องหยิบใช้ได้สะดวก และเข้ากับจังหวะในบ้านได้จริงค่ะ",
    "ช่วงท้ายจะเห็นผลลัพธ์รวม ว่าพื้นที่เล็ก ๆ ก็ดูพร้อมใช้และดูแลง่ายขึ้น โดยไม่ต้องเปลี่ยนอะไรเยอะค่ะ",
    "พอทุกอย่างเข้าที่แล้ว มุมนี้ก็ดูพร้อมใช้ขึ้น ใช้งานจริงได้ง่ายขึ้น และช่วยให้ตัดสินใจได้ชัดกว่าเดิมค่ะ",
  ], taskIndex, totalTasks);
}

function buildSplitStoryboardVoiceoverScript(
  options: BuildFirstLastFrameStoryboardTasksOptions,
  taskIndex: number,
  totalTasks: number,
  marketplaceProduct: MarketplaceProductReferenceContext | null,
): string {
  if (!options.includeVoiceover || String(options.speechMode ?? "none") === "none") return "";

  const suppliedVoiceoverFullScript = compactPromptPlannerOption(options.voiceoverFullScript)
    || compactPromptPlannerOption(options.productionContext?.voiceoverFullScript);
  if (suppliedVoiceoverFullScript) {
    const shotLines = extractStoryboardShotVoiceoverLines(suppliedVoiceoverFullScript);
    const selectedLine = pickStoryboardVoiceoverLine(shotLines, taskIndex, totalTasks);
    if (selectedLine) return selectedLine;
  }

  const explicitSpeech = extractStoryboardNativeSpeechText(options.conceptDetails ?? "");
  if (explicitSpeech) return explicitSpeech;

  const speechMode = compactPromptPlannerOption(options.speechMode).toLowerCase();
  const speechLanguage = compactPromptPlannerOption(options.speechLanguage).toLowerCase();
  const productName = compactPromptPlannerOption(marketplaceProduct?.productName);
  const isThai = speechMode === "th" || speechLanguage === "thai" || speechLanguage === "ไทย";
  const isEnglish = speechMode === "en" || speechLanguage === "english";
  const isFirst = taskIndex === 0;
  const isLast = taskIndex >= Math.max(0, totalTasks - 1);
  const isMiddle = !isFirst && !isLast;

  if (isThai) {
    return neutralizeThaiStoryboardFallbackPoliteParticles(
      buildNaturalThaiSplitStoryboardVoiceover(options, taskIndex, totalTasks, productName),
    );
  }

  if (isEnglish) {
    if (isFirst) return productName
      ? `If this setup still feels messy, see how ${productName} gives the essentials one clear place, so the space feels calmer and easier to use every day.`
      : "If this setup still feels messy, start by giving the essentials one clear place, so the space feels calmer and easier to use every day.";
    if (isMiddle) return productName
      ? `${productName} keeps the daily items close, easy to reach, and off the floor, while the shot shows how the setup works in real use.`
      : "The closer details show how the daily items stay easier to reach, while the setup still looks tidy and practical in real use.";
    return productName
      ? `Once everything has its place, ${productName} makes this corner feel ready for every day, without needing a bigger change to the room.`
      : "Once everything has its place, this corner feels ready for every day, without needing a bigger change to the room.";
  }

  if (productName) return `Show this ${productName} moment clearly and naturally, with enough spoken detail to fill the clip without a silent ending.`;
  return "Show this storyboard moment clearly and naturally, with enough spoken detail to fill the clip without a silent ending.";
}

export function buildFirstLastFrameStoryboardTasks(
  images: FirstLastFrameStoryboardImage[],
  options: BuildFirstLastFrameStoryboardTasksOptions,
): StoryboardGenerationTask[] {
  const usableImages = images.filter((image) => image.url.trim().length > 0);
  if (usableImages.length < 2 || !options.model.trim()) return [];

  const now = options.now ?? Date.now();
  const idPrefix = options.idPrefix ?? "split-storyboard";
  const aspectRatio = options.aspectRatio.trim() || "auto";
  const durationSeconds = normalizeStoryboardShotDurationSeconds(options.duration);
  const totalDurationSeconds = Math.max(0, usableImages.length - 1) * durationSeconds;
  const promptTone = compactPromptPlannerOption(options.promptTone);
  const promptLanguage = compactPromptPlannerOption(options.promptLanguage);
  const speechMode = options.speechMode ?? "none";
  const speechLanguage = compactPromptPlannerOption(options.speechLanguage);
  const includeVoiceover = Boolean(options.includeVoiceover && String(speechMode ?? "none") !== "none");
  const includeSound = Boolean(options.includeSound);
  const soundBrief = buildSplitStoryboardSoundBrief(options);
  const productionContext = normalizeStoryboardProductionContext(options.productionContext) ?? undefined;
  const voiceoverFullScript = compactPromptPlannerOption(options.voiceoverFullScript)
    || compactPromptPlannerOption(productionContext?.voiceoverFullScript);
  const hasPromptPlannerOptions = options.includeVoiceover !== undefined
    || options.speechMode !== undefined
    || options.speechLanguage !== undefined
    || options.includeSound !== undefined
    || options.soundBrief !== undefined
    || options.promptTone !== undefined
    || options.promptLanguage !== undefined;
  const extraParams = {
    ...(options.extraParams ?? {}),
    generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    referenceFrameRoles: ["start", "stop"] as StoryboardReferenceFrameRole[],
    storyboardShotDurationSeconds: durationSeconds,
    storyboardTotalDurationSeconds: totalDurationSeconds,
    ...(options.conceptDetails ? { productionConceptDetails: options.conceptDetails } : {}),
    ...(options.storyboardGuide ? { storyboardGuide: options.storyboardGuide } : {}),
    ...(voiceoverFullScript ? { voiceoverFullScript } : {}),
    ...(productionContext ? {
      productionContext,
      ...(productionContext.productionRunId ? { productionRunId: productionContext.productionRunId } : {}),
      ...(productionContext.productionStoryConceptId ? { productionStoryConceptId: productionContext.productionStoryConceptId } : {}),
      ...(productionContext.productionStoryConceptTitle ? { productionStoryConceptTitle: productionContext.productionStoryConceptTitle } : {}),
      ...(productionContext.videoConcept ? { productionVideoConcept: productionContext.videoConcept } : {}),
    } : {}),
    ...(options.marketplaceContext ? { marketplaceContext: options.marketplaceContext } : {}),
    ...(hasPromptPlannerOptions
      ? {
          storyboardPromptPlanner: {
            includeVoiceover,
            speechMode,
            speechLanguage,
            includeSound,
            soundBrief,
            tone: promptTone,
            language: promptLanguage || "auto",
          },
        }
      : {}),
  };

  return usableImages.slice(0, -1).map((startImage, index) => {
    const endImage = usableImages[index + 1]!;
    const taskIndex = index;
    const marketplaceProduct = startImage.marketplaceProduct
      ?? endImage.marketplaceProduct
      ?? options.marketplaceContext
      ?? null;
    const frameProductionContext = normalizeStoryboardProductionContext(startImage.productionContext)
      ?? normalizeStoryboardProductionContext(endImage.productionContext)
      ?? productionContext
      ?? null;
    const voiceoverScript = buildSplitStoryboardVoiceoverScript(options, taskIndex, usableImages.length - 1, marketplaceProduct);
    const visualPrompt = [
      `Shot ${taskIndex + 1}: transition from @Image1 exact start frame to @Image2 exact end frame.`,
      frameProductionContext?.sourceShotTitle ? `Source shot: ${frameProductionContext.sourceShotTitle}.` : "",
      voiceoverScript ? `Dialogue/narration story beat: "${voiceoverScript}"` : "",
      "The motion, camera, and visible action must express the same story beat as the Storyboard Guide and this dialogue; do not show a different product moment.",
      "Preserve visible product, people or hands, room, props, colors, composition, and continuity.",
      "If a person appears, keep the same identity and show a clear natural face when the endpoint frames show a face; if the endpoint frames show only back/side view, keep the motion non-revealing and do not invent a new face.",
      "Product fidelity lock: preserve the exact referenced product geometry, countable shelves/parts, proportions, color, and material; do not add drawers, doors, panels, accessories, or a different furniture type.",
      "No new products, text, labels, UI, logos, or characters.",
    ].filter(Boolean).join(" ");
    return {
      id: `${idPrefix}-${now}-${taskIndex + 1}`,
      index: taskIndex,
      status: "queued",
      type: "video",
      prompt: buildVeo31StoryboardVideoPrompt({
        visualPrompt,
        durationSeconds,
        aspectRatio,
        frameRoles: ["start", "stop"],
        conceptDetails: options.conceptDetails,
        storyboardGuide: options.storyboardGuide,
        includeVoiceover,
        speechMode,
        speechLanguage,
        voiceoverScript,
        includeSound,
        soundBrief,
      }),
      model: options.model,
      durationSeconds,
      createdAt: now,
      updatedAt: now,
      statusDetail: options.statusDetail ?? "Queued for storyboard review. Confirm and regenerate when ready.",
      marketplaceProduct,
      productionContext: frameProductionContext,
      storyboardContext: {
        aspectRatio,
        duration: durationSeconds,
        model: options.model,
        referenceImages: [
          {
            url: startImage.url,
            name: startImage.name ?? `Frame ${taskIndex + 1}`,
            marketplaceProduct: startImage.marketplaceProduct ?? marketplaceProduct,
            ...(normalizeStoryboardProductionContext(startImage.productionContext) ?? frameProductionContext
              ? { productionContext: normalizeStoryboardProductionContext(startImage.productionContext) ?? frameProductionContext }
              : {}),
          },
          {
            url: endImage.url,
            name: endImage.name ?? `Frame ${taskIndex + 2}`,
            marketplaceProduct: endImage.marketplaceProduct ?? marketplaceProduct,
            ...(normalizeStoryboardProductionContext(endImage.productionContext) ?? frameProductionContext
              ? { productionContext: normalizeStoryboardProductionContext(endImage.productionContext) ?? frameProductionContext }
              : {}),
          },
        ],
        referenceVideos: [],
        extraParams,
        apiConfig: options.apiConfig,
        resolution: options.resolution,
        productionContext: frameProductionContext,
      },
    };
  });
}

function normalizeReferenceImageUrl(url: unknown): string {
  return String(url || "").trim();
}

export function replaceStoryboardReferenceFrame(
  draft: StoryboardReviewDraft,
  input: ReplaceStoryboardReferenceFrameInput,
): StoryboardReviewDraft {
  const replacementUrl = normalizeReferenceImageUrl(input.image.url);
  if (!replacementUrl) return draft;

  const taskOrderIndex = draft.taskIds.indexOf(input.taskId);
  const targetTask = draft.tasks.find((task) => task.id === input.taskId);
  const oldUrl = normalizeReferenceImageUrl(
    targetTask?.storyboardContext?.referenceImages?.[input.frameIndex]?.url,
  );
  if (!targetTask?.storyboardContext || taskOrderIndex < 0) {
    return draft;
  }

  const now = input.now ?? Date.now();
  const affectedFrames = new Map<string, Set<0 | 1>>();
  affectedFrames.set(input.taskId, new Set([input.frameIndex]));

  if (oldUrl) {
    if (input.frameIndex === 1) {
      const nextTaskId = draft.taskIds[taskOrderIndex + 1];
      const nextTask = draft.tasks.find((task) => task.id === nextTaskId);
      const nextStartUrl = normalizeReferenceImageUrl(nextTask?.storyboardContext?.referenceImages?.[0]?.url);
      if (nextTask?.storyboardContext && nextStartUrl === oldUrl) {
        affectedFrames.set(nextTask.id, new Set([0]));
      }
    } else {
      const previousTaskId = draft.taskIds[taskOrderIndex - 1];
      const previousTask = draft.tasks.find((task) => task.id === previousTaskId);
      const previousEndUrl = normalizeReferenceImageUrl(previousTask?.storyboardContext?.referenceImages?.[1]?.url);
      if (previousTask?.storyboardContext && previousEndUrl === oldUrl) {
        affectedFrames.set(previousTask.id, new Set([1]));
      }
    }
  }

  return {
    ...draft,
    updatedAt: now,
    projectLink: null,
    renderJobId: null,
    compoundStatus: null,
    tasks: draft.tasks.map((task) => {
      const frames = affectedFrames.get(task.id);
      if (!frames || !task.storyboardContext) return task;
      const referenceImages = [...task.storyboardContext.referenceImages];
      for (const frame of frames) {
        referenceImages[frame] = {
          url: replacementUrl,
          name: input.image.name ?? referenceImages[frame]?.name ?? (frame === 0 ? "Start frame" : "End frame"),
          marketplaceProduct: input.image.marketplaceProduct ?? referenceImages[frame]?.marketplaceProduct ?? task.marketplaceProduct ?? draft.marketplaceContext ?? null,
        };
      }
      return {
        ...task,
        status: "queued",
        url: undefined,
        error: undefined,
        backendTaskId: undefined,
        providerTaskId: undefined,
        statusDetail: input.statusDetail ?? task.statusDetail,
        updatedAt: now,
        storyboardContext: {
          ...task.storyboardContext,
          referenceImages,
        },
      };
    }),
  };
}

export function replaceStoryboardVideoSlot(
  draft: StoryboardReviewDraft,
  input: ReplaceStoryboardVideoSlotInput,
): StoryboardReviewDraft {
  const slotIndex = draft.taskIds.indexOf(input.taskId);
  if (slotIndex < 0) return draft;
  const now = input.now ?? Date.now();
  const currentTask = draft.tasks.find((task) => task.id === input.taskId);

  if (input.mode === "replace") {
    const replacementTask: StoryboardGenerationTask = {
      ...input.importedTask,
      id: input.taskId,
      index: currentTask?.index ?? slotIndex,
      prompt: currentTask?.prompt ?? input.importedTask.prompt,
      transition: currentTask?.transition ?? input.importedTask.transition,
      storyboardContext: currentTask?.storyboardContext,
      marketplaceProduct: currentTask?.marketplaceProduct ?? input.importedTask.marketplaceProduct,
      createdAt: currentTask?.createdAt ?? input.importedTask.createdAt,
      updatedAt: now,
    };
    return normalizeDraftTaskOrder(
      {
        ...draft,
        updatedAt: now,
        projectLink: null,
        renderJobId: null,
        compoundStatus: null,
        selectedTaskIds: draft.selectedTaskIds.includes(input.taskId)
          ? draft.selectedTaskIds
          : [...draft.selectedTaskIds, input.taskId],
        tasks: draft.tasks.map((task) => task.id === input.taskId ? replacementTask : task),
      },
      draft.taskIds,
    );
  }

  const nextTaskIds = [
    ...draft.taskIds.slice(0, slotIndex + 1),
    input.importedTask.id,
    ...draft.taskIds.slice(slotIndex + 1),
  ];
  return normalizeDraftTaskOrder(
    {
      ...draft,
      updatedAt: now,
      projectLink: null,
      renderJobId: null,
      compoundStatus: null,
      selectedTaskIds: [...draft.selectedTaskIds, input.importedTask.id],
      tasks: [...draft.tasks, input.importedTask],
    },
    nextTaskIds,
  );
}

export function storyboardDraftToReviewTasks(draft: StoryboardReviewDraft | null): StoryboardReviewTask[] {
  if (!draft) return [];
  const taskById = new Map(draft.tasks.map((task) => [task.id, task]));
  return draft.taskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is StoryboardGenerationTask => Boolean(task))
    .map((task) => {
      const context = task.storyboardContext;
      const extraParams: Record<string, unknown> = context
        ? {
            ...(context.extraParams ?? {}),
            transportMetadata: normalizeStoryboardTransportMetadata(
              task.transportMetadata ?? context.transportMetadata ?? context.extraParams?.transportMetadata,
            ),
            ...(context.resolution ? { resolution: context.resolution } : {}),
            ...(!context.extraParams?.marketplaceContext && (task.marketplaceProduct ?? draft.marketplaceContext)
              ? { marketplaceContext: task.marketplaceProduct ?? draft.marketplaceContext }
              : {}),
            ...(!context.extraParams?.productionContext && (task.productionContext ?? context.productionContext ?? draft.productionContext)
              ? { productionContext: task.productionContext ?? context.productionContext ?? draft.productionContext }
              : {}),
            ...(draft.videoSegmentState
              ? {
                  videoSegmentPlanHash:
                    draft.videoSegmentState.videoSegmentPlan.planHash,
                  videoSegmentEffectiveMode:
                    draft.videoSegmentState.effectiveMode,
                  videoSegmentPromptStale:
                    draft.videoSegmentState.staleTaskIds?.includes(task.id) ??
                    false,
                  videoSegmentStaleReason:
                    draft.videoSegmentState.staleReason ?? undefined,
                }
              : {}),
          }
        : {};
      return {
        id: task.id,
        index: task.index,
        prompt: task.prompt,
        url: task.url,
        model: task.model,
        durationSeconds: normalizeStoryboardShotDurationSeconds(task.durationSeconds ?? context?.duration),
        mediaType: task.type === "image" ? "image" as StoryboardClipMediaType : "video" as StoryboardClipMediaType,
        transition: task.transition,
        generationModelId: context?.model || task.model,
        referenceUrls: context?.referenceImages?.map((image) => image.url).filter(Boolean),
        generationAspectRatio: context?.aspectRatio ?? task.aspectRatio,
        generationExtraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
        referenceFrameRoles: Array.isArray(extraParams.referenceFrameRoles)
          ? extraParams.referenceFrameRoles.filter((role): role is StoryboardReferenceFrameRole => role === "start" || role === "stop" || role === "reference")
          : undefined,
        marketplaceProduct: task.marketplaceProduct ?? draft.marketplaceContext ?? null,
        canRegenerate: Boolean(context) && extraParams.importedMediaContextOnly !== true,
        isImported: task.source === "imported" || !context,
        status: task.status,
        error: task.error,
      };
    });
}

function storyboardReviewRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanStoryboardReviewId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstStoryboardReviewId(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) return "";
  for (const key of keys) {
    const value = cleanStoryboardReviewId(record[key]);
    if (value) return value;
  }
  return "";
}

export function getStoryboardReviewProductIdFromDraft(draft: StoryboardReviewDraft | null): string {
  if (!draft) return "";
  const draftRecord = storyboardReviewRecord(draft);
  const contexts: Array<{ record: Record<string, unknown> | null; allowGenericId?: boolean }> = [
    { record: storyboardReviewRecord(draft.marketplaceContext), allowGenericId: true },
    { record: storyboardReviewRecord(draftRecord?.marketplaceProduct), allowGenericId: true },
    { record: draftRecord, allowGenericId: false },
  ];
  for (const task of draft.tasks) {
    contexts.push(
      { record: storyboardReviewRecord(task.marketplaceProduct), allowGenericId: true },
      { record: storyboardReviewRecord(task.storyboardContext?.extraParams?.marketplaceContext), allowGenericId: true },
      { record: storyboardReviewRecord(task.storyboardContext?.extraParams), allowGenericId: false },
    );
  }

  for (const context of contexts) {
    const keys = context.allowGenericId
      ? ["productId", "marketplaceProductId", "product_id", "id"]
      : ["productId", "marketplaceProductId", "product_id"];
    const productId = firstStoryboardReviewId(context.record, keys);
    if (productId) return productId;
  }
  return "";
}

export function getStoryboardReviewAutoReviewRunIdFromDraft(draft: StoryboardReviewDraft | null): string {
  if (!draft) return "";
  const draftRecord = storyboardReviewRecord(draft);
  const topLevelRunId = firstStoryboardReviewId(draftRecord, ["autoReviewRunId", "marketplaceAutoReviewRunId"]);
  if (topLevelRunId) return topLevelRunId;

  const directRunId = firstStoryboardReviewId(
    storyboardReviewRecord(draft.marketplaceContext),
    ["autoReviewRunId", "marketplaceAutoReviewRunId"],
  );
  if (directRunId) return directRunId;

  const runIds = new Set<string>();
  for (const task of draft.tasks) {
    const contexts = [
      storyboardReviewRecord(task.marketplaceProduct),
      storyboardReviewRecord(task.storyboardContext?.extraParams?.marketplaceContext),
      storyboardReviewRecord(task.storyboardContext?.extraParams),
    ];
    for (const context of contexts) {
      const runId = firstStoryboardReviewId(context, ["autoReviewRunId", "marketplaceAutoReviewRunId"]);
      if (runId) runIds.add(runId);
    }
  }

  return runIds.size === 1 ? [...runIds][0]! : "";
}
