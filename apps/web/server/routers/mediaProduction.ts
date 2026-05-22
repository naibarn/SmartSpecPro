import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  mediaProductionApprovals,
  mediaProductionAssetPlans,
  mediaProductionGoalVersions,
  mediaProductionOutputProjections,
  mediaProductionPlanVerifications,
  mediaProductionPlanVersions,
  mediaProductionRuns,
  mediaStudioStoryboardReviews,
  videoEditorProjects,
} from "../../drizzle/schema";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  buildProductionOutputProjectionIdentity,
  buildProductionStableHash,
  evaluateProductionAssetPlanReadiness,
  validateProductionRunTransition,
  type ProductionAssetPlan,
  type ProductionRunStatus,
} from "../../shared/mediaProduction";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const productionGoalSchema = z.record(z.any());
const productionPayloadSchema = z.record(z.any());
const productionSurfaceSchema = z.enum(["storyboard_review", "video_edit"]);
const stringArraySchema = z.array(z.string().min(1).max(256)).default([]);

async function getExistingRun(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: string,
  userId: number,
  productionRunId: string,
) {
  const [run] = await db
    .select()
    .from(mediaProductionRuns)
    .where(and(
      eq(mediaProductionRuns.tenantId, tenantId),
      eq(mediaProductionRuns.userId, userId),
      eq(mediaProductionRuns.productionRunId, productionRunId),
    ))
    .limit(1);
  return run;
}

async function getNextVersion(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: typeof mediaProductionGoalVersions | typeof mediaProductionPlanVersions,
  tenantId: string,
  productionRunId: string,
): Promise<number> {
  const [latest] = await db
    .select({ version: table.version })
    .from(table)
    .where(and(
      eq(table.tenantId, tenantId),
      eq(table.productionRunId, productionRunId),
    ))
    .orderBy(desc(table.version))
    .limit(1);
  return Number(latest?.version ?? 0) + 1;
}

function buildProductionName(payload: Record<string, unknown>, fallback: string): string {
  const title = String(payload.title ?? payload.name ?? payload.productionTitle ?? "").trim();
  if (title) return title.slice(0, 256);
  const summary = String(payload.summary ?? payload.goalSummary ?? "").trim();
  if (summary) return summary.slice(0, 80);
  return fallback;
}

function extractProductionClips(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    payload.clips,
    payload.tasks,
    payload.prompt_sequence,
    payload.scene_timeline,
    payload.storyboard_outline,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item, index) => ({
        ...(item && typeof item === "object" ? item as Record<string, unknown> : { value: item }),
        id: String((item as any)?.id ?? (item as any)?.clip_id ?? (item as any)?.scene_id ?? `clip-${index + 1}`),
        index,
        order: Number((item as any)?.order ?? (item as any)?.index ?? index),
      }));
    }
  }
  return [];
}

