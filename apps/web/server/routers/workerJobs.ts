import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import {
  USER_WORKER_JOB_STATUSES,
  cancelQueuedUserWorkerJob,
  getUserWorkerJobDetail,
  listUserWorkerJobs,
} from "../services/workerJobMonitorService";

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
  user?: { id?: number | null } | null;
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
      return getUserWorkerJobDetail({
        auth: requireWorkerJobAuth(ctx),
        jobId: input.jobId,
      });
    }),

  cancelQueued: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return cancelQueuedUserWorkerJob({
        auth: requireWorkerJobAuth(ctx),
        jobId: input.jobId,
      });
    }),
});
