/**
 * Vertical Drama Series — start-frame planning & contact-sheet service
 * (spec feature 131, section-05, spec §6.4 / §7.5 / §11.6 / §16).
 *
 * Backs the `vertical-drama-shot-start-frame-render` skill and the app-safe
 * `vdflow render-images` surface. Two start-frame generation modes are
 * supported:
 *
 *   - `single_frame_per_shot`      — one start-frame asset per shot (9 shots ->
 *                                    9 frames, no 3x3 sheet, no cropping).
 *   - `contact_sheet_3x3_batch`    — DEFAULT MVP mode: N 3x3 contact sheets,
 *                                    deterministically cropped into 9 candidate
 *                                    frames each, then one-per-shot selection.
 *
 * Image-model resolution goes through the app model registry
 * (`server/services/modelRegistry.ts`). The dropdown is NOT a filter: every
 * enabled `type = "image"` model stays listed; models that cannot produce a
 * valid 9:16 candidate through any supported path are surfaced with a
 * machine-readable incompatibility reason code (kept visible + selectable, but
 * the approve-to-generate action can be disabled for them).
 *
 * All pure planners / crop math / QC + repair-template + video-manifest
 * builders live at module scope so they are unit-testable without a database;
 * persistence lives on `VerticalDramaStartFrameService` and is scoped to
 * `(tenantId, userId, seriesId, episodeId)`. Attached media assets are validated
 * for tenant + user ownership and non-deleted status (cross-tenant/deleted are
 * rejected). Repair is non-destructive: a failed crop / QC failure NEVER deletes
 * the full contact sheet or sibling candidates.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaRunArtifacts,
  mediaAssets,
  type VerticalDramaRunArtifactRow,
} from "../../drizzle/schema";
import {
  getModelsByTypeAsync,
  getModelById,
  type ModelDefinition,
} from "./modelRegistry";
import {
  VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
  type VerticalDramaContactSheetBatchPlan,
  type VerticalDramaContactSheetGenerationJobGroup,
  type VerticalDramaContactSheetAsset,
  type VerticalDramaSelectedStartFrame,
} from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

export const VERTICAL_DRAMA_SHOTS_PER_EPISODE = 9 as const;
export const VERTICAL_DRAMA_CONTACT_SHEET_CELLS = 9 as const;
export const VERTICAL_DRAMA_TARGET_ASPECT_RATIO = "9:16" as const;
export const VERTICAL_DRAMA_TARGET_ASPECT_VALUE = 9 / 16; // 0.5625
/** Preset sheet counts surfaced in the UI (3 -> 27 candidates, 6 -> 54). */
export const VERTICAL_DRAMA_SHEET_COUNT_PRESETS: readonly number[] = [3, 6] as const;
export const VERTICAL_DRAMA_DEFAULT_PARALLEL_JOB_LIMIT = 3 as const;

export type VerticalDramaStartFrameMode = "single_frame_per_shot" | "contact_sheet_3x3_batch";
export const VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE: VerticalDramaStartFrameMode =
  "contact_sheet_3x3_batch";

/* -------------------------------------------------------------------------- */
/* Image-model resolution + incompatibility reason codes                       */
/* -------------------------------------------------------------------------- */

/** Machine-readable incompatibility reason codes (spec §7.5, lines 1260-1261). */
export type VerticalDramaImageModelReasonCode =
  | "no_9_16_support"
  | "crop_pad_resize_unavailable"
  | "unsupported_output_dimensions";

export type VerticalDramaImageModelCompatibility = "direct" | "crop_pad_resize" | "incompatible";

/** How a model can (or cannot) reach a valid 9:16 candidate. */
export type VerticalDramaImageModelPath =
  | "native_9_16"
  | "contact_sheet_crop_pad_resize"
  | "resize_from_fixed_size"
  | "none";