export const mediaProductionRouter = router({
  listRuns: protectedProcedure
    .input(z.object({
      query: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }).default({ limit: 30 }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const rows = await db
        .select()
        .from(mediaProductionRuns)
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
        ))
        .orderBy(desc(mediaProductionRuns.updatedAt))
        .limit(Math.min(Math.max(input.limit * 3, input.limit), 100));

      const query = String(input.query ?? "").trim().toLowerCase();
      const mapped = rows.map((run) => {
        const goal = (run.goal && typeof run.goal === "object") ? run.goal as Record<string, any> : {};
        const tabSnapshots = (goal.tabSnapshots && typeof goal.tabSnapshots === "object")
          ? goal.tabSnapshots as Record<string, any>
          : {};
        const generatedMedia = Array.isArray(tabSnapshots.generatedMedia) ? tabSnapshots.generatedMedia : [];
        const mediaPreview = generatedMedia.find((item: any) =>
          item?.url && (item?.type === "image" || item?.type === "video")
        );
        const planClips = extractProductionClips(run.productionBible ?? {});
        const planPreview = planClips.find((clip: any) => clip?.thumbnailUrl || clip?.url);
        const title = String(
          goal.title
          ?? goal.projectTitle
          ?? goal.summary
          ?? run.productionRunId,
        ).trim();
        const summary = String(goal.summary ?? goal.goalSummary ?? "").trim();
        return {
          productionRunId: run.productionRunId,
          title,
          summary,
          status: run.status,
          goalVersion: run.goalVersion,
          planVersion: run.planVersion,
          thumbnailUrl: String(mediaPreview?.thumbnailUrl ?? mediaPreview?.url ?? (planPreview as any)?.thumbnailUrl ?? (planPreview as any)?.url ?? "").trim() || null,
          updatedAt: run.updatedAt,
          createdAt: run.createdAt,
          platform: String(goal.platform ?? "").trim() || null,
          audience: String(goal.audience ?? "").trim() || null,
        };
      });

      return {
        runs: mapped
          .filter((run) => !query || [
            run.productionRunId,
            run.title,
            run.summary,
            run.status,
            run.platform ?? "",
            run.audience ?? "",
          ].join(" ").toLowerCase().includes(query))
          .slice(0, input.limit),
      };
    }),

  getRun: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) return null;

      const [latestPlan] = await db
        .select()
        .from(mediaProductionPlanVersions)
        .where(and(
          eq(mediaProductionPlanVersions.tenantId, tenantId),
          eq(mediaProductionPlanVersions.productionRunId, input.productionRunId),
        ))
        .orderBy(desc(mediaProductionPlanVersions.version))
        .limit(1);
      const [latestVerification] = latestPlan
        ? await db
          .select()
          .from(mediaProductionPlanVerifications)
          .where(and(
            eq(mediaProductionPlanVerifications.tenantId, tenantId),
            eq(mediaProductionPlanVerifications.productionRunId, input.productionRunId),
            eq(mediaProductionPlanVerifications.planVersion, latestPlan.version),
          ))
          .orderBy(desc(mediaProductionPlanVerifications.createdAt))
          .limit(1)
        : [];
      const [latestApproval] = latestPlan
        ? await db
          .select()
          .from(mediaProductionApprovals)
          .where(and(
            eq(mediaProductionApprovals.tenantId, tenantId),
            eq(mediaProductionApprovals.productionRunId, input.productionRunId),
            eq(mediaProductionApprovals.planVersion, latestPlan.version),
          ))
          .orderBy(desc(mediaProductionApprovals.createdAt))
          .limit(1)
        : [];

      return { run, latestPlan, latestVerification, latestApproval };
    }),

  saveRun: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      status: z.string().min(1).max(40).default("goal_ready"),
      goal: productionGoalSchema,
      productionBible: productionPayloadSchema.default({}),
      assetPlan: productionPayloadSchema.default({}),
      qualityGateSummary: productionPayloadSchema.default({}),
      budgetSummary: productionPayloadSchema.default({}),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const now = new Date();
      const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (existing) {
        const transition = validateProductionRunTransition(
          existing.status as ProductionRunStatus,
          input.status as ProductionRunStatus,
        );
        if (!transition.ok) {
          throw new TRPCError({
            code: "CONFLICT",
            message: transition.reasonCode ?? "Invalid production state transition",
          });
        }
      }

      const [saved] = await db
        .insert(mediaProductionRuns)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          status: input.status,
          goal: input.goal,
          productionBible: input.productionBible,
          assetPlan: input.assetPlan,
          qualityGateSummary: input.qualityGateSummary,
          budgetSummary: input.budgetSummary,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionRuns.tenantId, mediaProductionRuns.productionRunId],
          set: {
            status: input.status,
            goal: input.goal,
            productionBible: input.productionBible,
            assetPlan: input.assetPlan,
            qualityGateSummary: input.qualityGateSummary,
            budgetSummary: input.budgetSummary,
            contractVersion: input.contractVersion,
            updatedAt: now,
          },
        })
        .returning();

      return saved;
    }),

  saveGoalVersion: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      goal: productionGoalSchema,
      changedFields: stringArraySchema,
      status: z.string().min(1).max(40).default("goal_ready"),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const now = new Date();
      const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      let nextRunStatus = input.status as ProductionRunStatus;
      if (existing) {
        const transition = validateProductionRunTransition(
          existing.status as ProductionRunStatus,
          nextRunStatus,
        );
        if (!transition.ok) {
          const isGoalOnlySave = nextRunStatus === "goal_draft" || nextRunStatus === "goal_ready";
          if (isGoalOnlySave) {
            nextRunStatus = existing.status as ProductionRunStatus;
          } else {
            throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
          }
        }
      }
      const version = await getNextVersion(db, mediaProductionGoalVersions, tenantId, input.productionRunId);
      const inputHash = buildProductionStableHash(input.goal);
      const [goalVersion] = await db
        .insert(mediaProductionGoalVersions)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          version,
          goal: input.goal,
          changedFields: input.changedFields,
          inputHash,
          status: "active",
          contractVersion: input.contractVersion,
          createdAt: now,
        })
        .returning();

      await db
        .insert(mediaProductionRuns)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          status: nextRunStatus,
          goalVersion: version,
          planVersion: existing?.planVersion ?? 0,
          goal: input.goal,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionRuns.tenantId, mediaProductionRuns.productionRunId],
          set: {
            status: nextRunStatus,
            goalVersion: version,
            goal: input.goal,
            contractVersion: input.contractVersion,
            updatedAt: now,
          },
        });

      return goalVersion;
    }),

  savePlanVersion: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      goalVersion: z.number().int().positive().default(1),
      plan: productionPayloadSchema,
      plannerSkillId: z.string().min(1).max(128).default("media-production-storyboard-planner"),
      plannerSkillVersion: z.string().max(32).optional(),
      status: z.string().min(1).max(40).default("plan_ready_for_review"),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      const transition = validateProductionRunTransition(
        run.status as ProductionRunStatus,
        input.status as ProductionRunStatus,
      );
      const canUseImplicitPlanningStep =
        !transition.ok
        && validateProductionRunTransition(run.status as ProductionRunStatus, "plan_generating").ok
        && validateProductionRunTransition("plan_generating", input.status as ProductionRunStatus).ok;
      if (!transition.ok && !canUseImplicitPlanningStep) {
        throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
      }
      const now = new Date();
      const version = await getNextVersion(db, mediaProductionPlanVersions, tenantId, input.productionRunId);
      const [planVersion] = await db
        .insert(mediaProductionPlanVersions)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          goalVersion: input.goalVersion,
          version,
          plannerSkillId: input.plannerSkillId,
          plannerSkillVersion: input.plannerSkillVersion,
          plan: input.plan,
          inputHash: buildProductionStableHash({ goal: run.goal, goalVersion: input.goalVersion }),
          outputHash: buildProductionStableHash(input.plan),
          status: "ready_for_review",
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const assetRequirements = (input.plan.asset_requirements ?? input.plan.assetRequirements ?? {}) as Record<string, any>;
      const nodes = Array.isArray(assetRequirements.nodes)
        ? assetRequirements.nodes
        : Array.isArray(input.plan.asset_requirements)
          ? input.plan.asset_requirements
          : [];
      const assetPlan: ProductionAssetPlan = {
        assetPlanId: `${input.productionRunId}:plan:${version}`,
        productionRunId: input.productionRunId,
        nodes: nodes.map((node: any, index: number) => ({
          id: String(node.id ?? node.asset_id ?? `asset-${index + 1}`),
          kind: String(node.kind ?? node.type ?? "reference"),
          role: String(node.role ?? node.name ?? `Asset ${index + 1}`),
          required: node.required !== false,
          status: String(node.status ?? "planned") as ProductionAssetPlan["nodes"][number]["status"],
          providerCandidates: Array.isArray(node.providerCandidates) ? node.providerCandidates : undefined,
          estimatedCredits: Number(node.estimatedCredits ?? node.credits ?? 0),
          qualityIssues: Array.isArray(node.qualityIssues) ? node.qualityIssues : undefined,
        })),
        contractVersion: input.contractVersion,
      };
      const readiness = evaluateProductionAssetPlanReadiness(assetPlan);
      await db
        .insert(mediaProductionAssetPlans)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: version,
          assetPlan: assetPlan as any,
          readiness: readiness as any,
          status: readiness.status,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionAssetPlans.tenantId, mediaProductionAssetPlans.productionRunId, mediaProductionAssetPlans.planVersion],
          set: {
            assetPlan: assetPlan as any,
            readiness: readiness as any,
            status: readiness.status,
            updatedAt: now,
          },
        });

      await db
        .update(mediaProductionRuns)
        .set({
          status: input.status,
          planVersion: version,
          productionBible: (input.plan.production_bible ?? input.plan.productionBible ?? {}) as any,
          assetPlan: assetPlan as any,
          budgetSummary: (input.plan.credit_and_time_estimate ?? input.plan.budgetSummary ?? {}) as any,
          updatedAt: now,
        })
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
          eq(mediaProductionRuns.productionRunId, input.productionRunId),
        ));

      return { planVersion, assetPlan, readiness };
    }),

  savePlanVerification: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      planVersion: z.number().int().positive(),
      verification: productionPayloadSchema,
      verifierSkillId: z.string().min(1).max(128).default("media-production-plan-verifier"),
      verifierSkillVersion: z.string().max(32).optional(),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      const verdict = String(input.verification.verdict ?? input.verification.status ?? "human_review").toLowerCase();
      const score = Math.max(0, Math.min(100, Number(input.verification.score ?? input.verification.approval_score ?? 0) || 0));
      const blockingIssues = Array.isArray(input.verification.blocking_issues)
        ? input.verification.blocking_issues
        : Array.isArray(input.verification.blockingIssues)
          ? input.verification.blockingIssues
          : [];
      const warnings = Array.isArray(input.verification.warnings) ? input.verification.warnings : [];
      const missingDecisions = Array.isArray(input.verification.missing_decisions)
        ? input.verification.missing_decisions
        : Array.isArray(input.verification.missingDecisions)
          ? input.verification.missingDecisions
          : [];
      const recommendedRevisions = Array.isArray(input.verification.recommended_revisions)
        ? input.verification.recommended_revisions
        : Array.isArray(input.verification.recommendedRevisions)
          ? input.verification.recommendedRevisions
          : [];
      const nextStatus: ProductionRunStatus =
        verdict === "pass" || verdict === "warning"
          ? "plan_ready_for_review"
          : verdict === "revise"
            ? "plan_needs_revision"
            : verdict === "block"
              ? "plan_verification_failed"
              : "human_review_required";
      const transition = validateProductionRunTransition(run.status as ProductionRunStatus, "plan_verifying");
      if (transition.ok && run.status !== "plan_verifying") {
        await db
          .update(mediaProductionRuns)
          .set({ status: "plan_verifying", updatedAt: new Date() })
          .where(and(
            eq(mediaProductionRuns.tenantId, tenantId),
            eq(mediaProductionRuns.userId, ctx.user.id),
            eq(mediaProductionRuns.productionRunId, input.productionRunId),
          ));
      }
      const now = new Date();
      const [verification] = await db
        .insert(mediaProductionPlanVerifications)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: input.planVersion,
          verifierSkillId: input.verifierSkillId,
          verifierSkillVersion: input.verifierSkillVersion,
          verdict,
          score,
          verification: input.verification,
          blockingIssues,
          warnings,
          missingDecisions: missingDecisions.map(String),
          recommendedRevisions,
          status: "active",
          contractVersion: input.contractVersion,
          createdAt: now,
        })
        .returning();
      const latestRun = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      const finalTransition = validateProductionRunTransition(latestRun?.status as ProductionRunStatus, nextStatus);
      if (finalTransition.ok) {
        await db
          .update(mediaProductionRuns)
          .set({
            status: nextStatus,
            qualityGateSummary: input.verification,
            updatedAt: now,
          })
          .where(and(
            eq(mediaProductionRuns.tenantId, tenantId),
            eq(mediaProductionRuns.userId, ctx.user.id),
            eq(mediaProductionRuns.productionRunId, input.productionRunId),
          ));
      }
      return verification;
    }),

  approvePlan: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      planVersion: z.number().int().positive(),
      acceptedWarnings: stringArraySchema,
      lockedTargets: stringArraySchema,
      notes: z.string().max(2000).optional(),
      policySnapshot: productionPayloadSchema.default({}),
      budgetSnapshot: productionPayloadSchema.default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      if (run.status !== "plan_approved") {
        const transition = validateProductionRunTransition(run.status as ProductionRunStatus, "plan_approved");
        if (!transition.ok) {
          throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
        }
      }
      const [approval] = await db
        .insert(mediaProductionApprovals)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: input.planVersion,
          approvalType: "plan",
          status: "approved",
          acceptedWarnings: input.acceptedWarnings,
          lockedTargets: input.lockedTargets,
          notes: input.notes,
          policySnapshot: input.policySnapshot,
          budgetSnapshot: input.budgetSnapshot,
          createdAt: new Date(),
        })
        .returning();
      await db
        .update(mediaProductionRuns)
        .set({ status: "plan_approved", updatedAt: new Date() })
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
          eq(mediaProductionRuns.productionRunId, input.productionRunId),
        ));
      return approval;
    }),

  projectOutput: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      surface: productionSurfaceSchema,
      output: productionPayloadSchema,
      name: z.string().min(1).max(256).optional(),
      storyboardRunId: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });

      const clips = extractProductionClips(input.output);
      const name = input.name ?? buildProductionName(input.output, input.surface === "storyboard_review" ? "Production Storyboard Review" : "Production Video Edit");
      const now = new Date();
      const identity = buildProductionOutputProjectionIdentity({
        tenantId,
        productionRunId: input.productionRunId,
        surface: input.surface,
        sourceOutput: input.output,
      });
      const [existingProjection] = await db
        .select()
        .from(mediaProductionOutputProjections)
        .where(and(
          eq(mediaProductionOutputProjections.tenantId, tenantId),
          eq(mediaProductionOutputProjections.productionRunId, input.productionRunId),
          eq(mediaProductionOutputProjections.surface, input.surface),
          eq(mediaProductionOutputProjections.sourceOutputHash, identity.sourceOutputHash),
        ))
        .limit(1);
      if (existingProjection?.surfaceRecordId) {
        return {
          projection: existingProjection,
          surfaceRecordId: existingProjection.surfaceRecordId,
          surface: input.surface,
          reused: true,
        };
      }
      let surfaceRecordId: string;

      if (input.surface === "storyboard_review") {
        const reviewData = {
          productionRunId: input.productionRunId,
          sourceSurface: "media_production",
          storyBible: run.productionBible,
          qualityGateSummary: run.qualityGateSummary,
          tasks: clips,
          output: input.output,
          updatedAt: Date.now(),
        };
        const [inserted] = await db
          .insert(mediaStudioStoryboardReviews)
          .values({
            userId: ctx.user.id,
            name,
            reviewData,
            clipCount: clips.length,
            completedClipCount: clips.filter((clip) => String(clip.status ?? "").toLowerCase() === "completed" || Boolean(clip.url)).length,
            thumbnailUrl: String((clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.thumbnailUrl ?? (clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.url ?? "") || undefined,
            status: "active",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: mediaStudioStoryboardReviews.id });
        surfaceRecordId = String(inserted.id);
      } else {
        const projectData = {
          productionRunId: input.productionRunId,
          sourceSurface: "media_production",
          storyBible: run.productionBible,
          qualityGateSummary: run.qualityGateSummary,
          clips,
          output: input.output,
          updatedAt: Date.now(),
        };
        const [inserted] = await db
          .insert(videoEditorProjects)
          .values({
            userId: ctx.user.id,
            name,
            projectData,
            thumbnailUrl: String((clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.thumbnailUrl ?? (clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.url ?? "") || undefined,
            duration: String(input.output.durationSeconds ?? input.output.duration ?? ""),
            resolution: String(input.output.resolution ?? ""),
            trackCount: 1,
            clipCount: clips.length,
            isAutoSave: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: videoEditorProjects.id });
        surfaceRecordId = String(inserted.id);
      }

      const [projection] = await db
        .insert(mediaProductionOutputProjections)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          storyboardRunId: input.storyboardRunId,
          surface: input.surface,
          surfaceRecordId,
          sourceOutputHash: identity.sourceOutputHash,
          metadata: {
            idempotencyKey: identity.idempotencyKey,
            clipCount: clips.length,
          },
          status: "active",
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            mediaProductionOutputProjections.tenantId,
            mediaProductionOutputProjections.productionRunId,
            mediaProductionOutputProjections.surface,
            mediaProductionOutputProjections.sourceOutputHash,
          ],
          set: {
            surfaceRecordId,
            metadata: {
              idempotencyKey: identity.idempotencyKey,
              clipCount: clips.length,
            },
            status: "active",
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      return {
        projection,
        surfaceRecordId,
        surface: input.surface,
      };
    }),
});
