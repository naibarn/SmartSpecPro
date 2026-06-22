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
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listUserWorkerJobs({
        auth: requireWorkerJobAuth(ctx),
        status: input?.status,
        limit: input?.limit,
        offset: input?.offset,
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
