/**
 * Team Room tRPC Router — room lifecycle and messaging.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as roomService from "../services/roomService";

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
      const tenantId = resolveTenantIdVarchar(ctx);
      return roomService.createRoom({
        tenantId,
        orchestratorUserId: ctx.userId,
        ...input,
      });
    }),

  get: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      const room = await roomService.getRoom(input.roomId, tenantId);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      return room;
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      roomId: z.string().min(1),
      content: z.string().min(1).max(10000),
      recipientType: z.enum(["all", "assistant", "subgroup", "user"]).default("all"),
      recipientAssistantId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return roomService.sendMessage({
        roomId: input.roomId,
        tenantId,
        senderType: "user",
        senderUserId: ctx.userId,
        recipientType: input.recipientType,
        recipientAssistantId: input.recipientAssistantId,
        content: input.content,
      });
    }),

  listByTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
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
      const tenantId = resolveTenantIdVarchar(ctx);
      return roomService.getMessages(input.roomId, tenantId, {
        viewMode: input.viewMode,
        callerType: "user",
        cursor: input.cursor,
        limit: input.limit,
      });
    }),
});
