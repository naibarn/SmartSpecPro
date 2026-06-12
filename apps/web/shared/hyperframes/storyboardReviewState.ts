import { z } from "zod";

import {
  HyperframesCreativeVariablesSchema,
  HyperframesShotMediaAssignmentSchema,
  HyperframesThaiFontFamilySchema,
} from "./creativePresets";

const SafeIdSchema = z.string().trim().min(1).max(180);
const SafeHashSchema = z.string().trim().min(6).max(160);
const SafeTextSchema = z.string().trim().max(4000);
const StoryboardReviewProjectIdSchema = z.union([z.string(), z.number()]);

export const HyperframesFinalCompositeTextVariablesSchema = z
  .object({
    fontFamily: HyperframesThaiFontFamilySchema.default("Prompt"),
    overlayPresetId: SafeIdSchema.optional(),
    subtitlePresetId: SafeIdSchema.optional(),
    audioPackPresetId: SafeIdSchema.optional(),
    musicPresetId: SafeIdSchema.optional(),
    sfxPresetIds: z.array(SafeIdSchema).default([]),
    preserveNativeAudio: z.boolean().default(true),
    syntheticAudioFallback: z.boolean().default(true),
    hookText: z.string().trim().max(240).optional(),
    supportingText: z.string().trim().max(240).optional(),
    perShotText: z.record(SafeTextSchema).default({}),
    perShotSubtitles: z.record(SafeTextSchema).default({}),
    creativeVariables: HyperframesCreativeVariablesSchema.optional(),
  })
  .strict();

export const HyperframesFinalCompositeRenderJobRefSchema = z
  .object({
    renderJobId: SafeIdSchema,
    status: z.string().trim().min(1).max(80),
    outputUrl: z.string().trim().max(2048).optional(),
    outputStorageKey: z.string().trim().max(2048).optional(),
    createdAt: z.string().trim().min(1).max(80),
    updatedAt: z.string().trim().min(1).max(80),
  })
  .strict();

export const StoryboardReviewHyperframesFinalCompositeStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    canonicalProductId: SafeIdSchema,
    autoReviewRunId: SafeIdSchema,
    storyboardReviewProjectId: StoryboardReviewProjectIdSchema,
    revision: z.number().int().min(0),
    createdAt: z.string().trim().min(1).max(80),
    updatedAt: z.string().trim().min(1).max(80),
    shotMediaAssignments: z.array(HyperframesShotMediaAssignmentSchema).default([]),
    textVariables: HyperframesFinalCompositeTextVariablesSchema.default({}),
    creativePlanHash: SafeHashSchema.optional(),
    latestRenderJobRef: HyperframesFinalCompositeRenderJobRefSchema.optional(),
    renderJobRefs: z.array(HyperframesFinalCompositeRenderJobRefSchema).default([]),
  })
  .strict();

export type StoryboardReviewHyperframesFinalCompositeState = z.infer<
  typeof StoryboardReviewHyperframesFinalCompositeStateSchema
>;
export type HyperframesFinalCompositeTextVariables = z.infer<
  typeof HyperframesFinalCompositeTextVariablesSchema
>;

export const UpdateStoryboardReviewHyperframesFinalCompositePatchSchema = z
  .object({
    shotMediaAssignments: z.array(HyperframesShotMediaAssignmentSchema).optional(),
    textVariables: HyperframesFinalCompositeTextVariablesSchema.partial().optional(),
    creativePlanHash: SafeHashSchema.optional().nullable(),
    latestRenderJobRef: HyperframesFinalCompositeRenderJobRefSchema.optional(),
  })
  .strict();

export type UpdateStoryboardReviewHyperframesFinalCompositePatch = z.infer<
  typeof UpdateStoryboardReviewHyperframesFinalCompositePatchSchema
>;

export const UpdateStoryboardReviewHyperframesFinalCompositeInputSchema = z
  .object({
    storyboardReviewProjectId: z.number().int().positive(),
    productId: SafeIdSchema,
    runId: SafeIdSchema,
    expectedRevision: z.number().int().min(0).optional(),
    patch: UpdateStoryboardReviewHyperframesFinalCompositePatchSchema,
  })
  .strict();

export type UpdateStoryboardReviewHyperframesFinalCompositeInput = z.infer<
  typeof UpdateStoryboardReviewHyperframesFinalCompositeInputSchema
>;

export function getStoryboardReviewHyperframesFinalCompositeState(
  reviewData: unknown
): StoryboardReviewHyperframesFinalCompositeState | null {
  if (!reviewData || typeof reviewData !== "object" || Array.isArray(reviewData)) {
    return null;
  }
  const raw = (reviewData as Record<string, unknown>).hyperframesFinalComposite;
  if (!raw) return null;
  const parsed = StoryboardReviewHyperframesFinalCompositeStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isManagedStoryboardMediaRef(value: string | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("/api/storage/") ||
    value.startsWith("storage://") ||
    value.startsWith("asset://") ||
    value.startsWith("media-library://")
  );
}

