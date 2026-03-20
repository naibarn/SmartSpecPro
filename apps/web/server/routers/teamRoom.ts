/**
 * Team Room tRPC Router — room lifecycle and messaging.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as roomService from "../services/roomService";
import { routeRoomIntent } from "../services/roomIntentRouter";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

export const teamRoomRouter = router({
  create: protectedProcedure
    .input(z.object({
      teamId: z.string().min(1),
      roomType: z.enum(["direct", "team", "auto_team", "job_review"]),
      goalPrompt: z.string().min(1).max(5000),
      projectId: z.number().int().optional(),
      viewMode: z.string().max(30).optional(),
      autonomyLevel: z.string().max(30).optional(),
    }))
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
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      return room;
    }),

  viewerState: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.getViewerState(input.roomId, tenantId, ctx.user!.id);
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      roomId: z.string().min(1),
      content: z.string().min(1).max(10000),
      recipientType: z.enum(["all", "assistant", "subgroup", "user"]).default("all"),
      recipientAssistantId: z.string().optional(),
      replyToMessageId: z.string().min(1).optional(),
      threadRootMessageId: z.string().min(1).optional(),
      workItemId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const intent = await routeRoomIntent({
        message: input.content,
        origin: "human_user",
        context: "room_message",
        userId: ctx.user!.id,
        tenantId,
        roomId: input.roomId,
      });

      return roomService.sendMessage({
        roomId: input.roomId,
        tenantId,
        senderType: "user",
        senderUserId: ctx.user!.id,
        recipientType: input.recipientType,
        recipientAssistantId: input.recipientAssistantId,
        content: input.content,
        metadataJson: {
          replyToMessageId: input.replyToMessageId ?? null,
          threadRootMessageId: input.threadRootMessageId ?? input.replyToMessageId ?? null,
          workItemId: input.workItemId ?? null,
          intentRoute: intent.route,
          intentReason: intent.reason,
          intentConfidence: intent.confidence,
          intentSkillId: intent.selectedSkillId ?? null,
          intentSource: intent.source,
        },
      });
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
    .input(z.object({
      roomId: z.string().min(1),
      viewMode: z.enum(["transparent", "milestone", "summary"]).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roomService.getMessages(input.roomId, tenantId, {
        viewMode: input.viewMode,
        callerType: "user",
        cursor: input.cursor,
        limit: input.limit,
      });
    }),
});
