/**
 * Vertical Drama — Storyboard Review metadata normalization (spec feature 131, §12).
 *
 * The Storyboard Review page carries generic `reviewData` plus per-task
 * `extraParams`. When an episode plan is handed off from a Vertical Drama Series
 * (spec §4.3/§12), each task's extraParams is stamped with
 * `source === "vertical_drama_series"` and the full
 * {@link VerticalDramaTaskExtraParams} lineage.
 *
 * This module detects that handoff and normalizes the loosely-typed
 * `reviewData` / task `extraParams` into the strongly-typed, panel-ready
 * {@link VerticalDramaReviewMetadata} consumed by
 * `VerticalDramaStoryboardReviewPanel`. Non-vertical-drama reviews return
 * `null` so callers can fall through to the existing article-storyboard path.
 *
 * Pure/presentational: no network, no side effects. Reuses the shared handoff
 * contracts (no local re-declaration of the wire shape).
 */

import type {
  VerticalDramaTaskExtraParams,
} from "@shared/verticalDramaSeries/storyboardHandoff";
import type { VerticalDramaSubShot } from "@shared/verticalDramaSeries/subShots";
import type {
  PanelImagePromptLineage,
  PanelPromptEdit,
  PanelRecommendedRepair,
  PanelReferenceImage,
  PanelSubShotBreakdown,
  PanelTask,
  PanelTaskExtraParams,
  VerticalDramaReviewMetadata,
} from "../components/verticalDramaSeries/VerticalDramaStoryboardReviewPanel";

/** The literal that tags a task/review as a Vertical Drama handoff (spec §12). */
export const VERTICAL_DRAMA_REVIEW_SOURCE = "vertical_drama_series" as const;

type FrameRole = "start" | "stop" | "character" | "product" | "style";
type SubShotTransition = "cut" | "match_cut" | "smash_cut" | "continuous";

/** Loose input as seen on the Storyboard Review page. */
export interface VerticalDramaStoryboardReviewMetadataInput {
  /** Raw `reviewRecord.reviewData` (episode-level fields live here). */
  reviewData?: unknown;
  /**
   * Review/generation tasks. Each may expose the VD extraParams via
   * `generationExtraParams`, `extraParams`, or `storyboardContext.extraParams`.
   */
  tasks?: ReadonlyArray<unknown> | null;
}

/* -------------------------------------------------------------------------- */
/* Defensive readers.                                                         */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

const FRAME_ROLES: ReadonlySet<string> = new Set([
  "start",
  "stop",
  "character",
  "product",
  "style",
]);
const SUB_SHOT_TRANSITIONS: ReadonlySet<string> = new Set([
  "cut",
  "match_cut",
  "smash_cut",
  "continuous",
]);
const MOTION_MODES: ReadonlySet<string> = new Set([
  "first_last_frame_bridge",
  "first_frame_to_video",
  "image_to_video",
  "text_to_video",
  "reference_to_video",
  "prompt_only",
]);

function asFrameRole(value: unknown, fallback: FrameRole): FrameRole {
  return typeof value === "string" && FRAME_ROLES.has(value) ? (value as FrameRole) : fallback;
}

function asSubShotTransition(value: unknown): SubShotTransition {
  return typeof value === "string" && SUB_SHOT_TRANSITIONS.has(value)
    ? (value as SubShotTransition)
    : "cut";
}

function asMotionMode(value: unknown): VerticalDramaReviewMetadata["motionMode"] {
  return typeof value === "string" && MOTION_MODES.has(value)
    ? (value as VerticalDramaReviewMetadata["motionMode"])
    : "prompt_only";
}

/**
 * Read the extraParams record off a review/generation task, tolerating the
 * three shapes the page uses (`generationExtraParams`, `extraParams`,
 * `storyboardContext.extraParams`).
 */
function readTaskExtraParams(task: unknown): Record<string, unknown> | null {
  const record = asRecord(task);
  if (!record) return null;
  const candidates: unknown[] = [
    record.generationExtraParams,
    record.extraParams,
    asRecord(record.storyboardContext)?.extraParams,
  ];
  for (const candidate of candidates) {
    const found = asRecord(candidate);
    if (found) return found;
  }
  return null;
}

/** True when a task/extraParams record is a Vertical Drama handoff. */
function isVerticalDramaExtraParams(
  extraParams: Record<string, unknown> | null,
): extraParams is Record<string, unknown> & VerticalDramaTaskExtraParams {
  return extraParams?.source === VERTICAL_DRAMA_REVIEW_SOURCE;
}

