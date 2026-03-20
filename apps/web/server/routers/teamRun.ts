/**
 * Team Run tRPC Router — run lifecycle and intervention controls.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as runEngine from "../services/runEngine";
import * as roomService from "../services/roomService";

const teamRunStartProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "team-run-start", limit: 10, windowMs: 60 * 60_000 }),
);

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

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

export const teamRunRouter = router({
  start: teamRunStartProcedure
    .input(z.object({
      roomId: z.string().min(1),
      executionMode: z.enum(["team_chat", "auto_team", "review"]),
      objective: z.string().min(1).max(5000),
      stopPolicy: stopPolicySchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const room = await roomService.getRoom(input.roomId, tenantId);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });

      const resolvedExecutionMode = roomService.mapRoomTypeToExecutionMode(
        room.roomType as roomService.TeamRoomType,
        input.executionMode,
      );

      return runEngine.startRun({
        ...input,
        executionMode: resolvedExecutionMode,
        tenantId,
        initiatedByUserId: ctx.user!.id,
      });
    }),

  pause: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return runEngine.pauseRun(input.runId, tenantId);
    }),

  resume: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return runEngine.resumeRun(input.runId, tenantId);
    }),

  advance: protectedProcedure
    .use(createRateLimitMiddleware({ namespace: "team-run-advance", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      runId: z.string().min(1),
      maxTurns: z.number().int().min(1).max(5).default(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return runEngine.advanceRun(input.runId, tenantId, input.maxTurns);
    }),

  stop: protectedProcedure
    .input(z.object({
      runId: z.string().min(1),
      reason: z.string().max(500).default("user_requested"),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return runEngine.stopRun(input.runId, input.reason, tenantId);
    }),

  get: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const run = await runEngine.getRun(input.runId, tenantId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return run;
    }),
});
