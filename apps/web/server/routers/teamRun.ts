/**
 * Team Run tRPC Router — run lifecycle and intervention controls.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as runEngine from "../services/runEngine";

const stopPolicySchema = z.object({
  maxRounds: z.number().int().min(1).max(100).default(20),
  maxDurationMinutes: z.number().int().min(1).max(480).default(30),
  maxBudgetCredits: z.number().min(1).max(10000),
  stopOnConsensus: z.boolean().default(false),
  stopOnArtifactReady: z.boolean().default(false),
  stopOnLeadSummary: z.boolean().default(true),
  requireFinalSummary: z.boolean().default(true),
  idleTimeoutSeconds: z.number().int().min(30).max(600).default(120),
});

export const teamRunRouter = router({
  start: protectedProcedure
    .input(z.object({
      roomId: z.string().min(1),
      executionMode: z.enum(["team_chat", "auto_team", "review"]),
      objective: z.string().min(1).max(5000),
      stopPolicy: stopPolicySchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return runEngine.startRun({
        ...input,
        tenantId,
        initiatedByUserId: ctx.userId,
      });
    }),

  pause: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return runEngine.pauseRun(input.runId, tenantId);
    }),

  resume: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return runEngine.resumeRun(input.runId, tenantId);
    }),

  stop: protectedProcedure
    .input(z.object({
      runId: z.string().min(1),
      reason: z.string().max(500).default("user_requested"),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return runEngine.stopRun(input.runId, input.reason, tenantId);
    }),

  get: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      const run = await runEngine.getRun(input.runId, tenantId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return run;
    }),
});