export function validateStoryboardReviewShotAssignments(
  input: Pick<UpdateStoryboardReviewHyperframesFinalCompositeInput, "storyboardReviewProjectId">,
  assignments: StoryboardReviewHyperframesFinalCompositeState["shotMediaAssignments"]
): void {
  for (const assignment of assignments) {
    if (String(assignment.storyboardReviewProjectId) !== String(input.storyboardReviewProjectId)) {
      throw new Error("Shot media assignment belongs to a different Storyboard Review project.");
    }
    const sourceUrl = assignment.sourceUrl?.trim();
    if (sourceUrl?.startsWith("http://") || sourceUrl?.startsWith("https://")) {
      throw new Error("Shot media assignment must use managed storage refs, not raw remote URLs.");
    }
    if (!assignment.storageRef && !assignment.contentHash && !isManagedStoryboardMediaRef(sourceUrl)) {
      throw new Error("Shot media assignment requires storageRef, contentHash, or a managed sourceUrl.");
    }
  }
}

export function buildNextStoryboardReviewHyperframesFinalCompositeState(params: {
  existingState: StoryboardReviewHyperframesFinalCompositeState | null;
  input: UpdateStoryboardReviewHyperframesFinalCompositeInput;
  nowIso: string;
}): StoryboardReviewHyperframesFinalCompositeState {
  const { existingState, input, nowIso } = params;
  if (existingState) {
    if (existingState.canonicalProductId !== input.productId) {
      throw new Error("HyperFrames state product does not match this Storyboard Review.");
    }
    if (existingState.autoReviewRunId !== input.runId) {
      throw new Error("HyperFrames state Auto Review run does not match this Storyboard Review.");
    }
    if (String(existingState.storyboardReviewProjectId) !== String(input.storyboardReviewProjectId)) {
      throw new Error("HyperFrames state Storyboard Review id does not match.");
    }
    if (
      typeof input.expectedRevision === "number" &&
      input.expectedRevision !== existingState.revision
    ) {
      throw new Error("HyperFrames final composite state revision conflict.");
    }
  } else if (typeof input.expectedRevision === "number" && input.expectedRevision !== 0) {
    throw new Error("HyperFrames final composite state revision conflict.");
  }

  const shotMediaAssignments =
    input.patch.shotMediaAssignments ?? existingState?.shotMediaAssignments ?? [];
  validateStoryboardReviewShotAssignments(input, shotMediaAssignments);

  const renderJobRefs = [
    ...(existingState?.renderJobRefs ?? []),
    ...(input.patch.latestRenderJobRef ? [input.patch.latestRenderJobRef] : []),
  ].slice(-20);

  return StoryboardReviewHyperframesFinalCompositeStateSchema.parse({
    schemaVersion: 1,
    canonicalProductId: input.productId,
    autoReviewRunId: input.runId,
    storyboardReviewProjectId: input.storyboardReviewProjectId,
    revision: existingState ? existingState.revision + 1 : 1,
    createdAt: existingState?.createdAt ?? nowIso,
    updatedAt: nowIso,
    shotMediaAssignments,
    textVariables: {
      ...(existingState?.textVariables ?? {}),
      ...(input.patch.textVariables ?? {}),
    },
    creativePlanHash:
      input.patch.creativePlanHash === null
        ? undefined
        : input.patch.creativePlanHash ?? existingState?.creativePlanHash,
    latestRenderJobRef: input.patch.latestRenderJobRef ?? existingState?.latestRenderJobRef,
    renderJobRefs,
  });
}

export function mergeStoryboardReviewHyperframesFinalCompositeState(params: {
  reviewData: unknown;
  input: UpdateStoryboardReviewHyperframesFinalCompositeInput;
  nowIso: string;
}): {
  reviewData: Record<string, unknown>;
  state: StoryboardReviewHyperframesFinalCompositeState;
} {
  const reviewData =
    params.reviewData && typeof params.reviewData === "object" && !Array.isArray(params.reviewData)
      ? { ...(params.reviewData as Record<string, unknown>) }
      : {};
  const state = buildNextStoryboardReviewHyperframesFinalCompositeState({
    existingState: getStoryboardReviewHyperframesFinalCompositeState(reviewData),
    input: params.input,
    nowIso: params.nowIso,
  });
  return {
    reviewData: {
      ...reviewData,
      updatedAt: Date.parse(params.nowIso),
      hyperframesFinalComposite: state,
    },
    state,
  };
}

export function classifyStoryboardReviewHyperframesFinalCompositeState(
  reviewData: unknown
): "valid" | "repairable" | "delete_only" | "unknown" {
  if (!reviewData || typeof reviewData !== "object" || Array.isArray(reviewData)) {
    return "unknown";
  }
  const raw = (reviewData as Record<string, unknown>).hyperframesFinalComposite;
  if (!raw) return "unknown";
  const parsed = StoryboardReviewHyperframesFinalCompositeStateSchema.safeParse(raw);
  if (parsed.success) return "valid";
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (
      record.canonicalProductId &&
      record.autoReviewRunId &&
      record.storyboardReviewProjectId
    ) {
      return "repairable";
    }
    return "delete_only";
  }
  return "delete_only";
}