export interface VerticalDramaResolvedImageModel {
  id: string;
  name: string;
  provider: string;
  creditCost: number;
  aspectRatios: string[];
  /** direct (native 9:16), crop_pad_resize (valid via the sheet path), or incompatible. */
  compatibility: VerticalDramaImageModelCompatibility;
  /** The path that makes this model yield a valid 9:16 candidate (or "none"). */
  path: VerticalDramaImageModelPath;
  /** Present ONLY when compatibility === "incompatible". */
  reasonCode?: VerticalDramaImageModelReasonCode;
  /** Human-readable annotation (path note or incompatibility copy). */
  reasonText?: string;
  /** Model stays selectable in the dropdown unless it is hard-incompatible. */
  selectable: boolean;
  /** The approve-to-generate action must be disabled for hard-incompatible models. */
  approveDisabled: boolean;
  isDefault: boolean;
}

export interface VerticalDramaImageModelResolution {
  defaultModelId: string;
  models: VerticalDramaResolvedImageModel[];
}

/**
 * Classify a single image model's 9:16 compatibility (pure — no registry read).
 * Every enabled `type = "image"` model must remain LISTED; this only decides the
 * reason code / path annotation and whether approve-to-generate is disabled.
 */
export function classifyImageModel9x16(model: ModelDefinition): {
  compatibility: VerticalDramaImageModelCompatibility;
  path: VerticalDramaImageModelPath;
  reasonCode?: VerticalDramaImageModelReasonCode;
  reasonText?: string;
} {
  const ratios = model.aspectRatios ?? [];
  const cfg = (model.configJson ?? {}) as Record<string, unknown>;

  // Explicit opt-outs surfaced by provider config take precedence so the UI can
  // render each distinct machine-readable reason code.
  if (cfg.supportsCropPadResize === false && !ratios.includes(VERTICAL_DRAMA_TARGET_ASPECT_RATIO)) {
    return {
      compatibility: "incompatible",
      path: "none",
      reasonCode: "crop_pad_resize_unavailable",
      reasonText: "Model cannot crop/pad/resize its output to 9:16.",
    };
  }
  if (cfg.fixedOutputDimensions === true && !ratios.includes(VERTICAL_DRAMA_TARGET_ASPECT_RATIO)) {
    return {
      compatibility: "incompatible",
      path: "none",
      reasonCode: "unsupported_output_dimensions",
      reasonText: "Model emits fixed output dimensions that are not 9:16-compatible.",
    };
  }

  if (ratios.includes(VERTICAL_DRAMA_TARGET_ASPECT_RATIO)) {
    return { compatibility: "direct", path: "native_9_16" };
  }
  if (ratios.length > 0) {
    return {
      compatibility: "crop_pad_resize",
      path: "contact_sheet_crop_pad_resize",
      reasonText: "Valid 9:16 candidates via contact-sheet crop/pad/resize.",
    };
  }
  if ((model.sizes?.length ?? 0) > 0) {
    return {
      compatibility: "crop_pad_resize",
      path: "resize_from_fixed_size",
      reasonText: "Valid 9:16 candidates via resize from a fixed output size.",
    };
  }
  return {
    compatibility: "incompatible",
    path: "none",
    reasonCode: "no_9_16_support",
    reasonText: "Model has no declared output that can reach a 9:16 candidate.",
  };
}

/** Pure resolver over a supplied model list (unit-testable without a DB read). */
export function resolveImageModelsFromList(
  models: ModelDefinition[],
  defaultModelId: string = VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
): VerticalDramaImageModelResolution {
  const imageModels = models.filter((m) => m.type === "image" && m.isEnabled !== false);
  const resolvedDefault = imageModels.some((m) => m.id === defaultModelId)
    ? defaultModelId
    : imageModels[0]?.id ?? defaultModelId;

  const resolved: VerticalDramaResolvedImageModel[] = imageModels.map((m) => {
    const c = classifyImageModel9x16(m);
    const hardIncompatible = c.compatibility === "incompatible";
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      creditCost: m.creditCost,
      aspectRatios: m.aspectRatios ?? [],
      compatibility: c.compatibility,
      path: c.path,
      reasonCode: c.reasonCode,
      reasonText: c.reasonText,
      // Kept visible/selectable in the list even when hard-incompatible; only
      // the approve-to-generate action is disabled for hard-incompatible models.
      selectable: true,
      approveDisabled: hardIncompatible,
      isDefault: m.id === resolvedDefault,
    };
  });

  // Stable ordering: default first, then by priority-ish credit cost, then id.
  resolved.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.creditCost !== b.creditCost) return a.creditCost - b.creditCost;
    return a.id.localeCompare(b.id);
  });

  return { defaultModelId: resolvedDefault, models: resolved };
}

