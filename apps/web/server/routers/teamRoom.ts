/**
 * Team Room tRPC Router — room lifecycle and messaging.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure, domainAdminProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as roomService from "../services/roomService";
import * as runEngine from "../services/runEngine";
import { routeRoomIntent } from "../services/roomIntentRouter";
import { getDb } from "../db";
import {
  teamRooms,
  teamRuns,
} from "../../drizzle/schema";
import {
  getRoleAgentDetailForTenant,
  listRoleMessagesForRole,
} from "../services/rolePersistence";
import { sendTypedRoleMessage } from "../services/roleDelegationService";
import { captureUserMemoryFromTeamMessage } from "../services/teamRoomMemoryService";
import * as monitoringService from "../services/monitoringService";
import { getAutoTeamDebugSnapshot } from "../services/autoTeamDebugSnapshotService";
import { getAutoTeamLedgerSnapshot } from "../services/autoTeamLedgerService";

function requireTenantId(ctx: {
  tenantId: string | null;
  user?: { currentTenantId?: string | number | null } | null;
}): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  return tid;
}

async function loadLatestInteractiveRun(
  roomId: string,
  tenantId: string,
): Promise<{ id: string; status: "queued" | "running" | "paused" } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({
      id: teamRuns.id,
      status: teamRuns.status,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(
      and(
        eq(teamRuns.roomId, roomId),
        eq(teamRooms.tenantId, tenantId),
        eq(teamRuns.executionMode, "team_chat"),
        inArray(teamRuns.status, ["running", "paused"]),
      ),
    )
    .orderBy(desc(teamRuns.startedAt))
    .limit(1);

  if (!run) return null;
  return run as {
    id: string;
    status: "running" | "paused";
  };
}

async function loadLatestActiveRun(
  roomId: string,
  tenantId: string,
): Promise<{
  id: string;
  status: "queued" | "running" | "paused";
  executionMode: "team_chat" | "auto_team" | "review";
} | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({
      id: teamRuns.id,
      status: teamRuns.status,
      executionMode: teamRuns.executionMode,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(
      and(
        eq(teamRuns.roomId, roomId),
        eq(teamRooms.tenantId, tenantId),
        inArray(teamRuns.status, ["running", "paused", "queued"]),
      ),
    )
    .orderBy(desc(teamRuns.startedAt))
    .limit(1);

  if (!run) return null;
  return run as {
    id: string;
    status: "queued" | "running" | "paused";
    executionMode: "team_chat" | "auto_team" | "review";
  };
}

export const teamRoomRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        teamId: z.string().min(1),
        roomType: z.enum(["direct", "team", "auto_team", "job_review"]),
        goalPrompt: z.string().min(1).max(5000),
        language: z.enum(["en", "th"]).default("en"),
        projectId: z.number().int().optional(),
        viewMode: z.string().max(30).optional(),
        autonomyLevel: z.string().max(30).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.createRoom({
        tenantId,
        orchestratorUserId: ctx.user!.id,
        ...input,
      });
    }),

  get: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const room = await roomService.getRoom(input.roomId, tenantId);
      if (!room)
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      return room;
    }),

  getActiveRun: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return loadLatestActiveRun(input.roomId, tenantId);
    }),

  viewerState: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.getViewerState(input.roomId, tenantId, ctx.user!.id);
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        content: z.string().min(1).max(10000),
        recipientType: z
          .enum(["all", "assistant", "subgroup", "user"])
          .default("all"),
        recipientAssistantId: z.string().optional(),
        replyToMessageId: z.string().min(1).optional(),
        threadRootMessageId: z.string().min(1).optional(),
        workItemId: z.string().min(1).optional(),
        autoRespond: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const room = await roomService.getRoom(input.roomId, tenantId);
      if (!room) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      }
      const intent = await routeRoomIntent({
        message: input.content,
        origin: "human_user",
        context: "room_message",
        userId: ctx.user!.id,
        tenantId,
        roomId: input.roomId,
      });

      const message = await roomService.sendMessage({
        roomId: input.roomId,
        tenantId,
        senderType: "user",
        senderUserId: ctx.user!.id,
        recipientType: input.recipientType,
        recipientAssistantId: input.recipientAssistantId,
        content: input.content,
        metadataJson: {
          replyToMessageId: input.replyToMessageId ?? null,
          threadRootMessageId:
            input.threadRootMessageId ?? input.replyToMessageId ?? null,
          workItemId: input.workItemId ?? null,
          intentRoute: intent.route,
          intentReason: intent.reason,
          intentConfidence: intent.confidence,
          intentSkillId: intent.selectedSkillId ?? null,
          intentSource: intent.source,
        },
      });

      await captureUserMemoryFromTeamMessage({
        tenantId,
        userId: ctx.user!.id,
        content: input.content,
        projectId:
          room.projectId !== null && room.projectId !== undefined
            ? String(room.projectId)
            : null,
      }).catch(error => {
        console.warn("[teamRoomRouter] failed to capture user team memory", {
          roomId: input.roomId,
          userId: ctx.user!.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      let triggeredRunId: string | null = null;
      let assistantTurnsStarted = 0;
      const shouldAutoRespond =
        Boolean(input.autoRespond) && room.roomType !== "auto_team";

      if (shouldAutoRespond) {
        let run = await loadLatestInteractiveRun(input.roomId, tenantId);
        if (!run) {
          const startedRun = await runEngine.startRun({
            roomId: input.roomId,
            tenantId,
            initiatedByUserId: ctx.user!.id,
            executionMode: "team_chat",
            objective: input.content.trim(),
            stopPolicy: runEngine.DEFAULT_STOP_POLICY,
          });
          run = {
            id: startedRun.id,
            status: startedRun.status as "queued" | "running" | "paused",
          };
        } else {
          await runEngine.updateRunObjective(run.id, tenantId, input.content);
          if (run.status === "paused") {
            await runEngine.resumeRun(run.id, tenantId);
            run = { ...run, status: "running" };
          }
        }

        triggeredRunId = run.id;
        const turns = await runEngine.advanceRun(run.id, tenantId, 1);
        assistantTurnsStarted = turns.length;
      }

      return {
        message,
        triggeredRunId,
        assistantTurnsStarted,
      };
    }),

  markViewed: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.markRoomViewed(input.roomId, tenantId, ctx.user!.id);
    }),

  listByTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.listRoomsByTeam(input.teamId, tenantId);
    }),

  getMessages: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        viewMode: z.enum(["transparent", "milestone", "summary"]).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.getMessages(input.roomId, tenantId, {
        viewMode: input.viewMode,
        callerType: "user",
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  getContextEngineHealth: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        teamId: z.string().min(1).optional(),
        runId: z.string().min(1).optional(),
        skillId: z.string().min(1).optional(),
        userId: z.number().int().positive().optional(),
        since: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(50).default(12),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const room = await roomService.getRoom(input.roomId, tenantId);
      if (!room) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      }
      const canBypassRoomAccess = ctx.user?.role === "admin" || ctx.user?.role === "domain_admin";
      if (!canBypassRoomAccess) {
        const canAccessRoom = await roomService.hasRoomParticipantAccess(input.roomId, tenantId, ctx.user!.id);
        if (!canAccessRoom) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this room health view",
          });
        }
      }
      if (input.teamId && room.teamId !== input.teamId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Room does not belong to the requested team",
        });
      }
      return monitoringService.getContextEngineHealth({
        tenantId,
        teamId: input.teamId ?? room.teamId,
        roomId: input.roomId,
        runId: input.runId ?? room.lastRunId ?? null,
        skillId: input.skillId ?? null,
        userId: input.userId ?? null,
        since: input.since ?? null,
        limit: input.limit,
      });
    }),

  getAutoTeamDebugSnapshot: domainAdminProcedure
    .input(
      z.object({
        roomId: z.string().min(1).optional(),
        runId: z.string().min(1).optional(),
        workRequestId: z.string().min(1).optional(),
        workCaseId: z.string().min(1).optional(),
        limitMessages: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const caller = {
        tenantId,
        userId: ctx.user?.id ?? null,
        isTenantAdmin: ctx.user?.role === "admin",
        isDebugUser: ctx.user?.role === "admin" || ctx.user?.role === "domain_admin",
      };

      return getAutoTeamDebugSnapshot({
        tenantId,
        caller,
        roomId: input.roomId ?? null,
        runId: input.runId ?? null,
        workRequestId: input.workRequestId ?? null,
        workCaseId: input.workCaseId ?? null,
        limitMessages: input.limitMessages,
      });
    }),

  getAutoTeamLedger: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1).optional(),
        runId: z.string().min(1).optional(),
        workRequestId: z.string().min(1).optional(),
        workCaseId: z.string().min(1).optional(),
        limitMessages: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const caller = {
        tenantId,
        userId: ctx.user?.id ?? null,
        isTenantAdmin: ctx.user?.role === "admin",
        isDebugUser: ctx.user?.role === "admin" || ctx.user?.role === "domain_admin",
      };

      try {
        return await getAutoTeamLedgerSnapshot({
          tenantId,
          caller,
          roomId: input.roomId ?? null,
          runId: input.runId ?? null,
          workRequestId: input.workRequestId ?? null,
          workCaseId: input.workCaseId ?? null,
          limitMessages: input.limitMessages,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("do not have access")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message,
          });
        }
        throw error;
      }
    }),

  sendRoleMessage: adminProcedure
    .input(
      z.object({
        senderRoleId: z.string().min(1),
        recipientRoleId: z.string().min(1).optional(),
        recipientGroup: z.string().optional(),
        roomId: z.string().min(1).optional(),
        relatedRoutineId: z.string().optional(),
        relatedRoutineRunId: z.string().optional(),
        relatedWorkpackFamily: z.string().optional(),
        relatedWorkpackRunId: z.string().optional(),
        intentType: z.enum([
          "request",
          "handoff",
          "escalate",
          "dependency_block",
          "status_summary",
          "approval_request",
          "shared_finding",
        ]),
        priority: z.enum(["low", "normal", "high", "critical"]).optional(),
        dueState: z.enum(["none", "pending", "due_soon", "overdue"]).optional(),
        contentSummary: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return sendTypedRoleMessage({
        tenantId,
        senderRoleId: input.senderRoleId,
        recipientRoleId: input.recipientRoleId ?? null,
        recipientGroup: input.recipientGroup ?? null,
        roomId: input.roomId ?? null,
        relatedRoutineId: input.relatedRoutineId ?? null,
        relatedRoutineRunId: input.relatedRoutineRunId ?? null,
        relatedWorkpackFamily: input.relatedWorkpackFamily ?? null,
        relatedWorkpackRunId: input.relatedWorkpackRunId ?? null,
        intentType: input.intentType,
        priority: input.priority,
        dueState: input.dueState,
        contentSummary: input.contentSummary,
      });
    }),

  getRoleMessages: adminProcedure
    .input(
      z.object({
        roleId: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const detail = await getRoleAgentDetailForTenant(tenantId, input.roleId);
      if (!detail) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Role belongs to another tenant",
        });
      }
      return listRoleMessagesForRole(input.roleId);
    }),
});
