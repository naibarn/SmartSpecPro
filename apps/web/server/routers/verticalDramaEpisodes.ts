/**
 * Vertical Drama Series — episode pipeline + memory router (spec feature 131, §04).
 *
 * Protected, feature-flag-gated (`verticalDramaSeries`, fail-closed), and scoped
 * to the caller's tenant + user on every read and mutation. Every mutation
 * accepts an idempotency key so a retried request does not duplicate state.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaRunArtifacts,
} from "../../drizzle/schema";
import {
  getTenantFeatureFlags,
} from "../services/tenantFeatureFlagService";
import { VERTICAL_DRAMA_MEMORY_KINDS } from "@shared/verticalDramaSeries";
import type {
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaSubShotPolicy,
} from "@shared/verticalDramaSeries";
import { VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT } from "@shared/verticalDramaSeries";
import {
  verticalDramaEpisodePipeline,
  VerticalDramaEpisodePipeline,
  VERTICAL_DRAMA_PIPELINE_STAGES,
  VERTICAL_DRAMA_RUNNER_MODES,
  type EpisodeRunOwner,
} from "../services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../services/verticalDramaProviderRouting";
import {
  verticalDramaSeriesMemoryService,
  memoryRowToEvent,
} from "../services/verticalDramaSeriesMemory";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                         */
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

function parseId(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/**
 * Runner modes that never route paid provider work — they use the bundled,
 * dry-run-safe stub pipeline singleton (renders nothing, spends nothing).
 */
const VERTICAL_DRAMA_DRY_RUN_MODES: ReadonlySet<string> = new Set(["dry_run", "plan_only"]);

/**
 * Pick the pipeline for a run mode. Dry-run / plan-only stay on the stub
 * singleton (section-04 default). Modes that can route real provider work wire
 * in the section-08 provider routing port (`createVerticalDramaProviderRoutingPort`),
 * which routes + gates paid stages (and stays dry-run-safe by default — it never
 * calls a paid API, so this is behavior-preserving for tests/dry runs).
 */
function pipelineForMode(mode: string): VerticalDramaEpisodePipeline {
  if (VERTICAL_DRAMA_DRY_RUN_MODES.has(mode)) return verticalDramaEpisodePipeline;
  return new VerticalDramaEpisodePipeline(createVerticalDramaProviderRoutingPort());
}

/** Confirm the caller owns the series (tenant + user), else NOT_FOUND. */
async function assertSeriesOwned(tenantId: string, userId: number, seriesId: number) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
}

/** Load an episode the caller owns (tenant + user + series), else NOT_FOUND. */
async function loadOwnedEpisode(owner: EpisodeRunOwner) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
  return row;
}

