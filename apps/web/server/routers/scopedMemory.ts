/**
 * Scoped Memory tRPC Router — memory CRUD and search.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as memoryService from "../services/scopedMemoryService";

export const scopedMemoryRouter = router({
  create: protectedProcedure
    .input(z.object({
      ownerType: z.enum(["user", "agent", "team", "room", "project", "run"]),
      ownerId: z.string().min(1),
      memoryKind: z.enum(["fact", "rule", "preference", "decision", "note", "checklist", "artifact_note", "handoff_note", "episode"]),
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(10000),
      visibility: z.enum(["private", "shared_team", "shared_room", "shared_project"]).optional(),
      tags: z.array(z.string()).optional(),
      importance: z.number().int().min(1).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return memoryService.createMemory({
        tenantId,
        ...input,
        sourceType: "manual",
        sourceUserId: ctx.userId,
      });
    }),

  search: protectedProcedure
    .input(z.object({
      scopes: z.array(z.object({
        type: z.enum(["user", "agent", "team", "room", "project", "run"]),
        id: z.string().min(1),
      })).min(1),
      query: z.string().min(1).max(500),
      topK: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      return memoryService.searchMemories({
        scopes: input.scopes,
        query: input.query,
        topK: input.topK,
      });
    }),

  get: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .query(async ({ input }) => {
      const memory = await memoryService.getMemory(input.memoryId);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  update: protectedProcedure
    .input(z.object({
      memoryId: z.string().min(1),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      tags: z.array(z.string()).optional(),
      importance: z.number().int().min(1).max(10).optional(),
    }))
    .mutation(async ({ input }) => {
      const { memoryId, ...updates } = input;
      const memory = await memoryService.updateMemory(memoryId, updates);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  delete: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const deleted = await memoryService.deleteMemory(input.memoryId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return { success: true };
    }),

  promote: protectedProcedure
    .input(z.object({
      memoryId: z.string().min(1),
      toOwnerType: z.enum(["user", "agent", "team", "room", "project", "run"]),
      toOwnerId: z.string().min(1),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await memoryService.promoteMemory(
        input.memoryId,
        input.toOwnerType,
        input.toOwnerId,
        input.reason,
        { userId: ctx.userId },
      );
      return { success: true };
    }),
});
