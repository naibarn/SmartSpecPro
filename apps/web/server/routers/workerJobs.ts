import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure, rateLimitedAdminProcedure, router } from "../_core/trpc";
import {
  USER_WORKER_JOB_STATUSES,
  cancelQueuedUserWorkerJob,
  getUserWorkerJobDetail,
  listUserWorkerTaskGroups,
  listUserWorkerJobs,
  retryUserWorkerJob,
} from "../services/workerJobMonitorService";
import {
  applyCanonicalJobAction,
  getCanonicalJobOverview,
  getCanonicalJobTimeline,
  getWorkerJobDashboardSummary,
  listCanonicalJobs,
} from "../services/jobControlPlaneMonitor";
import { getSafeTaskControlSessionProjection } from "../services/runnerExecutionSessionService";
import { aggregateTaskObservability, getTaskObservabilityDetail, listTaskObservability, TaskObservabilityError } from "../services/taskObservabilityReadModel";

const statusSchema = z.enum(USER_WORKER_JOB_STATUSES);

// `worker_jobs.jobType` is a free-text `varchar(100)` (drizzle/schema.ts
// `workerJobs` table, ~:14055) — there is no fixed enum of job types (new
// job types are added by feature work without a schema migration), so this
// is an open string capped to the column length rather than a z.enum, same
// pattern used elsewhere in this router for free-text ids (e.g. `detail`'s
// `jobId: z.string().min(1)`).
const jobTypeSchema = z.string().trim().min(1).max(100);

function requireWorkerJobAuth(ctx: {
  tenantId?: string | null;
  user?: { id?: number | null; role?: string | null } | null;
}) {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
  }
  if (!ctx.user?.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "User context required" });
  }
  return {
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
  };
}

function requireTaskObservabilityScope(ctx: {
  tenantId?: string | null;
  user?: { id?: number | null; role?: string | null } | null;
}) {
  return {
    ...requireWorkerJobAuth(ctx),
    isAdmin: ctx.user?.role === "admin" || ctx.user?.role === "system_agent",
  };
}

function mapObservabilityError(error: unknown): never {
  if (error instanceof TaskObservabilityError) {
    if (error.code === "TASK_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: error.code });
    if (error.code === "SCOPE_REQUIRED") throw new TRPCError({ code: "FORBIDDEN", message: error.code });
    if (error.code === "SNAPSHOT_EXPIRED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.code });
    throw new TRPCError({ code: "BAD_REQUEST", message: error.code });
  }
  throw error;
}

export const workerJobsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: statusSchema.optional(),
      jobType: jobTypeSchema.optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const auth = requireWorkerJobAuth(ctx);
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      return listUserWorkerJobs({
        auth,
        status: input?.status,
        ...(input?.jobType ? { jobType: input.jobType } : {}),
        limit,
        offset,
      });
    }),

  detail: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const auth = requireWorkerJobAuth(ctx);
      const detail = await getUserWorkerJobDetail({
        auth,
        jobId: input.jobId,
      });
      const session = await getSafeTaskControlSessionProjection({
        ...auth,
        workerJobId: detail.id,
      });
      return { ...detail, executionSession: session };
    }),

  taskGroups: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => listUserWorkerTaskGroups({
      auth: requireWorkerJobAuth(ctx),
      limit: input?.limit ?? 25,
      offset: input?.offset ?? 0,
    })),

  dashboardSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const auth = requireWorkerJobAuth(ctx);
      return getWorkerJobDashboardSummary(auth);
    }),

  observability: protectedProcedure
    .input(z.object({
      cursor: z.string().max(1024).nullable().optional(),
      projectionToken: z.string().max(1024).optional(),
      projectId: z.string().trim().min(1).max(160).optional(),
      specId: z.string().trim().min(1).max(64).optional(),
      conversationId: z.number().int().positive().optional(),
    }).strict().optional())
    .query(async ({ ctx, input }) => {
      try {
        return await listTaskObservability({ scope: requireTaskObservabilityScope(ctx), cursor: input?.cursor, ...(input?.projectionToken ? { projectionToken: input.projectionToken } : {}), projectId: input?.projectId, specId: input?.specId, conversationId: input?.conversationId });
      } catch (error) { return mapObservabilityError(error); }
    }),

  observabilityDetail: protectedProcedure
    .input(z.object({ jobId: z.string().trim().min(1).max(36), projectionToken: z.string().max(1024).optional() }).strict())
    .query(async ({ ctx, input }) => {
      try { return await getTaskObservabilityDetail({ scope: requireTaskObservabilityScope(ctx), jobId: input.jobId, ...(input.projectionToken ? { projectionToken: input.projectionToken } : {}) }); }
      catch (error) { return mapObservabilityError(error); }
    }),

  observabilityAggregate: protectedProcedure
    .input(z.object({
      projectId: z.string().trim().min(1).max(160).optional(),
      specId: z.string().trim().min(1).max(64).optional(),
      projectionToken: z.string().max(1024).optional(),
    }).strict())
    .query(async ({ ctx, input }) => {
      try { return await aggregateTaskObservability({ scope: requireTaskObservabilityScope(ctx), ...input }); }
      catch (error) { return mapObservabilityError(error); }
    }),

  cancelQueued: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return cancelQueuedUserWorkerJob({
        auth: requireWorkerJobAuth(ctx),
        jobId: input.jobId,
      });
    }),

  retry: protectedProcedure
    .input(z.object({ jobId: z.string().min(1), actionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => retryUserWorkerJob({
      auth: requireWorkerJobAuth(ctx),
      jobId: input.jobId,
      actionId: input.actionId,
    })),

  controlPlaneList: adminProcedure
    .input(z.object({
      tenantId: z.string().uuid().optional(),
      status: z.string().max(40).optional(),
      jobType: jobTypeSchema.optional(),
      executionClass: z.string().trim().min(1).max(32).optional(),
      adapter: z.string().max(80).optional(),
      stale: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      before: z.coerce.date().optional(),
      beforeCursor: z.string().max(512).optional(),
    }).optional())
    .query(({ input }) => listCanonicalJobs({
      tenantId: input?.tenantId,
      status: input?.status,
      jobType: input?.jobType,
      executionClass: input?.executionClass,
      adapter: input?.adapter,
      stale: input?.stale,
      limit: input?.limit ?? 50,
      before: input?.before,
      beforeCursor: input?.beforeCursor,
    })),

  controlPlaneTimeline: adminProcedure
    .input(z.object({ jobId: z.string().uuid(), limit: z.number().int().min(1).max(500).default(200) }))
    .query(({ input }) => getCanonicalJobTimeline(input.jobId, input.limit)),

  controlPlaneOverview: adminProcedure
    .input(z.object({ tenantId: z.string().uuid().optional() }).optional())
    .query(({ input }) => getCanonicalJobOverview(input?.tenantId)),

  adminDashboardSummary: adminProcedure
    .input(z.object({ tenantId: z.string().uuid().optional() }).optional())
    .query(({ input }) => getWorkerJobDashboardSummary({ tenantId: input?.tenantId })),

  controlPlaneAction: rateLimitedAdminProcedure
    .input(z.object({ jobId: z.string().uuid(), action: z.enum(["cancel", "requeue", "force_fail"]), reason: z.string().trim().min(1).max(500), actionId: z.string().uuid() }))
    .mutation(({ ctx, input }) => applyCanonicalJobAction({ ...input, actorId: ctx.user?.id ?? undefined })),
});
