/**
 * Vertical Drama Series — start-frame / contact-sheet router (spec feature 131,
 * section-05, §6.4 / §7.5 / §11.6 / §16).
 *
 * Every procedure is protected (auth required), gated on the `verticalDramaSeries`
 * tenant feature flag (fail-closed), and scoped to the caller's tenant + user so
 * a user can never read or mutate another tenant's or user's series / episode /
 * run. `generateSheets` is DRY-RUN SAFE: it plans and persists a job group in the
 * `planned` state and NEVER triggers paid generation.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import { verticalDramaEpisodes, verticalDramaEpisodeRuns } from "../../drizzle/schema";
import {
  resolveImageModels,
  planContactSheetBatch,
  planSingleFramePerShot,
  planJobGroup,
  buildStartFramePlanOutputs,
  rejectCandidateWithoutDeletion,
  buildSupersedingCandidateVersion,
  buildCandidateLineage,
  applySelection,
  verticalDramaStartFrameService,
  VERTICAL_DRAMA_REPAIR_STAGE,
  VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE,
  VERTICAL_DRAMA_SHEET_COUNT_PRESETS,
  type PlanStartFramesInput,
  type VerticalDramaShotgridShot,
  type VerticalDramaStartFrameMode,
  type VerticalDramaCandidateVersion,
} from "../services/verticalDramaStartFrame";
import { VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL } from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                          */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries"),
);

function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/**
 * Load the caller-owned episode (tenant + user + series scoped) or throw
 * NOT_FOUND. NOT_FOUND (not FORBIDDEN) is deliberate — never disclose the
 * existence of another tenant's/user's episode.
 */
async function loadOwnedEpisode(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeId: number,
) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, episodeId),
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.seriesId, seriesId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
  return row;
}