/**
 * Detect whether the given review is a Vertical Drama Series handoff without
 * fully normalizing it. Cheap guard for call sites.
 */
export function isVerticalDramaStoryboardReview(
  input: VerticalDramaStoryboardReviewMetadataInput,
): boolean {
  if (asRecord(input.reviewData)?.source === VERTICAL_DRAMA_REVIEW_SOURCE) return true;
  for (const task of input.tasks ?? []) {
    if (isVerticalDramaExtraParams(readTaskExtraParams(task))) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Field extractors.                                                          */
/* -------------------------------------------------------------------------- */

function buildImagePromptLineage(
  extraParams: Record<string, unknown>,
  shotNumber: number,
  promptFieldsByShot: Map<number, Record<string, unknown>>,
): PanelImagePromptLineage {
  const promptFields = promptFieldsByShot.get(shotNumber) ?? {};
  const cellPrompts = Array.isArray(promptFields.cellPrompts)
    ? asStringArray(promptFields.cellPrompts)
    : undefined;
  return {
    shotNumber,
    contactSheetPrompt: asString(promptFields.contactSheetPrompt),
    cellPrompts: cellPrompts && cellPrompts.length > 0 ? cellPrompts : undefined,
    negativePrompt: asString(promptFields.negativePrompt),
    contactSheetIds: asStringArray(extraParams.contactSheetIds),
    candidateFrameAssetIds: asStringArray(extraParams.candidateFrameAssetIds),
    selectedStartFrameCandidateId: asString(extraParams.selectedStartFrameCandidateId),
    promptSetId: asString(extraParams.promptSetId),
  };
}

function buildPromptEditHistory(task: Record<string, unknown>): PanelPromptEdit[] {
  const raw = Array.isArray(task.promptEditHistory) ? task.promptEditHistory : [];
  const edits: PanelPromptEdit[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    edits.push({
      editedByUserId: asFiniteNumber(record.editedByUserId) ?? 0,
      editedAt: asFiniteNumber(record.editedAt) ?? 0,
      original: asString(record.original) ?? "",
    });
  }
  return edits;
}

function buildReferenceImages(
  task: Record<string, unknown>,
  extraParams: Record<string, unknown>,
): { referenceImages: PanelReferenceImage[]; referenceFrameRoles: FrameRole[] } {
  const roles: FrameRole[] = Array.isArray(extraParams.referenceFrameRoles)
    ? (extraParams.referenceFrameRoles as unknown[]).map((role, index) =>
        asFrameRole(role, index === 0 ? "start" : "stop"),
      )
    : [];

  const context = asRecord(task.storyboardContext);
  const rawImages = Array.isArray(context?.referenceImages) ? context!.referenceImages : [];
  const urlsFromContext = rawImages
    .map((image) => asString(asRecord(image)?.url))
    .filter((url): url is string => Boolean(url));
  const urls =
    urlsFromContext.length > 0 ? urlsFromContext : asStringArray(task.referenceUrls);

  const referenceImages: PanelReferenceImage[] = urls.map((url, index) => ({
    url,
    role: roles[index] ?? (index === 0 ? "start" : "stop"),
  }));

  return { referenceImages, referenceFrameRoles: roles };
}

function buildPanelTaskExtraParams(
  extraParams: Record<string, unknown> & VerticalDramaTaskExtraParams,
): PanelTaskExtraParams {
  return {
    source: VERTICAL_DRAMA_REVIEW_SOURCE,
    shotNumber: asFiniteNumber(extraParams.shotNumber) ?? 0,
    clipNumber: asFiniteNumber(extraParams.clipNumber),
    parentShotNumber: asFiniteNumber(extraParams.parentShotNumber),
    subShotNumber: asFiniteNumber(extraParams.subShotNumber),
    subShotCount: asFiniteNumber(extraParams.subShotCount),
    subShotTransitionIn:
      extraParams.subShotTransitionIn != null
        ? asSubShotTransition(extraParams.subShotTransitionIn)
        : undefined,
    characterReferenceAssetIds: asStringArray(extraParams.characterReferenceAssetIds),
    productReferenceAssetIds: asStringArray(extraParams.productReferenceAssetIds),
    continuityWarnings: asStringArray(extraParams.continuityWarnings),
    assemblyManifestId: asString(extraParams.assemblyManifestId),
  };
}

function buildStaleVideoSegmentState(
  extraParams: Record<string, unknown>,
  taskId: string,
): PanelTask["videoSegmentState"] {
  const stale = extraParams.videoSegmentPromptStale === true;
  if (!stale) return undefined;
  return {
    staleTaskIds: [taskId],
    staleReason: asString(extraParams.videoSegmentStaleReason) ?? null,
  };
}

/**
 * Group sub-shot breakdown entries by parent shot. Accepts either a flat list
 * of {@link VerticalDramaSubShot} (`reviewData.subShots`) or a pre-grouped
 * `reviewData.subShotBreakdownByShot`.
 */
function buildSubShotBreakdown(reviewData: Record<string, unknown> | null): PanelSubShotBreakdown[] {
  if (!reviewData) return [];

  // Pre-grouped form.
  if (Array.isArray(reviewData.subShotBreakdownByShot)) {
    const groups: PanelSubShotBreakdown[] = [];
    for (const entry of reviewData.subShotBreakdownByShot) {
      const record = asRecord(entry);
      if (!record) continue;
      const parentShotNumber = asFiniteNumber(record.parentShotNumber);
      if (parentShotNumber == null) continue;
      const subShots = Array.isArray(record.subShots) ? record.subShots : [];
      groups.push({
        parentShotNumber,
        subShotCount: asFiniteNumber(record.subShotCount) ?? subShots.length,
        subShots: subShots.map(normalizePanelSubShot).filter((s): s is NonNullable<typeof s> => s != null),
      });
    }
    return groups;
  }

  // Flat list form.
  const flat = Array.isArray(reviewData.subShots)
    ? (reviewData.subShots as unknown[])
    : [];
  if (flat.length === 0) return [];
  const byParent = new Map<number, PanelSubShotBreakdown>();
  for (const entry of flat) {
    const record = asRecord(entry);
    const parentShotNumber = asFiniteNumber(record?.parentShotNumber);
    const normalized = normalizePanelSubShot(entry);
    if (parentShotNumber == null || !normalized) continue;
    const group =
      byParent.get(parentShotNumber) ??
      { parentShotNumber, subShotCount: 0, subShots: [] };
    group.subShots.push(normalized);
    group.subShotCount = group.subShots.length;
    byParent.set(parentShotNumber, group);
  }
  return [...byParent.values()].sort((a, b) => a.parentShotNumber - b.parentShotNumber);
}

function normalizePanelSubShot(
  entry: unknown,
): PanelSubShotBreakdown["subShots"][number] | null {
  const record = asRecord(entry) as (Record<string, unknown> & Partial<VerticalDramaSubShot>) | null;
  if (!record) return null;
  return {
    subShotNumber: asFiniteNumber(record.subShotNumber) ?? 0,
    cameraSetup: asString(record.cameraSetup),
    durationSeconds: asFiniteNumber(record.durationSeconds) ?? 0,
    transitionIn: asSubShotTransition(record.transitionIn),
    prompt: asString(record.prompt) ?? "",
  };
}

function buildRecommendedRepairs(reviewData: Record<string, unknown> | null): PanelRecommendedRepair[] {
  if (!reviewData) return [];
  const source =
    (Array.isArray(reviewData.qcRecommendedRepairs) && reviewData.qcRecommendedRepairs) ||
    (Array.isArray(reviewData.recommendedRepairs) && reviewData.recommendedRepairs) ||
    (Array.isArray(reviewData.repairQueue) && reviewData.repairQueue) ||
    [];
  const repairs: PanelRecommendedRepair[] = [];
  for (const entry of source as unknown[]) {
    const record = asRecord(entry);
    if (!record) continue;
    const action = asString(record.action);
    const instruction = asString(record.instruction);
    if (!action || !instruction) continue;
    repairs.push({
      action,
      instruction,
      shotNumber: asFiniteNumber(record.shotNumber),
      clipNumber: asFiniteNumber(record.clipNumber),
      artifactId: asString(record.artifactId),
    });
  }
  return repairs;
}

/** Index reviewData.imagePromptsByShot (if present) by shotNumber. */
function indexImagePromptFieldsByShot(
  reviewData: Record<string, unknown> | null,
): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>();
  const list = Array.isArray(reviewData?.imagePromptsByShot)
    ? (reviewData!.imagePromptsByShot as unknown[])
    : [];
  for (const entry of list) {
    const record = asRecord(entry);
    const shotNumber = asFiniteNumber(record?.shotNumber);
    if (record && shotNumber != null) map.set(shotNumber, record);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Main normalization.                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Normalize a Storyboard Review's `reviewData` + tasks into panel-ready
 * Vertical Drama metadata, or `null` when this is not a Vertical Drama handoff.
 */
export function normalizeVerticalDramaStoryboardReviewMetadata(
  input: VerticalDramaStoryboardReviewMetadataInput,
): VerticalDramaReviewMetadata | null {
  const reviewData = asRecord(input.reviewData);
  const rawTasks = input.tasks ?? [];

  // Collect (task, vdExtraParams) pairs for VD tasks only.
  const vdTasks: Array<{ task: Record<string, unknown>; extraParams: Record<string, unknown> & VerticalDramaTaskExtraParams }> = [];
  for (const rawTask of rawTasks) {
    const taskRecord = asRecord(rawTask);
    const extraParams = readTaskExtraParams(rawTask);
    if (taskRecord && isVerticalDramaExtraParams(extraParams)) {
      vdTasks.push({ task: taskRecord, extraParams });
    }
  }

  const reviewIsVd = reviewData?.source === VERTICAL_DRAMA_REVIEW_SOURCE;
  if (vdTasks.length === 0 && !reviewIsVd) return null;

  // Episode-level identity: prefer explicit reviewData, fall back to first task.
  const firstExtra = vdTasks[0]?.extraParams;
  const seriesId =
    asString(reviewData?.seriesId) ?? asString(firstExtra?.seriesId) ?? "";
  const episodeId =
    asString(reviewData?.episodeId) ?? asString(firstExtra?.episodeId) ?? "";
  const episodeNumber =
    asFiniteNumber(reviewData?.episodeNumber) ?? asFiniteNumber(firstExtra?.episodeNumber) ?? 0;
  const motionMode = asMotionMode(reviewData?.motionMode ?? firstExtra?.motionMode);

  const promptFieldsByShot = indexImagePromptFieldsByShot(reviewData);

  // Per-shot image lineage (dedup by shotNumber, first-wins).
  const imagePromptsByShotMap = new Map<number, PanelImagePromptLineage>();
  const panelTasks: PanelTask[] = [];
  const continuityWarnings = new Set<string>(asStringArray(reviewData?.continuityWarnings));

  for (const { task, extraParams } of vdTasks) {
    const shotNumber = asFiniteNumber(extraParams.shotNumber) ?? 0;
    if (!imagePromptsByShotMap.has(shotNumber)) {
      imagePromptsByShotMap.set(
        shotNumber,
        buildImagePromptLineage(extraParams, shotNumber, promptFieldsByShot),
      );
    }
    for (const warning of asStringArray(extraParams.continuityWarnings)) {
      continuityWarnings.add(warning);
    }

    const taskId = asString(task.id) ?? `vd-shot-${shotNumber}`;
    const { referenceImages, referenceFrameRoles } = buildReferenceImages(task, extraParams);
    panelTasks.push({
      id: taskId,
      prompt: asString(task.prompt) ?? "",
      durationSeconds:
        asFiniteNumber(task.durationSeconds) ?? asFiniteNumber(extraParams.durationSeconds) ?? 0,
      status: asString(task.status) ?? "unknown",
      storyboardContext: {
        referenceImages,
        referenceFrameRoles,
        imagePrompts: imagePromptsByShotMap.get(shotNumber),
      },
      videoSegmentState: buildStaleVideoSegmentState(extraParams, taskId),
      extraParams: buildPanelTaskExtraParams(extraParams),
      voiceoverFullScript: asString(task.voiceoverFullScript) ?? null,
      promptEditHistory: buildPromptEditHistory(task),
    });
  }

  const providerPayloadPreview =
    asRecord(reviewData?.providerPayloadPreview) ??
    asRecord(reviewData?.providerPayload) ??
    asRecord(firstExtra?.providerRoutingDecision) ??
    {};

  return {
    source: VERTICAL_DRAMA_REVIEW_SOURCE,
    seriesId,
    episodeId,
    episodeNumber,
    motionMode,
    seriesTitle: asString(reviewData?.seriesTitle),
    backlink: { seriesId, episodeId, episodeNumber },
    imagePromptsByShot: [...imagePromptsByShotMap.values()].sort(
      (a, b) => a.shotNumber - b.shotNumber,
    ),
    subShotBreakdownByShot: buildSubShotBreakdown(reviewData),
    providerPayloadPreview,
    qcRecommendedRepairs: buildRecommendedRepairs(reviewData),
    voiceCasting: reviewData?.voiceCasting ?? reviewData?.voice_casting ?? undefined,
    subtitleSafeArea: reviewData?.subtitleSafeArea ?? reviewData?.subtitle_safe_area ?? undefined,
    audioStrategy: asString(reviewData?.audioStrategy) ?? null,
    continuityWarnings: [...continuityWarnings],
    tasks: panelTasks,
  };
}

export default normalizeVerticalDramaStoryboardReviewMetadata;
