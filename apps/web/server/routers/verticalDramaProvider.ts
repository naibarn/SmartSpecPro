/**
 * Vertical Drama Series — provider routing / QC / product tie-in router
 * (spec feature 131, section-08, §9.1 / §11.5 / §11.6 / §13 / §16).
 *
 * Every procedure is protected (auth required), gated on the relevant tenant
 * feature flag (fail-closed), and scoped to the caller's tenant + user so a user
 * can never read or mutate another tenant's / user's series / episode / run.
 *
 * DRY-RUN SAFE: `runProviderJob` never calls a paid provider — it routes +
 * gates, then (only after approval) creates a DETERMINISTIC Mock provider job so
 * the lifecycle is exercisable without provider credentials. Real paid rendering
 * is wired in by the conductor via the injected runtime adapter.
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
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
} from "../../drizzle/schema";
import { auditLogger } from "../services/auditLogger";
import {
  resolveVideoModels,
  resolveVideoModelId,
  planProviderRouting,
  selectVideoProviderAdapter,
  VerticalDramaProviderJobLifecycle,
  VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
  VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL,
  type VerticalDramaMotionMode,
} from "../services/verticalDramaProviderRouting";
import {
  runQcForStage,
  stageBlocksPaidGeneration,
  buildPrefilledRepair,
  repairEntryPointSection,
  repairRequiresCreditConfirmation,
  stagesMadeStaleByRepair,
  verticalDramaQcService,
  type QcEvaluationInput,
} from "../services/verticalDramaQc";
import {
  planTieIn,
  approveTieIn,
  removeTieIn,
  canRunPaidGeneration,
  buildTieInProvenance,
  isDisclosureSeparateFromPrompt,
  type PlanTieInInput,
} from "../services/verticalDramaProductTieIn";
import { getModelById } from "../services/modelRegistry";
import type {
  VerticalDramaProductTieInConfig,
  VerticalDramaQcStage,
  VerticalDramaTieInUsage,
} from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Base procedures + ownership helpers                                         */
/* -------------------------------------------------------------------------- */

const baseProcedure = protectedProcedure.use(requireFeatureFlag("verticalDramaSeries"));
const providerProcedure = baseProcedure.use(requireFeatureFlag("verticalDramaSeriesProviderRouting"));
const qcProcedure = baseProcedure.use(requireFeatureFlag("verticalDramaSeriesQcRepair"));
const tieInProcedure = baseProcedure.use(requireFeatureFlag("verticalDramaSeriesProductTieIn"));

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

async function persistArtifact(
  owner: { tenantId: string; userId: number; seriesId: number; episodeId: number; runId: number },
  stage: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(verticalDramaRunArtifacts)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId: owner.runId,
      stage,
      jsonPayload: payload,
    })
    .returning({ id: verticalDramaRunArtifacts.id });
  return row.id;
}

/* -------------------------------------------------------------------------- */
/* Shared input schemas                                                        */
/* -------------------------------------------------------------------------- */

const ownerScopeSchema = z.object({
  seriesId: z.string().min(1),
  episodeId: z.string().min(1),
  runId: z.string().min(1),
});

const motionModeSchema = z.enum([
  "first_last_frame_bridge",
  "first_frame_to_video",
  "image_to_video",
  "text_to_video",
  "reference_to_video",
  "prompt_only",
]);