/** Registry-backed resolver: every enabled image model, with reason codes. */
export async function resolveImageModels(
  defaultModelId: string = VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
): Promise<VerticalDramaImageModelResolution> {
  const models = await getModelsByTypeAsync("image");
  return resolveImageModelsFromList(models, defaultModelId);
}

/* -------------------------------------------------------------------------- */
/* Shotgrid inputs                                                             */
/* -------------------------------------------------------------------------- */

/** One shot from the storyboard shotgrid the start-frame plan is derived from. */
export interface VerticalDramaShotgridShot {
  shotNumber: number;
  imagePrompt: string;
  negativePrompt?: string;
  continuityNotes?: string[];
  requiredCharacterRefs?: string[];
  productReferenceAssetIds?: string[];
}

export interface PlanStartFramesInput {
  runId: string;
  episodeId: string;
  mode: VerticalDramaStartFrameMode;
  selectedImageModelId?: string;
  /** Contact-sheet only: how many 3x3 sheets to generate (preset 3 or 6). */
  sheetCount?: number;
  shots: VerticalDramaShotgridShot[];
  /** Per-generation credit cost (defaults to the selected model's creditCost). */
  creditCostPerImage?: number;
}

/* -------------------------------------------------------------------------- */
/* Single-frame-per-shot plan                                                  */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaSingleFrameRequest {
  shotNumber: number;
  promptSetId: string;
  imagePrompt: string;
  negativePrompt: string;
  aspectRatio: "9:16";
  requiredCharacterRefs: string[];
  productReferenceAssetIds: string[];
  continuityNotes: string[];
}

export interface VerticalDramaSingleFramePlan {
  mode: "single_frame_per_shot";
  selectedImageModelId: string;
  aspectRatio: "9:16";
  promptVisibility: "all_prompts_visible";
  requests: VerticalDramaSingleFrameRequest[];
  creditEstimate: number;
}