/** Resolve (and ownership-check) the run row for a start-frame stage. */
async function loadOwnedRun(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeId: number,
  runId: number,
) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodeRuns)
    .where(
      and(
        eq(verticalDramaEpisodeRuns.id, runId),
        eq(verticalDramaEpisodeRuns.tenantId, tenantId),
        eq(verticalDramaEpisodeRuns.userId, userId),
        eq(verticalDramaEpisodeRuns.seriesId, seriesId),
        eq(verticalDramaEpisodeRuns.episodeId, episodeId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
  return row;
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const shotSchema = z.object({
  shotNumber: z.number().int().min(1).max(9),
  imagePrompt: z.string().max(8000),
  negativePrompt: z.string().max(4000).optional(),
  continuityNotes: z.array(z.string().max(2000)).max(50).optional(),
  requiredCharacterRefs: z.array(z.string().max(128)).max(50).optional(),
  productReferenceAssetIds: z.array(z.string().max(128)).max(50).optional(),
});

const ownerScopeSchema = z.object({
  seriesId: z.string().min(1),
  episodeId: z.string().min(1),
  runId: z.string().min(1),
});

const planInputSchema = ownerScopeSchema.extend({
  mode: z.enum(["single_frame_per_shot", "contact_sheet_3x3_batch"]).optional(),
  selectedImageModelId: z.string().max(128).optional(),
  sheetCount: z.number().int().min(1).max(12).optional(),
  shots: z.array(shotSchema).min(1).max(9),
});

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaStartFramesRouter = router({
  /**
   * List every enabled `type = "image"` model with 9:16 compatibility metadata
   * and incompatibility reason codes. The list is NOT filtered — incompatible
   * models stay visible/selectable, annotated with a machine-readable reason
   * code so the UI can badge them and disable approve-to-generate.
   */
  resolveImageModels: verticalDramaProcedure
    .input(z.object({ defaultModelId: z.string().max(128).optional() }).optional())
    .query(async ({ input }) => {
      const resolution = await resolveImageModels(
        input?.defaultModelId ?? VERTICAL_DRAMA_DEFAULT_CONTACT_SHEET_IMAGE_MODEL,
      );
      return {
        ...resolution,
        sheetCountPresets: [...VERTICAL_DRAMA_SHEET_COUNT_PRESETS],
        defaultMode: VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE,
      };
    }),

  /**
   * Plan a start-frame batch for review BEFORE any paid generation. Returns the
   * mode-specific plan (contact-sheet batch or single-frame-per-shot), the plan
   * outputs (per-frame QC checklist, repair-prompt template, video-input
   * manifest), and a credit estimate. Nothing is generated or charged here.
   */
  planContactSheets: verticalDramaProcedure
    .input(planInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      const mode: VerticalDramaStartFrameMode =
        input.mode ?? VERTICAL_DRAMA_DEFAULT_START_FRAME_MODE;
      const planInput: PlanStartFramesInput = {
        runId: input.runId,
        episodeId: input.episodeId,
        mode,
        selectedImageModelId: input.selectedImageModelId,
        sheetCount: input.sheetCount,
        shots: input.shots as VerticalDramaShotgridShot[],
      };

      if (mode === "single_frame_per_shot") {
        const plan = planSingleFramePerShot(planInput);
        const outputs = buildStartFramePlanOutputs(plan.requests);
        return { mode, plan, outputs, promptVisibility: "all_prompts_visible" as const };
      }

      const plan = planContactSheetBatch(planInput);
      const requests = plan.promptSets[0]?.perCellPrompts.map((c) => ({
        shotNumber: c.shotNumber,
        promptSetId: plan.promptSets[0].promptSetId,
        imagePrompt: c.imagePrompt,
        negativePrompt: plan.promptSets[0].negativePrompt,
        requiredCharacterRefs: c.requiredCharacterRefs,
        continuityNotes: c.continuityNotes,
      })) ?? [];
      const outputs = buildStartFramePlanOutputs(requests);
      return { mode, plan, outputs, promptVisibility: "all_prompts_visible" as const };
    }),

  /**
   * DRY-RUN SAFE: plan + persist a contact-sheet generation job group in the
   * `planned` state. Does NOT trigger paid generation. Returns the job group
   * (job ids, parallel limit, expected counts, credit estimate).
   */
  generateSheets: verticalDramaProcedure
    .input(
      ownerScopeSchema.extend({
        selectedImageModelId: z.string().max(128),
        sheetCount: z.number().int().min(1).max(12),
        parallelJobLimit: z.number().int().min(1).max(8).optional(),
        dryRun: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      const jobGroup = planJobGroup({
        runId: input.runId,
        episodeId: input.episodeId,
        selectedImageModelId: input.selectedImageModelId,
        sheetCount: input.sheetCount,
        parallelJobLimit: input.parallelJobLimit,
      });

      const artifact = await verticalDramaStartFrameService.persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        { kind: "start_frame_job_group", jobGroup, dryRun: input.dryRun !== false },
      );

      return { jobGroup, artifactId: String(artifact.id), dryRun: input.dryRun !== false };
    }),

  /**
   * Persist a single selected candidate per shot (explicit approval). Nothing
   * reaches Storyboard Review until selected; re-selecting a version replaces
   * the selection without deleting any candidate.
   */
  selectCandidate: verticalDramaProcedure
    .input(
      ownerScopeSchema.extend({
        shotNumber: z.number().int().min(1).max(9),
        selectedCandidateFrameId: z.string().min(1).max(128),
        selectedMediaAssetId: z.string().min(1).max(64),
        sourceContactSheetId: z.string().min(1).max(128),
        promptSetId: z.string().min(1).max(128),
        selectionReason: z.string().max(2000).optional(),
        currentSelection: z
          .array(
            z.object({
              shotNumber: z.number().int(),
              selectedCandidateFrameId: z.string(),
              selectedMediaAssetId: z.string(),
              sourceContactSheetId: z.string(),
              promptSetId: z.string(),
              selectedByUserId: z.string(),
              selectedAt: z.string(),
              selectionReason: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      // Reject cross-tenant / deleted media assets before persisting a selection.
      const mediaAssetId = Number(input.selectedMediaAssetId);
      if (Number.isFinite(mediaAssetId) && mediaAssetId > 0) {
        await verticalDramaStartFrameService.assertMediaAssetAttachable(
          { tenantId, userId },
          mediaAssetId,
        );
      }

      const selection = applySelection(input.currentSelection ?? [], {
        shotNumber: input.shotNumber,
        selectedCandidateFrameId: input.selectedCandidateFrameId,
        selectedMediaAssetId: input.selectedMediaAssetId,
        sourceContactSheetId: input.sourceContactSheetId,
        promptSetId: input.promptSetId,
        selectedByUserId: String(userId),
        selectedAt: new Date().toISOString(),
        selectionReason: input.selectionReason,
      });

      const artifact = await verticalDramaStartFrameService.persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        { kind: "start_frame_selection", selection },
        Number.isFinite(mediaAssetId) ? [mediaAssetId] : [],
      );
      return { selection, artifactId: String(artifact.id) };
    }),

  /**
   * Reject/flag a candidate with a reason WITHOUT deleting it or its source
   * sheet. Marks the candidate `needs_repair`, preserves `fullSheetMediaAssetId`
   * and every sibling candidate frame (Repair-Without-Deletion Rule).
   */
  rejectCandidate: verticalDramaProcedure
    .input(
      ownerScopeSchema.extend({
        candidateFrameId: z.string().min(1).max(128),
        shotNumber: z.number().int().min(1).max(9),
        reason: z.string().min(1).max(2000),
        reasonCode: z
          .enum([
            "identity_drift",
            "wrong_aspect_ratio",
            "crop_artifact",
            "wrong_pose",
            "product_mismatch",
            "other",
          ])
          .optional(),
        // The current sheet state (croppedFrames + fullSheetMediaAssetId) so the
        // non-destructive update can be computed and re-persisted.
        sheet: z.object({
          contactSheetId: z.string(),
          runId: z.string(),
          episodeId: z.string(),
          promptSetId: z.string(),
          imageModelId: z.string(),
          fullSheetMediaAssetId: z.string(),
          cropStatus: z.enum(["pending", "cropped", "failed"]),
          croppedFrames: z.array(z.record(z.string(), z.unknown())),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      const rejection = {
        candidateFrameId: input.candidateFrameId,
        shotNumber: input.shotNumber,
        reason: input.reason,
        reasonCode: input.reasonCode,
        rejectedByUserId: String(userId),
        rejectedAt: new Date().toISOString(),
      };
      const result = rejectCandidateWithoutDeletion(input.sheet as any, rejection);

      const artifact = await verticalDramaStartFrameService.persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        { kind: "start_frame_candidate_rejection", rejection, sheet: result.sheet },
      );
      return { rejection, sheet: result.sheet, artifactId: String(artifact.id) };
    }),

  /**
   * Submit a per-frame repair to the shared repair route. Creates a NEW,
   * non-destructive candidate version that supersedes the prior candidate,
   * records `sourceArtifactIds`/`repairRequestIds`, and NEVER deletes the full
   * contact sheet or siblings. Stays behind the prompt/model approval gate.
   */
  repairFrame: verticalDramaProcedure
    .input(
      ownerScopeSchema.extend({
        artifactId: z.string().min(1).max(128),
        shotNumber: z.number().int().min(1).max(9),
        candidateFrameId: z.string().min(1).max(128),
        instruction: z.string().min(1).max(8000),
        targetImageModelId: z.string().min(1).max(128),
        repairAction: z.enum(["regenerate_start_frame", "repair_storyboard_shot"]).optional(),
        prior: z.object({
          candidateFrameId: z.string(),
          shotNumber: z.number().int(),
          state: z.enum(["active", "superseded"]),
          mediaAssetId: z.string(),
          sourceArtifactIds: z.array(z.string()),
          repairRequestIds: z.array(z.string()),
          fullSheetMediaAssetId: z.string(),
          createdAt: z.string(),
        }),
        newMediaAssetId: z.string().min(1).max(64),
        approved: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      // Approval gate: no paid repair generation until the visible instruction
      // and model are approved.
      if (input.approved !== true) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Repair requires explicit prompt/model approval before generation",
        });
      }

      const newMediaAssetId = Number(input.newMediaAssetId);
      if (Number.isFinite(newMediaAssetId) && newMediaAssetId > 0) {
        await verticalDramaStartFrameService.assertMediaAssetAttachable(
          { tenantId, userId },
          newMediaAssetId,
        );
      }

      const repairRequest = {
        stage: VERTICAL_DRAMA_REPAIR_STAGE,
        artifactId: input.artifactId,
        shotNumber: input.shotNumber,
        candidateFrameId: input.candidateFrameId,
        instruction: input.instruction,
        repairAction: input.repairAction ?? "regenerate_start_frame",
        targetImageModelId: input.targetImageModelId,
      };
      const repairRequestId = `${input.runId}:repair:${input.candidateFrameId}:${Date.now()}`;

      const { prior, next } = buildSupersedingCandidateVersion({
        prior: input.prior as VerticalDramaCandidateVersion,
        newCandidateFrameId: `${input.candidateFrameId}:v${(input.prior.repairRequestIds.length ?? 0) + 1}`,
        newMediaAssetId: input.newMediaAssetId,
        repairRequestId,
        repairArtifactId: input.artifactId,
      });

      const artifact = await verticalDramaStartFrameService.persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        { kind: "start_frame_repair", repairRequest, repairRequestId, prior, next },
        Number.isFinite(newMediaAssetId) ? [newMediaAssetId] : [],
      );
      return { repairRequest, repairRequestId, prior, next, artifactId: String(artifact.id) };
    }),

  /**
   * Three distinct regeneration/replace controls (spec §7.5 line 1358). Each is
   * scoped and dry-run safe (plans + persists a job in `planned`, no paid run):
   *   - whole_sheet         -> re-run one full sheet (sheetIndex)
   *   - single_prompt_set   -> re-run one prompt set (promptSetId)
   *   - single_frame        -> replace one cropped frame (candidateFrameId)
   */
  regenerate: verticalDramaProcedure
    .input(
      ownerScopeSchema.extend({
        scope: z.enum(["whole_sheet", "single_prompt_set", "single_frame"]),
        selectedImageModelId: z.string().min(1).max(128),
        sheetIndex: z.number().int().min(0).max(64).optional(),
        promptSetId: z.string().max(128).optional(),
        candidateFrameId: z.string().max(128).optional(),
        approved: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      if (input.approved !== true) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Regeneration requires explicit prompt/model approval before generation",
        });
      }

      // Validate scope-specific targeting.
      if (input.scope === "whole_sheet" && input.sheetIndex == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "whole_sheet requires sheetIndex" });
      }
      if (input.scope === "single_prompt_set" && !input.promptSetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "single_prompt_set requires promptSetId" });
      }
      if (input.scope === "single_frame" && !input.candidateFrameId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "single_frame requires candidateFrameId" });
      }

      const job = planJobGroup({
        runId: input.runId,
        episodeId: input.episodeId,
        selectedImageModelId: input.selectedImageModelId,
        sheetCount: input.scope === "whole_sheet" ? 1 : 1,
      });

      const artifact = await verticalDramaStartFrameService.persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        {
          kind: "start_frame_regenerate",
          scope: input.scope,
          sheetIndex: input.sheetIndex ?? null,
          promptSetId: input.promptSetId ?? null,
          candidateFrameId: input.candidateFrameId ?? null,
          job,
        },
      );
      return { scope: input.scope, job, artifactId: String(artifact.id) };
    }),

  /**
   * Build a per-shot version/lineage strip from a supplied candidate-version
   * set (walks `sourceArtifactIds`). Superseded + current versions are returned
   * in lineage order for the browse + old-vs-new compare surface.
   */
  candidateLineage: verticalDramaProcedure
    .input(
      z.object({
        shotNumber: z.number().int().min(1).max(9),
        versions: z.array(
          z.object({
            candidateFrameId: z.string(),
            shotNumber: z.number().int(),
            state: z.enum(["active", "superseded"]),
            mediaAssetId: z.string(),
            sourceArtifactIds: z.array(z.string()),
            repairRequestIds: z.array(z.string()),
            fullSheetMediaAssetId: z.string(),
            createdAt: z.string(),
          }),
        ),
      }),
    )
    .query(({ input }) => {
      const lineage = buildCandidateLineage(
        input.shotNumber,
        input.versions as VerticalDramaCandidateVersion[],
      );
      return { shotNumber: input.shotNumber, lineage };
    }),
});

export type VerticalDramaStartFramesRouter = typeof verticalDramaStartFramesRouter;