const tieInConfigSchema = z.object({
  enabled: z.boolean(),
  productName: z.string().max(256).optional(),
  productDescription: z.string().max(4000).optional(),
  referenceAssetIds: z.array(z.string().max(128)).max(50),
  productSource: z.enum(["manual", "marketplace", "library", "uploaded_reference"]).optional(),
  disclosurePolicy: z.enum(["not_required", "show_overlay_disclosure", "caption_disclosure", "manual_review"]),
  regulatedCategory: z.enum(["none", "health", "beauty", "finance", "medical", "baby_kids", "other"]).optional(),
  allowedStoryFunctions: z.array(
    z.enum(["memory_trigger", "relationship_token", "status_symbol", "daily_use", "plot_clue", "soft_cta"]),
  ),
  forbiddenClaims: z.array(z.string().max(512)).max(100),
  maxEpisodesWithTieInPerTenEpisodes: z.number().int().min(0).max(10),
  requireHumanApproval: z.boolean(),
});

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaProviderRouter = router({
  /**
   * List every enabled `type = "video"` model with capability metadata, alias
   * groups, supported motion modes, and tenant-policy annotations. The list is
   * NOT filtered — policy-blocked models stay visible, annotated with reasons.
   */
  resolveVideoModels: providerProcedure
    .input(z.object({ defaultModelId: z.string().max(128).optional() }).optional())
    .query(async ({ input }) => {
      const resolution = await resolveVideoModels({ defaultModelId: input?.defaultModelId });
      return resolution;
    }),

  /**
   * Plan provider routing for a video stage: resolve the model, derive the
   * capability matrix, apply gates, and return the normalized `VideoRoutingDecision`
   * (raw upstream status preserved alongside), the duration profile, the clip
   * jobs, an optional sub-shot plan, and a credit estimate. Nothing is rendered.
   */
  planProviderRouting: providerProcedure
    .input(
      ownerScopeSchema.extend({
        selectedVideoModelId: z.string().max(128).optional(),
        requestedMotionMode: motionModeSchema.optional(),
        containsHumanFace: z.boolean().optional(),
        requireFirstLastFrame: z.boolean().optional(),
        requireNativeAudio: z.boolean().optional(),
        aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
        prompt: z.string().max(8000).optional(),
        subShotsFlagOn: z.boolean().optional(),
        perSubShotStartFrames: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      const requestedId = input.selectedVideoModelId ?? VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL;
      const resolvedId = resolveVideoModelId(requestedId);
      const model = resolvedId ? getModelById(resolvedId) : undefined;
      if (!model) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `No enabled video model for "${requestedId}"` });
      }

      const plan = planProviderRouting({
        model,
        policy: VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
        requestedMotionMode: input.requestedMotionMode as VerticalDramaMotionMode | undefined,
        containsHumanFace: input.containsHumanFace,
        requireFirstLastFrame: input.requireFirstLastFrame,
        requireNativeAudio: input.requireNativeAudio,
        aspectRatio: input.aspectRatio,
        prompt: input.prompt,
        externalConfigured: Boolean(VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY.externalImageToVideo),
        subShots: input.subShotsFlagOn
          ? { flagOn: true, perSubShotStartFrames: input.perSubShotStartFrames }
          : undefined,
      });

      return { plan };
    }),

  /**
   * DRY-RUN SAFE provider job lifecycle. Routes + gates; only when `approved`
   * creates a DETERMINISTIC Mock provider job (never a paid call) and returns the
   * job (queued -> succeeded) plus the redacted download result. The real paid
   * runtime is injected by the conductor.
   */
  runProviderJob: providerProcedure
    .input(
      ownerScopeSchema.extend({
        selectedVideoModelId: z.string().max(128),
        prompt: z.string().max(8000).optional(),
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

      const resolvedId = resolveVideoModelId(input.selectedVideoModelId);
      const model = resolvedId ? getModelById(resolvedId) : undefined;
      if (!model) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `No enabled video model for "${input.selectedVideoModelId}"` });
      }

      const plan = planProviderRouting({
        model,
        policy: VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
        prompt: input.prompt,
      });

      // Routing gate: blocked / manual-review routing never creates a job.
      if (plan.decision.normalizedStatus === "blocked" || plan.decision.normalizedStatus === "manual_review_required") {
        return { plan, job: null, blocked: true };
      }

      // Approval gate: no job (even a mock one) until explicitly approved.
      if (input.approved !== true) {
        return { plan, job: null, blocked: false, requiresApproval: true };
      }

      // QC gate (spec §16): the routing-stage QC must pass before any paid job
      // is created. A blocking QC issue (non-9:16 output, provider
      // capability/policy violation, non-tenant-owned/stale asset) fails paid
      // generation CLOSED — we throw instead of creating the job.
      const routingQc = runQcForStage({
        stage: "provider_routing",
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        runId: input.runId,
        aspectRatio: "9:16",
        providerRouting: plan.decision,
      });
      if (!routingQc.passed && stageBlocksPaidGeneration(routingQc.issues)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `QC blocked paid generation at the provider-routing stage: ${routingQc.issues
            .filter((i) => i.severity === "blocking")
            .map((i) => i.message)
            .join("; ")}`,
        });
      }

      // Deterministic, key-free Mock lifecycle (dry-run safe).
      const adapter = selectVideoProviderAdapter(model, VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY, { forceMock: true });
      const lifecycle = new VerticalDramaProviderJobLifecycle(adapter);
      const created = await lifecycle.create({
        raw: {},
        normalized: {
          provider: model.provider,
          motionMode: plan.motionMode,
          prompt: input.prompt ?? "",
          durationSeconds: plan.clipJobs[0]?.durationSeconds ?? 8,
          aspectRatio: "9:16",
          generateAudio: false,
        },
      });
      const polled = await lifecycle.poll(created);
      const download = polled.status === "succeeded" ? await lifecycle.download(polled) : null;

      const artifactId = await persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        "video_clip_manifest",
        { kind: "provider_job", decision: plan.decision, job: polled, download },
      );

      return { plan, job: polled, download, blocked: false, artifactId: String(artifactId) };
    }),

  /**
   * Evaluate a QC stage and return the `VerticalDramaQcResult` (issues +
   * recommendedRepairs + passed + score), persist it, and surface the pre-filled,
   * reachable repair descriptors for the QC panel.
   */
  qcReport: qcProcedure
    .input(
      ownerScopeSchema.extend({
        stage: z.enum([
          "script",
          "character_visual",
          "storyboard",
          "start_frame_prompt",
          "start_frame_image",
          "video_prompt",
          "provider_routing",
          "video_clip",
          "assembly",
          "product_tie_in",
          "storyboard_review_handoff",
          "episode_memory_update",
        ]),
        evaluation: z.record(z.string(), z.unknown()).optional(),
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

      const evalInput: QcEvaluationInput = {
        ...(input.evaluation as Partial<QcEvaluationInput>),
        stage: input.stage as VerticalDramaQcStage,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        runId: input.runId,
      };
      const result = runQcForStage(evalInput);
      await verticalDramaQcService.persistReport(
        { tenantId, userId, seriesId, episodeId, runId },
        result,
      );

      const prefilledRepairs = result.recommendedRepairs.map((r) => buildPrefilledRepair(r));
      return {
        qc: result,
        prefilledRepairs,
        blocksPaidGeneration: result.issues.some((i) => i.severity === "blocking"),
      };
    }),

  /**
   * Wire a QC-recommended repair to its concrete per-target repair entry point.
   * Returns the reachable section + credit-confirmation requirement + the stages
   * made stale by the repair. This section owns the QC-side wiring, NOT the
   * downstream repair implementation (which lives in the target section).
   */
  repairFromQc: qcProcedure
    .input(
      ownerScopeSchema.extend({
        qcStage: z.enum([
          "script",
          "character_visual",
          "storyboard",
          "start_frame_prompt",
          "start_frame_image",
          "video_prompt",
          "provider_routing",
          "video_clip",
          "assembly",
          "product_tie_in",
          "storyboard_review_handoff",
          "episode_memory_update",
        ]),
        action: z.enum([
          "rewrite_script",
          "regenerate_character",
          "repair_storyboard_shot",
          "repair_start_frame_prompt",
          "regenerate_start_frame",
          "repair_motion_prompt",
          "reroute_provider",
          "regenerate_clip",
          "repair_sub_shot",
          "adjust_sub_shot_timing",
          "adjust_audio_subtitle",
          "remove_or_rewrite_tie_in",
          "repair_assembly",
        ]),
        instruction: z.string().min(1).max(8000),
        target: z
          .object({
            artifactId: z.string().max(128).optional(),
            shot: z.number().int().min(1).max(9).optional(),
            clip: z.number().int().min(1).max(999).optional(),
          })
          .optional(),
        creditConfirmed: z.boolean().optional(),
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

      const requiresCredit = repairRequiresCreditConfirmation(input.action);
      // Paid repair (re-generation) requires a credit-estimate confirmation.
      if (requiresCredit && input.creditConfirmed !== true) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This repair triggers paid re-generation and requires credit-estimate confirmation.",
        });
      }

      const targetSection = repairEntryPointSection(input.action);
      const staleStages = stagesMadeStaleByRepair(input.qcStage as VerticalDramaQcStage);

      const artifactId = await persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        "run_log",
        {
          kind: "qc_repair_dispatch",
          qcStage: input.qcStage,
          action: input.action,
          instruction: input.instruction,
          target: input.target ?? null,
          targetSection,
          requiresCreditConfirmation: requiresCredit,
          staleStages,
        },
      );

      return {
        dispatched: true,
        targetSection,
        requiresCreditConfirmation: requiresCredit,
        staleStages,
        artifactId: String(artifactId),
      };
    }),

  /**
   * Plan a product tie-in with all compliance guards (story function, regulated
   * claims, fatigue, disclosure separation, approval gate) and retained
   * provenance. Nothing is generated; disclosure text is stored SEPARATELY from
   * the prompt payload.
   */
  tieInPlan: tieInProcedure
    .input(
      ownerScopeSchema.extend({
        config: tieInConfigSchema,
        episodeNumber: z.number().int().min(1),
        shotNumbers: z.array(z.number().int().min(1).max(9)).max(9),
        storyFunction: z.string().max(2000),
        proposedClaims: z.array(z.string().max(512)).max(50).optional(),
        resolvesMainConflict: z.boolean().optional(),
        placementHistory: z
          .array(z.object({ episodeNumber: z.number().int(), hadTieIn: z.boolean() }))
          .max(200)
          .optional(),
        disclosureText: z.string().max(2000).optional(),
        hasApprovedProductReferences: z.boolean().optional(),
        placementNaturalnessScore: z.number().min(0).max(1).optional(),
        promptPayloadPreview: z.record(z.string(), z.unknown()).optional(),
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

      const planInput: PlanTieInInput = {
        config: input.config as VerticalDramaProductTieInConfig,
        episodeNumber: input.episodeNumber,
        shotNumbers: input.shotNumbers,
        storyFunction: input.storyFunction,
        proposedClaims: input.proposedClaims,
        resolvesMainConflict: input.resolvesMainConflict,
        placementHistory: input.placementHistory,
        disclosureText: input.disclosureText,
        hasApprovedProductReferences: input.hasApprovedProductReferences,
        placementNaturalnessScore: input.placementNaturalnessScore,
      };
      const result = planTieIn(planInput);

      // Guard: disclosure copy must never be present in the prompt payload.
      const disclosureSeparate = isDisclosureSeparateFromPrompt(
        input.promptPayloadPreview ?? {},
        input.disclosureText,
      );
      if (!disclosureSeparate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Disclosure text must be stored separately from the video prompt payload.",
        });
      }

      const provenance = buildTieInProvenance(
        input.config as VerticalDramaProductTieInConfig,
        result.usage,
      );
      const artifactId = await persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        "run_log",
        { kind: "tie_in_plan", usage: result.usage, provenance, warnings: result.warnings },
      );

      return {
        usage: result.usage,
        warnings: result.warnings,
        blocked: result.blocked,
        requiresHumanApproval: result.requiresHumanApproval,
        requiresRegulatedManualReview: result.requiresRegulatedManualReview,
        provenance,
        canRunPaidGeneration: canRunPaidGeneration(result, result.usage),
        artifactId: String(artifactId),
      };
    }),

  /**
   * Approve a planned tie-in (mandatory for MVP + beta; required before paid
   * generation). Records the approving user and audit-logs the product-approval
   * policy decision.
   */
  approveTieIn: tieInProcedure
    .input(
      ownerScopeSchema.extend({
        usage: z.record(z.string(), z.unknown()),
        config: tieInConfigSchema,
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

      const approved = approveTieIn(
        input.usage as unknown as VerticalDramaTieInUsage,
        String(userId),
      );
      const provenance = buildTieInProvenance(input.config as VerticalDramaProductTieInConfig, approved);
      const artifactId = await persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        "run_log",
        { kind: "tie_in_approved", usage: approved, provenance },
      );

      // Audit log the product-approval policy decision (spec §9.2 / §13).
      auditLogger.log({
        eventType: "rollout_gate",
        userId,
        tenantId,
        metadata: {
          action: "vertical_drama_tie_in_approved",
          seriesId: input.seriesId,
          episodeId: input.episodeId,
          runId: input.runId,
          approvedByUserId: String(userId),
          regulatedCategory: (input.config as VerticalDramaProductTieInConfig).regulatedCategory ?? "none",
        },
      });

      return { usage: approved, provenance, artifactId: String(artifactId) };
    }),

  /**
   * Remove a tie-in (removable + auditable). Returns an inert, unapproved usage
   * and audit-logs the removal.
   */
  removeTieIn: tieInProcedure
    .input(ownerScopeSchema.extend({ usage: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const runId = parseId(input.runId, "run id");
      await loadOwnedEpisode(tenantId, userId, seriesId, episodeId);
      await loadOwnedRun(tenantId, userId, seriesId, episodeId, runId);

      const removed = removeTieIn(input.usage as unknown as VerticalDramaTieInUsage);
      const artifactId = await persistArtifact(
        { tenantId, userId, seriesId, episodeId, runId },
        "run_log",
        { kind: "tie_in_removed", usage: removed },
      );

      auditLogger.log({
        eventType: "rollout_gate",
        userId,
        tenantId,
        metadata: {
          action: "vertical_drama_tie_in_removed",
          seriesId: input.seriesId,
          episodeId: input.episodeId,
          runId: input.runId,
        },
      });

      return { usage: removed, artifactId: String(artifactId) };
    }),
});

export type VerticalDramaProviderRouter = typeof verticalDramaProviderRouter;