/** Plan exactly ONE start-frame render/import request per shot (no cropping). */
export function planSingleFramePerShot(input: PlanStartFramesInput): VerticalDramaSingleFramePlan {
  const modelId = input.selectedImageModelId ?? VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL;
  const perImage = resolveCreditCost(modelId, input.creditCostPerImage);
  const requests: VerticalDramaSingleFrameRequest[] = input.shots.map((shot) => ({
    shotNumber: shot.shotNumber,
    promptSetId: `${input.runId}:single:${shot.shotNumber}`,
    imagePrompt: shot.imagePrompt,
    negativePrompt: shot.negativePrompt ?? "",
    aspectRatio: "9:16",
    requiredCharacterRefs: shot.requiredCharacterRefs ?? [],
    productReferenceAssetIds: shot.productReferenceAssetIds ?? [],
    continuityNotes: shot.continuityNotes ?? [],
  }));
  return {
    mode: "single_frame_per_shot",
    selectedImageModelId: modelId,
    aspectRatio: "9:16",
    promptVisibility: "all_prompts_visible",
    requests,
    creditEstimate: perImage * requests.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Contact-sheet 3x3 batch plan                                                */
/* -------------------------------------------------------------------------- */

function rowColFromCell(cellIndex: number): { row: 1 | 2 | 3; col: 1 | 2 | 3 } {
  const zero = cellIndex - 1;
  return {
    row: ((Math.floor(zero / 3) + 1) as 1 | 2 | 3),
    col: (((zero % 3) + 1) as 1 | 2 | 3),
  };
}

/**
 * Plan a contact-sheet batch: `sheetCount` 3x3 sheets, each with 9 per-cell
 * prompts, giving `sheetCount * 9` candidate frames (3 -> 27, 6 -> 54).
 * Every prompt, negative prompt, and the model id are visible before any paid
 * generation (`promptVisibility: "all_prompts_visible"`).
 */
export function planContactSheetBatch(input: PlanStartFramesInput): VerticalDramaContactSheetBatchPlan {
  const modelId = input.selectedImageModelId ?? VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL;
  const sheetCount = normalizeSheetCount(input.sheetCount);
  const shots = input.shots;

  const promptSets: VerticalDramaContactSheetBatchPlan["promptSets"] = [];
  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const perCellPrompts = shots.map((shot) => {
      const { row, col } = rowColFromCell(shot.shotNumber);
      return {
        shotNumber: shot.shotNumber,
        cellIndex: shot.shotNumber,
        row,
        col,
        imagePrompt: shot.imagePrompt,
        continuityNotes: shot.continuityNotes ?? [],
        requiredCharacterRefs: shot.requiredCharacterRefs ?? [],
        productReferenceAssetIds: shot.productReferenceAssetIds ?? [],
      };
    });
    promptSets.push({
      promptSetId: `${input.runId}:sheet:${sheetIndex}`,
      sheetIndex,
      contactSheetPrompt: buildSheetPrompt(shots, sheetIndex),
      negativePrompt: shots[0]?.negativePrompt ?? "",
      perCellPrompts,
    });
  }

  return {
    mode: "contact_sheet_3x3_batch",
    selectedImageModelId: modelId,
    gridLayout: "3x3",
    shotsPerSheet: 9,
    sheetCount,
    totalCandidateFrames: sheetCount * VERTICAL_DRAMA_CONTACT_SHEET_CELLS,
    aspectRatio: "9:16",
    promptVisibility: "all_prompts_visible",
    promptSets,
  };
}

function buildSheetPrompt(shots: VerticalDramaShotgridShot[], sheetIndex: number): string {
  return (
    `3x3 contact sheet (variation ${sheetIndex + 1}) — 9 vertical 9:16 start frames, ` +
    `one per shot, laid out left-to-right, top-to-bottom: ` +
    shots.map((s) => `#${s.shotNumber}`).join(", ")
  );
}

function normalizeSheetCount(sheetCount?: number): number {
  if (sheetCount == null) return VERTICAL_DRAMA_SHEET_COUNT_PRESETS[0];
  if (!Number.isFinite(sheetCount) || sheetCount < 1) return VERTICAL_DRAMA_SHEET_COUNT_PRESETS[0];
  return Math.floor(sheetCount);
}

function resolveCreditCost(modelId: string, override?: number): number {
  if (override != null && Number.isFinite(override)) return override;
  return getModelById(modelId)?.creditCost ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Deterministic 3x3 crop + 9:16 fit                                           */
/* -------------------------------------------------------------------------- */

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VerticalDramaCropCell {
  cellIndex: number;
  shotNumber: number;
  row: 1 | 2 | 3;
  col: 1 | 2 | 3;
  cropBox: CropBox;
}

/**
 * Deterministically split a full contact-sheet image into 9 equal cells. The
 * result is stable for a given (width, height) — same input, same crop boxes.
 * Cells are numbered 1-9 left-to-right, top-to-bottom and mapped straight to
 * shot numbers 1-9.
 */
export function deterministic3x3Crop(sheetWidth: number, sheetHeight: number): VerticalDramaCropCell[] {
  const cellW = Math.floor(sheetWidth / 3);
  const cellH = Math.floor(sheetHeight / 3);
  const cells: VerticalDramaCropCell[] = [];
  for (let cellIndex = 1; cellIndex <= 9; cellIndex += 1) {
    const { row, col } = rowColFromCell(cellIndex);
    cells.push({
      cellIndex,
      shotNumber: cellIndex,
      row,
      col,
      cropBox: {
        x: (col - 1) * cellW,
        y: (row - 1) * cellH,
        width: cellW,
        height: cellH,
      },
    });
  }
  return cells;
}

export type VerticalDrama916FitOperation = "valid" | "crop" | "pad" | "resize";

export interface VerticalDrama916FitResult {
  operation: VerticalDrama916FitOperation;
  /** The box (relative to the input frame) that yields the 9:16 output. */
  box: CropBox;
  /** Whether the frame is a valid 9:16 candidate after this operation. */
  valid: boolean;
  aspectRatio: "9:16";
}

/**
 * Validate a cropped candidate against 9:16, else deterministically compute a
 * crop / pad / resize box that makes it 9:16. Center-crops the longer axis.
 * Pure — the actual pixel op happens downstream; this returns the plan.
 */
export function fitCandidateTo916(width: number, height: number): VerticalDrama916FitResult {
  if (width <= 0 || height <= 0) {
    return { operation: "pad", box: { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) }, valid: false, aspectRatio: "9:16" };
  }
  const actual = width / height;
  const target = VERTICAL_DRAMA_TARGET_ASPECT_VALUE;
  const epsilon = 0.005;
  if (Math.abs(actual - target) <= epsilon) {
    return { operation: "valid", box: { x: 0, y: 0, width, height }, valid: true, aspectRatio: "9:16" };
  }
  if (actual > target) {
    // Too wide -> center-crop horizontally to target width.
    const newW = Math.round(height * target);
    const x = Math.floor((width - newW) / 2);
    return { operation: "crop", box: { x, y: 0, width: newW, height }, valid: true, aspectRatio: "9:16" };
  }
  // Too tall -> center-crop vertically to target height.
  const newH = Math.round(width / target);
  const y = Math.floor((height - newH) / 2);
  return { operation: "crop", box: { x: 0, y, width, height: newH }, valid: true, aspectRatio: "9:16" };
}

/* -------------------------------------------------------------------------- */
/* Start-frame plan builder OUTPUTS: QC checklist / repair template / manifest */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaFrameQcChecklistItem {
  key: "identity_match" | "aspect_ratio_9_16" | "required_refs_present" | "continuity_satisfied";
  label: string;
  status: "pending" | "passed" | "failed";
}

export interface VerticalDramaFrameQcChecklist {
  shotNumber: number;
  promptSetId: string;
  items: VerticalDramaFrameQcChecklistItem[];
}

export interface VerticalDramaFrameRepairTemplate {
  shotNumber: number;
  promptSetId: string;
  /** Reusable image prompt for a repair regeneration. */
  imagePrompt: string;
  /** Reusable negative-prompt scaffold. */
  negativePrompt: string;
  /** The repair action this template drives (spec §16). */
  repairAction: "regenerate_start_frame";
}

export interface VerticalDramaVideoInputManifestEntry {
  shotNumber: number;
  /** Filled once a frame is approved/selected; null while pending. */
  selectedMediaAssetId: string | null;
  promptSetId: string;
  /** Whether the shot feeds first+last frames or first-frame-only. */
  role: "first_and_last_frame" | "first_frame_only";
}

export interface VerticalDramaStartFramePlanOutputs {
  qcChecklists: VerticalDramaFrameQcChecklist[];
  repairTemplates: VerticalDramaFrameRepairTemplate[];
  videoInputManifest: VerticalDramaVideoInputManifestEntry[];
}

interface StartFramePlanRequestLike {
  shotNumber: number;
  promptSetId: string;
  imagePrompt: string;
  negativePrompt: string;
  requiredCharacterRefs: string[];
  continuityNotes: string[];
}

/**
 * Emit the three per-plan outputs required by spec §6.4 (spec lines 233-248):
 * per-frame QC checklist, per-frame repair-prompt template, and the downstream
 * video-input manifest. All stay linked to `shotNumber` + `promptSetId` so QC
 * results and repairs trace back to the originating render request.
 */
export function buildStartFramePlanOutputs(
  requests: StartFramePlanRequestLike[],
): VerticalDramaStartFramePlanOutputs {
  const qcChecklists = requests.map<VerticalDramaFrameQcChecklist>((r) => ({
    shotNumber: r.shotNumber,
    promptSetId: r.promptSetId,
    items: [
      { key: "identity_match", label: "Character identity matches approved references", status: "pending" },
      { key: "aspect_ratio_9_16", label: "Frame is a valid 9:16 vertical image", status: "pending" },
      { key: "required_refs_present", label: "All required character/product references present", status: "pending" },
      { key: "continuity_satisfied", label: "Continuity notes satisfied", status: "pending" },
    ],
  }));

  const repairTemplates = requests.map<VerticalDramaFrameRepairTemplate>((r) => ({
    shotNumber: r.shotNumber,
    promptSetId: r.promptSetId,
    imagePrompt: r.imagePrompt,
    negativePrompt: composeRepairNegativePrompt(r.negativePrompt),
    repairAction: "regenerate_start_frame",
  }));

  const videoInputManifest = requests.map<VerticalDramaVideoInputManifestEntry>((r, idx) => ({
    shotNumber: r.shotNumber,
    selectedMediaAssetId: null,
    promptSetId: r.promptSetId,
    // Last shot commonly closes the clip; default all-but-last to first+last.
    role: idx === requests.length - 1 ? "first_frame_only" : "first_and_last_frame",
  }));

  return { qcChecklists, repairTemplates, videoInputManifest };
}

function composeRepairNegativePrompt(base: string): string {
  const scaffold = [
    "identity drift",
    "wrong aspect ratio",
    "cropped face",
    "extra limbs",
    "duplicated character",
    "text artifacts",
  ];
  const parts = base.trim().length > 0 ? [base.trim(), ...scaffold] : scaffold;
  return Array.from(new Set(parts)).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Generation job group orchestration                                          */
/* -------------------------------------------------------------------------- */

export interface PlanJobGroupInput {
  runId: string;
  episodeId: string;
  selectedImageModelId: string;
  sheetCount: number;
  parallelJobLimit?: number;
  creditCostPerSheet?: number;
}

/**
 * Build a job group descriptor for a contact-sheet batch: expected candidate
 * count, one job id per sheet, a `parallelJobLimit`, and per-sheet statuses.
 * `dryRun` leaves it in `planned` (no paid generation implied).
 */
export function planJobGroup(input: PlanJobGroupInput): VerticalDramaContactSheetGenerationJobGroup {
  const sheetCount = normalizeSheetCount(input.sheetCount);
  const contactSheetJobIds = Array.from(
    { length: sheetCount },
    (_v, i) => `${input.runId}:job:${i}`,
  );
  const perSheet = resolveCreditCost(input.selectedImageModelId, input.creditCostPerSheet);
  return {
    jobGroupId: `${input.runId}:jobgroup`,
    runId: input.runId,
    episodeId: input.episodeId,
    selectedImageModelId: input.selectedImageModelId,
    sheetCount,
    parallelJobLimit: input.parallelJobLimit ?? VERTICAL_DRAMA_DEFAULT_PARALLEL_JOB_LIMIT,
    requestedAt: new Date().toISOString(),
    status: "planned",
    contactSheetJobIds,
    expectedCandidateFrameCount: sheetCount * VERTICAL_DRAMA_CONTACT_SHEET_CELLS,
    completedCandidateFrameCount: 0,
    creditEstimate: perSheet * sheetCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Repair-without-deletion + version lineage                                   */
/* -------------------------------------------------------------------------- */

export type VerticalDramaCandidateRejectReasonCode =
  | "identity_drift"
  | "wrong_aspect_ratio"
  | "crop_artifact"
  | "wrong_pose"
  | "product_mismatch"
  | "other";

export interface VerticalDramaCandidateRejection {
  candidateFrameId: string;
  shotNumber: number;
  reason: string;
  reasonCode?: VerticalDramaCandidateRejectReasonCode;
  rejectedByUserId: string;
  rejectedAt: string;
}

/**
 * Apply a reject/flag to a candidate WITHOUT deleting it or its source sheet.
 * Sets `qcStatus: "needs_repair"`, preserves `fullSheetMediaAssetId` and every
 * sibling candidate frame (Repair-Without-Deletion Rule, spec §7.5 line 1367).
 * Returns the updated sheet plus the durable rejection metadata.
 */
export function rejectCandidateWithoutDeletion(
  sheet: VerticalDramaContactSheetAsset,
  rejection: VerticalDramaCandidateRejection,
): { sheet: VerticalDramaContactSheetAsset; rejection: VerticalDramaCandidateRejection } {
  const croppedFrames = sheet.croppedFrames.map((f) =>
    f.candidateFrameId === rejection.candidateFrameId
      ? { ...f, qcStatus: "needs_repair" as const }
      : f,
  );
  return {
    // fullSheetMediaAssetId + all sibling frames are preserved intact.
    sheet: { ...sheet, croppedFrames },
    rejection,
  };
}

/** Stage identifier for the shared repair route (spec §11.6). */
export const VERTICAL_DRAMA_REPAIR_STAGE = "start_frame_image" as const;

export interface VerticalDramaRepairRequest {
  stage: typeof VERTICAL_DRAMA_REPAIR_STAGE;
  /** Source artifact (the contact sheet id / candidate artifact). */
  artifactId: string;
  shotNumber: number;
  candidateFrameId: string;
  instruction: string;
  /** Mapped repair action (spec §16 recommended repairs). */
  repairAction: "regenerate_start_frame" | "repair_storyboard_shot";
  targetImageModelId: string;
}

export interface VerticalDramaCandidateVersion {
  candidateFrameId: string;
  shotNumber: number;
  state: "active" | "superseded";
  mediaAssetId: string;
  /** Lineage: the artifact ids this version was derived from. */
  sourceArtifactIds: string[];
  repairRequestIds: string[];
  fullSheetMediaAssetId: string;
  createdAt: string;
}

/**
 * Produce a NEW superseding candidate version from a repair request, marking the
 * prior candidate `superseded` (never deleted). Records `sourceArtifactIds` and
 * `repairRequestIds` so the lineage can be walked back. The full contact sheet
 * and sibling candidates are untouched.
 */
export function buildSupersedingCandidateVersion(params: {
  prior: VerticalDramaCandidateVersion;
  newCandidateFrameId: string;
  newMediaAssetId: string;
  repairRequestId: string;
  repairArtifactId: string;
  now?: string;
}): { prior: VerticalDramaCandidateVersion; next: VerticalDramaCandidateVersion } {
  const now = params.now ?? new Date().toISOString();
  const superseded: VerticalDramaCandidateVersion = { ...params.prior, state: "superseded" };
  const next: VerticalDramaCandidateVersion = {
    candidateFrameId: params.newCandidateFrameId,
    shotNumber: params.prior.shotNumber,
    state: "active",
    mediaAssetId: params.newMediaAssetId,
    sourceArtifactIds: Array.from(
      new Set([...params.prior.sourceArtifactIds, params.prior.candidateFrameId, params.repairArtifactId]),
    ),
    repairRequestIds: Array.from(new Set([...params.prior.repairRequestIds, params.repairRequestId])),
    fullSheetMediaAssetId: params.prior.fullSheetMediaAssetId,
    createdAt: now,
  };
  return { prior: superseded, next };
}

/**
 * Walk `sourceArtifactIds` back through a candidate set to build an ordered
 * per-shot version lineage (original -> repaired -> re-repaired). Used by the
 * version/lineage strip for browse + old-vs-new compare.
 */
export function buildCandidateLineage(
  shotNumber: number,
  versions: VerticalDramaCandidateVersion[],
): VerticalDramaCandidateVersion[] {
  const forShot = versions.filter((v) => v.shotNumber === shotNumber);
  const byFrameId = new Map(forShot.map((v) => [v.candidateFrameId, v]));
  // Depth = how many known ancestors this version references, giving a stable order.
  const depth = (v: VerticalDramaCandidateVersion): number =>
    v.sourceArtifactIds.filter((id) => byFrameId.has(id)).length;
  return [...forShot].sort((a, b) => {
    const d = depth(a) - depth(b);
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/* -------------------------------------------------------------------------- */
/* Selection (one candidate per shot)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Upsert a single selected candidate per shot. Selection is explicit — nothing
 * reaches Storyboard Review until the user picks it. Re-selecting a different
 * version replaces the selection for that shot without deleting any candidate.
 */
export function applySelection(
  current: VerticalDramaSelectedStartFrame[],
  selection: VerticalDramaSelectedStartFrame,
): VerticalDramaSelectedStartFrame[] {
  const rest = current.filter((s) => s.shotNumber !== selection.shotNumber);
  return [...rest, selection].sort((a, b) => a.shotNumber - b.shotNumber);
}

/* -------------------------------------------------------------------------- */
/* Service (DB-backed persistence)                                             */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaStartFrameOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  runId: number;
}

const START_FRAME_ARTIFACT_STAGE = "render_or_import_start_frames" as const;

export class VerticalDramaStartFrameService {
  /**
   * Reject a media asset that isn't owned by the caller or is deleted. Used
   * before attaching a full-sheet / candidate media asset to a durable record.
   */
  async assertMediaAssetAttachable(
    owner: Pick<VerticalDramaStartFrameOwner, "tenantId" | "userId">,
    mediaAssetId: number,
  ): Promise<void> {
    const [row] = await db
      .select({ id: mediaAssets.id, tenantId: mediaAssets.tenantId, userId: mediaAssets.userId, status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    if (!row) throw new Error("start_frame_media_asset_not_found");
    if (row.tenantId !== owner.tenantId) throw new Error("start_frame_media_asset_cross_tenant");
    if (row.userId !== owner.userId) throw new Error("start_frame_media_asset_cross_user");
    if (row.status === "deleted" || row.status === "failed" || row.status === "purged") {
      throw new Error("start_frame_media_asset_deleted");
    }
  }

  /**
   * Persist a start-frame artifact payload (the plan, job group, sheets,
   * selection, lineage) to the durable run-artifact ledger. Ownership is stamped
   * from `owner`; the payload is stored losslessly as `jsonPayload`.
   */
  async persistArtifact(
    owner: VerticalDramaStartFrameOwner,
    payload: Record<string, unknown>,
    mediaAssetIds: number[] = [],
  ): Promise<VerticalDramaRunArtifactRow> {
    const [row] = await db
      .insert(verticalDramaRunArtifacts)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: owner.runId,
        stage: START_FRAME_ARTIFACT_STAGE,
        jsonPayload: payload,
        mediaAssetIds,
      } as typeof verticalDramaRunArtifacts.$inferInsert)
      .returning();
    return row as VerticalDramaRunArtifactRow;
  }

  /** Load the latest persisted start-frame artifact for a run (owner-scoped). */
  async loadLatestArtifact(
    owner: VerticalDramaStartFrameOwner,
  ): Promise<VerticalDramaRunArtifactRow | undefined> {
    const rows: VerticalDramaRunArtifactRow[] = await db
      .select()
      .from(verticalDramaRunArtifacts)
      .where(
        and(
          eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
          eq(verticalDramaRunArtifacts.userId, owner.userId),
          eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
          eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
          eq(verticalDramaRunArtifacts.runId, owner.runId),
          eq(verticalDramaRunArtifacts.stage, START_FRAME_ARTIFACT_STAGE),
        ),
      );
    // Latest by id (bigserial monotonic).
    return rows.sort((a: { id: number }, b: { id: number }) => b.id - a.id)[0];
  }
}

/** Shared singleton. */
export const verticalDramaStartFrameService = new VerticalDramaStartFrameService();
