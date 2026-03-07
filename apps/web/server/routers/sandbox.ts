/**
 * tRPC sandbox router -- exposes sandbox operations to the frontend.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { db } from "../db";
import {
  sandboxJobs,
  sandboxProfiles,
} from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
import { checkTenantPolicy, resolveProfile } from "../services/sandbox/policyResolver";
import { projectStatus, type SandboxInternalStatus } from "../services/sandbox/statusProjection";
import { estimateCost, reserveCredits, refundReservedCredits } from "../services/sandbox/costEstimator";
import { getArtifactUrl, getJobArtifactUrls } from "../services/sandbox/artifactAccess";
import { internalFetch } from "../services/sandbox/dispatchService";

type SandboxJobAccessContext = {
  userId?: number | null;
  tenantId?: string | null;
  role?: string | null;
};

type SandboxJobOwnership = {
  userId: number;
  tenantId: string;
};

export function canAccessSandboxJob(
  job: SandboxJobOwnership,
  ctx: SandboxJobAccessContext,
): boolean {
  if (ctx.role === "admin") return true;
  if (!ctx.tenantId || !ctx.userId) return false;
  return job.tenantId === ctx.tenantId && job.userId === ctx.userId;
}

export const sandboxRouter = router({
  /**
   * Create a new sandbox job.
   */
  createJob: protectedProcedure
    .input(
      z.object({
        featureType: z.enum([
          "chat", "skill", "workflow", "library", "media", "presentation", "connector", "agency",
        ]),
        executionMode: z.enum([
          "sandbox-code", "sandbox-command", "sandbox-browser", "sandbox-file", "sandbox-media", "sandbox-python",
        ]),
        inputFiles: z
          .array(
            z.object({
              key: z.string(),
              mimeType: z.string(),
              sizeBytes: z.number(),
            }),
          )
          .default([]),
        profileOverride: z.string().optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
      }

      if (!shouldUseSandbox(input.executionMode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sandbox execution is not enabled",
        });
      }

      // Check tenant policy
      const policy = await checkTenantPolicy(ctx.tenantId);
      if (!policy.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: policy.reason ?? "Sandbox limit reached",
        });
      }

      // Resolve profile and estimate cost
      const profile = await resolveProfile(input.featureType, ctx.tenantId);
      const estimated = profile
        ? estimateCost({
            cpuLimit: profile.cpuLimit,
            memoryLimitMb: profile.memoryLimitMb,
            timeoutSeconds: profile.timeoutSeconds,
          })
        : 5; // minimal default

      // Reserve credits first
      await reserveCredits({
        userId: ctx.user!.id,
        estimatedCost: estimated,
        jobId: input.idempotencyKey ?? `pre-${Date.now()}`,
        tenantId: ctx.tenantId,
      });

      // Dispatch to Python backend -- refund on failure
      let result;
      try {
        result = await dispatchToSandbox({
          featureType: input.featureType,
          executionMode: input.executionMode,
          tenantId: ctx.tenantId,
          userId: ctx.user!.id,
          inputFiles: input.inputFiles,
          profileOverride: input.profileOverride,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        // Dispatch failed -- refund reserved credits
        await refundReservedCredits({
          userId: ctx.user!.id,
          jobId: input.idempotencyKey ?? "dispatch-failed",
          reservedAmount: estimated,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Sandbox dispatch failed",
        });
      }

      return { jobId: result.jobId };
    }),

  /**
   * Get current status of a sandbox job.
   */
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(sandboxJobs)
        .where(eq(sandboxJobs.id, input.jobId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      const job = rows[0];

      if (!canAccessSandboxJob(job, {
        userId: ctx.user?.id,
        tenantId: ctx.tenantId,
        role: ctx.user?.role,
      })) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      const projection = projectStatus(job.status as SandboxInternalStatus);

      let artifacts;
      if (projection.isTerminal && job.status === "completed") {
        artifacts = await getJobArtifactUrls({
          jobId: job.id,
          tenantId: job.tenantId, // Use job's tenant, not ctx (admin may query cross-tenant)
        });
      }

      return {
        jobId: job.id,
        status: job.status,
        label: projection.label,
        phase: projection.phase,
        isTerminal: projection.isTerminal,
        featureType: job.featureType,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        artifacts,
      };
    }),

  /**
   * Cancel a running or queued sandbox job.
   */
  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(sandboxJobs)
        .where(eq(sandboxJobs.id, input.jobId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      const job = rows[0];

      if (!canAccessSandboxJob(job, {
        userId: ctx.user?.id,
        tenantId: ctx.tenantId,
        role: ctx.user?.role,
      })) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      const projection = projectStatus(job.status as SandboxInternalStatus);
      if (projection.isTerminal) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel a job that is already in a terminal state",
        });
      }

      // Send cancel to Python backend
      const baseUrl = ENV.pythonBackendUrl || "http://localhost:8000";
      const cancelResponse = await internalFetch(
        `${baseUrl}/api/internal/sandbox/cancel/${input.jobId}`,
        { method: "POST" },
      );

      if (!cancelResponse.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel sandbox job on backend",
        });
      }

      // Refund reserved credits only after successful cancel
      if (job.costEstimate) {
        await refundReservedCredits({
          userId: job.userId,
          jobId: job.id,
          reservedAmount: parseFloat(job.costEstimate),
        });
      }

      return { success: true };
    }),

  /**
   * Fetch execution transcript (stdout/stderr excerpts).
   */
  getJobTranscript: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(sandboxJobs)
        .where(eq(sandboxJobs.id, input.jobId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      const job = rows[0];

      if (!canAccessSandboxJob(job, {
        userId: ctx.user?.id,
        tenantId: ctx.tenantId,
        role: ctx.user?.role,
      })) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
      }

      return {
        stdout: job.stdoutExcerpt ?? "",
        stderr: job.stderrExcerpt ?? "",
      };
    }),

  /**
   * List sandbox jobs with filters.
   */
  listJobs: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "accepted", "policy_resolved", "queued", "provisioning",
            "staging_inputs", "executing", "collecting_outputs", "persisting",
            "completed", "failed", "timed_out", "canceled",
          ])
          .optional(),
        featureType: z
          .enum([
            "chat", "skill", "workflow", "library", "media", "presentation", "connector", "agency",
          ])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = [];

      // Non-admin: filter by tenant
      if (ctx.user?.role !== "admin") {
        if (!ctx.tenantId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
        }
        if (!ctx.user?.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "User context required" });
        }
        conditions.push(eq(sandboxJobs.tenantId, ctx.tenantId));
        conditions.push(eq(sandboxJobs.userId, ctx.user.id));
      }

      if (input.status) {
        conditions.push(eq(sandboxJobs.status, input.status));
      }
      if (input.featureType) {
        conditions.push(eq(sandboxJobs.featureType, input.featureType));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(sandboxJobs)
        .where(whereClause)
        .orderBy(desc(sandboxJobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map((job: typeof rows[number]) => {
        const projection = projectStatus(job.status as SandboxInternalStatus);
        return {
          jobId: job.id,
          status: job.status,
          label: projection.label,
          phase: projection.phase,
          isTerminal: projection.isTerminal,
          featureType: job.featureType,
          userId: job.userId,
          tenantId: job.tenantId,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        };
      });
    }),

  /**
   * List available sandbox profiles.
   */
  getProfiles: protectedProcedure.query(async () => {
    const rows = await db
      .select({
        slug: sandboxProfiles.slug,
        name: sandboxProfiles.name,
        description: sandboxProfiles.description,
        executionMode: sandboxProfiles.executionMode,
        cpuLimit: sandboxProfiles.cpuLimit,
        memoryLimitMb: sandboxProfiles.memoryLimitMb,
        timeoutSeconds: sandboxProfiles.timeoutSeconds,
      })
      .from(sandboxProfiles)
      .where(eq(sandboxProfiles.isActive, true));

    return rows;
  }),
});