/** Resolve the effective sub-shot policy for a tenant (flag-gated, fail-closed). */
async function resolveSubShotPolicy(
  tenantId: string,
  override?: Partial<VerticalDramaSubShotPolicy>,
): Promise<{ flagOn: boolean; policy: VerticalDramaSubShotPolicy }> {
  const flags = await getTenantFeatureFlags(tenantId);
  const flagOn = flags.verticalDramaSeriesSubShots === true;
  const policy: VerticalDramaSubShotPolicy = {
    ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    ...(override ?? {}),
    enabled: flagOn && (override?.enabled ?? true),
  };
  return { flagOn, policy };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const idempotencyKey = z.string().trim().min(1).max(128).optional();
const stageEnum = z.enum(
  VERTICAL_DRAMA_PIPELINE_STAGES as unknown as [VerticalDramaPipelineStage, ...VerticalDramaPipelineStage[]],
);
const runModeEnum = z.enum(
  VERTICAL_DRAMA_RUNNER_MODES as unknown as [string, ...string[]],
);

const subShotPolicyInput = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(["auto", "fixed"]).optional(),
    targetPerShot: z.number().int().min(1).max(5).optional(),
    maxPerShot: z.number().int().min(1).max(5).optional(),
    minSubShotSeconds: z.number().positive().max(30).optional(),
  })
  .optional();

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaEpisodesRouter = router({
  /**
   * Create an episode, assigning the next episode number safely. The unique
   * index (tenant, series, episodeNumber) prevents concurrent duplicates; the
   * idempotency key returns the same episode on retry.
   */
  createEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        title: z.string().trim().max(255).optional(),
        targetDurationSeconds: z.number().int().positive().max(3600).optional(),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Idempotent retry: a persistent receipt in the (otherwise-null-at-create)
      // `script` jsonb survives replays, so a repeated request returns the same
      // episode instead of assigning a new number.
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              sql`${verticalDramaEpisodes.script}->>'_idempotencyReceipt' = ${input.idempotencyKey}`,
            ),
          )
          .limit(1);
        if (existing) return { episode: { ...existing, id: String(existing.id) } };
      }

      const scriptReceipt = input.idempotencyKey
        ? { _idempotencyReceipt: input.idempotencyKey }
        : null;

      // Retry the safe max+1 assignment against the unique index on collision so
      // concurrent creators never duplicate the same episode number (spec Tests).
      for (let attempt = 0; attempt < 5; attempt++) {
        const [agg] = await db
          .select({
            maxEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
          })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          );
        const nextNumber = Number(agg?.maxEpisodeNumber ?? 0) + 1;
        try {
          const [row] = await db
            .insert(verticalDramaEpisodes)
            .values({
              tenantId,
              userId,
              seriesId,
              episodeNumber: nextNumber,
              title: input.title ?? null,
              status: "draft",
              targetDurationSeconds: input.targetDurationSeconds ?? 60,
              script: scriptReceipt,
            })
            .returning();
          return { episode: { ...row, id: String(row.id) } };
        } catch (err) {
          // Unique-violation on the episode number → someone raced us; retry.
          if (attempt === 4) throw err;
        }
      }
      throw new TRPCError({ code: "CONFLICT", message: "Could not assign episode number" });
    }),

  /**
   * Patch an owned episode's draft plan JSONB fields (script, storyboard, etc.)
   * and/or its title. Ownership-scoped (NOT_FOUND on a cross-tenant/user id).
   * Only supplied fields are written; this never triggers paid generation.
   */
  updateEpisodeDraft: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        title: z.string().trim().max(255).nullable().optional(),
        script: z.record(z.string(), z.unknown()).nullable().optional(),
        storyboard: z.record(z.string(), z.unknown()).nullable().optional(),
        startFramePlan: z.record(z.string(), z.unknown()).nullable().optional(),
        dialogueAudioPlan: z.record(z.string(), z.unknown()).nullable().optional(),
        motionPromptPack: z.record(z.string(), z.unknown()).nullable().optional(),
        assemblyManifest: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      // Confirm ownership (throws NOT_FOUND otherwise).
      await loadOwnedEpisode(owner);

      const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.script !== undefined) updates.script = input.script;
      if (input.storyboard !== undefined) updates.storyboard = input.storyboard;
      if (input.startFramePlan !== undefined) updates.startFramePlan = input.startFramePlan;
      if (input.dialogueAudioPlan !== undefined) updates.dialogueAudioPlan = input.dialogueAudioPlan;
      if (input.motionPromptPack !== undefined) updates.motionPromptPack = input.motionPromptPack;
      if (input.assemblyManifest !== undefined) updates.assemblyManifest = input.assemblyManifest;

      const [row] = await db
        .update(verticalDramaEpisodes)
        .set(updates)
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.tenantId, owner.tenantId),
            eq(verticalDramaEpisodes.userId, owner.userId),
            eq(verticalDramaEpisodes.seriesId, owner.seriesId),
          ),
        )
        .returning();

      return { episode: { ...row, id: String(row.id) } };
    }),

  /**
   * List an episode's approval checkpoints (read-only), newest first, optionally
   * filtered by state. The workspace approval bar resolves the pending
   * checkpoint id for a stage from this. Ownership-scoped.
   */
  listCheckpoints: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        state: z.enum(["pending", "approved", "rejected", "repaired"]).optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);

      const conditions = [
        eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
        eq(verticalDramaApprovalCheckpoints.userId, owner.userId),
        eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
        eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
      ];
      if (input.state) {
        conditions.push(eq(verticalDramaApprovalCheckpoints.state, input.state));
      }

      const rows = await db
        .select()
        .from(verticalDramaApprovalCheckpoints)
        .where(and(...conditions))
        .orderBy(desc(verticalDramaApprovalCheckpoints.updatedAt), desc(verticalDramaApprovalCheckpoints.id))
        .limit(input.limit ?? 200);

      return {
        checkpoints: rows.map((r: (typeof rows)[number]) => ({
          checkpointId: String(r.id),
          runId: String(r.runId),
          stage: r.stage,
          state: r.state,
          sourceArtifactIds: (r.sourceArtifactIds as string[] | null) ?? [],
          notes: r.notes,
          updatedAt: r.updatedAt,
        })),
      };
    }),

  /** Run a single pipeline stage (dry-run capable). */
  runStage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        mode: runModeEnum.default("dry_run"),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(tenantId, input.subShotPolicy);
      const outcome = await pipelineForMode(input.mode).runStage(owner, input.stage, {
        mode: input.mode as never,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
      });
      return outcome;
    }),

  /** Run stages sequentially until a gate (approval / failure / end). */
  runEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: runModeEnum.default("dry_run"),
        fromStage: stageEnum.optional(),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(tenantId, input.subShotPolicy);
      return pipelineForMode(input.mode).runEpisode(owner, {
        mode: input.mode as never,
        fromStage: input.fromStage,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
      });
    }),

  /**
   * Approve a stage's checkpoint. Approving never mutates the source artifact —
   * it only records the approval and unblocks the paid/next stage.
   */
  approveCheckpoint: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        checkpointId: z.string().min(1),
        decision: z.enum(["approve", "reject"]).default("approve"),
        notes: z.string().max(2000).optional(),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const checkpointId = parseId(input.checkpointId, "checkpoint id");

      const [checkpoint] = await db
        .select()
        .from(verticalDramaApprovalCheckpoints)
        .where(
          and(
            eq(verticalDramaApprovalCheckpoints.id, checkpointId),
            eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
            eq(verticalDramaApprovalCheckpoints.userId, userId),
            eq(verticalDramaApprovalCheckpoints.seriesId, seriesId),
            eq(verticalDramaApprovalCheckpoints.episodeId, episodeId),
          ),
        )
        .limit(1);
      if (!checkpoint) throw new TRPCError({ code: "NOT_FOUND", message: "Checkpoint not found" });

      // Idempotent: a terminal checkpoint returns as-is.
      if (checkpoint.state === "approved" || checkpoint.state === "rejected") {
        return { checkpoint: { ...checkpoint, id: String(checkpoint.id) } };
      }

      const approving = input.decision === "approve";
      const [row] = await db
        .update(verticalDramaApprovalCheckpoints)
        .set({
          state: approving ? "approved" : "rejected",
          approvedByUserId: approving ? userId : null,
          rejectedByUserId: approving ? null : userId,
          notes: input.notes ?? checkpoint.notes,
          updatedAt: new Date(),
        })
        .where(eq(verticalDramaApprovalCheckpoints.id, checkpoint.id))
        .returning();

      // Memory-update checkpoint (stage `summarize_episode_to_series_memory`,
      // the 12th/last approval checkpoint): the episode summary is held PENDING
      // and never auto-applied by the pipeline. It is written into durable series
      // memory only on THIS explicit approval — append a `episode_summary` memory
      // event via the append-only memory service. This runs only on the first
      // approval transition (a terminal checkpoint short-circuits above).
      if (approving && checkpoint.stage === "summarize_episode_to_series_memory") {
        // Resolve the episode number + the pending summary from the source
        // artifact under review so the memory event carries the real summary.
        const [episode] = await db
          .select({ episodeNumber: verticalDramaEpisodes.episodeNumber })
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
        const episodeNumber = episode?.episodeNumber;

        const sourceArtifactIds = (checkpoint.sourceArtifactIds as string[] | null) ?? [];
        let summaryText = episodeNumber != null
          ? `Episode ${episodeNumber} summarized to series memory`
          : "Episode summarized to series memory";
        if (sourceArtifactIds.length > 0) {
          const artifactId = Number(sourceArtifactIds[0]);
          if (Number.isFinite(artifactId)) {
            const [artifact] = await db
              .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
              .from(verticalDramaRunArtifacts)
              .where(
                and(
                  eq(verticalDramaRunArtifacts.id, artifactId),
                  eq(verticalDramaRunArtifacts.tenantId, tenantId),
                  eq(verticalDramaRunArtifacts.seriesId, seriesId),
                  eq(verticalDramaRunArtifacts.episodeId, episodeId),
                ),
              )
              .limit(1);
            const payload = artifact?.jsonPayload as Record<string, unknown> | undefined;
            if (payload?.summary) summaryText = String(payload.summary);
          }
        }

        await verticalDramaSeriesMemoryService.appendEvent({
          tenantId,
          userId,
          seriesId,
          episodeId,
          runId: checkpoint.runId,
          memoryKind: "episode_summary",
          payload: {
            episodeNumber,
            summary: summaryText,
            approvedFromCheckpointId: String(checkpoint.id),
          },
          summaryText,
          approved: true,
          approvedByUserId: userId,
          // Idempotent: a replayed approval never double-writes the summary.
          idempotencyKey: `vd-episode-summary-checkpoint-${checkpoint.id}`,
        });
      }

      return { checkpoint: { ...row, id: String(row.id) } };
    }),

  /**
   * Repair a stage output: creates a new artifact/version that supersedes the
   * prior candidate (never overwrites it) and marks downstream stages stale.
   */
  repairStageOutput: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        artifactId: z.string().optional(),
        target: z
          .object({
            parentShotNumber: z.number().int().positive().optional(),
            subShotNumber: z.number().int().positive().optional(),
            clipNumber: z.number().int().positive().optional(),
          })
          .optional(),
        instruction: z.string().trim().min(1).max(4000),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(tenantId, input.subShotPolicy);
      const outcome = await verticalDramaEpisodePipeline.repairStage(owner, input.stage, {
        sourceArtifactId: input.artifactId,
        target: input.target,
        instruction: input.instruction,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
      });
      return outcome;
    }),

  /** Per-episode run history, most recent first (read-only). */
  listEpisodeRuns: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const rows = await verticalDramaEpisodePipeline.listEpisodeRuns(owner, input.limit ?? 200);
      return {
        runs: rows.map((r: (typeof rows)[number]) => ({
          runId: String(r.id),
          stage: r.stage,
          status: r.status,
          mode: r.runMode,
          nextAction: r.nextAction,
          artifactIds: (r.artifactIds as string[] | null) ?? [],
          startedAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.status === "succeeded" || r.status === "failed" ? r.updatedAt : null,
          // Link target to the read-only artifact-ledger detail (section 09).
          artifactLedgerHref: `/dashboard/vertical-drama/${owner.seriesId}/episodes/${owner.episodeId}/runs/${r.id}`,
        })),
      };
    }),

  /**
   * Append-only memory events for a series, chronological, filterable by kind
   * (including `retcon_proposal`) and/or episode number (read-only timeline).
   */
  listMemoryEvents: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        kind: z.enum(VERTICAL_DRAMA_MEMORY_KINDS as unknown as [VerticalDramaMemoryKind, ...VerticalDramaMemoryKind[]]).optional(),
        episodeNumber: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Resolve episodeNumber → episodeId (scoped to the owned series).
      let episodeId: number | undefined;
      if (input.episodeNumber != null) {
        const [ep] = await db
          .select({ id: verticalDramaEpisodes.id })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              eq(verticalDramaEpisodes.episodeNumber, input.episodeNumber),
            ),
          )
          .limit(1);
        episodeId = ep?.id;
        if (episodeId == null) return { events: [] };
      }

      const events = await verticalDramaSeriesMemoryService.listEvents({
        tenantId,
        userId,
        seriesId,
        kind: input.kind,
        episodeId,
        limit: input.limit ?? 500,
      });
      return { events };
    }),

  /**
   * Approve a `retcon_proposal`: appends a NEW superseding memory event, never
   * mutating prior events (append-only chain preserved).
   */
  approveRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event = await verticalDramaSeriesMemoryService.approveRetconProposal({
        tenantId,
        userId,
        seriesId,
        proposalEventId: parseId(input.proposalEventId, "proposal event id"),
        actingUserId: userId,
        idempotencyKey: input.idempotencyKey,
      });
      return { event };
    }),

  /**
   * Reject a `retcon_proposal`: appends a rejection event, never mutating prior
   * events.
   */
  rejectRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event = await verticalDramaSeriesMemoryService.rejectRetconProposal({
        tenantId,
        userId,
        seriesId,
        proposalEventId: parseId(input.proposalEventId, "proposal event id"),
        actingUserId: userId,
        idempotencyKey: input.idempotencyKey,
      });
      return { event };
    }),
});

export type VerticalDramaEpisodesRouter = typeof verticalDramaEpisodesRouter;

// Re-export for symmetry with the memory row mapper used by callers/tests.
export { memoryRowToEvent };
