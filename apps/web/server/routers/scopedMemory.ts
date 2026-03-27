/**
 * Scoped Memory tRPC Router — memory CRUD and search.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as memoryService from "../services/scopedMemoryService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

export const scopedMemoryRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx);
      return memoryService.listMemories(
        tenantId,
        "user",
        String(ctx.user!.id),
        input?.limit ?? 50,
      );
    }),

  create: protectedProcedure
    .input(z.object({
      ownerType: z.enum(["user", "agent", "team", "room", "project", "run"]),
      ownerId: z.string().min(1),
      memoryKind: z.enum(["fact", "rule", "preference", "decision", "note", "checklist", "artifact_note", "handoff_note", "episode"]),
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(10000),
      visibility: z.enum(["private", "shared_team", "shared_room", "shared_project"]).optional(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      importance: z.number().int().min(1).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return memoryService.createMemory({
        tenantId,
        ...input,
        sourceType: "manual",
        sourceUserId: ctx.user!.id,
      });
    }),

  search: protectedProcedure
    .input(z.object({
      scopes: z.array(z.object({
        type: z.enum(["user", "agent", "team", "room", "project", "run"]),
        id: z.string().min(1),
      })).min(1).max(20),
      query: z.string().min(1).max(500),
      topK: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return memoryService.searchMemories({
        tenantId,
        scopes: input.scopes,
        query: input.query,
        topK: input.topK,
      });
    }),

  get: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const memory = await memoryService.getMemory(input.memoryId, tenantId);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  update: protectedProcedure
    .input(z.object({
      memoryId: z.string().min(1),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      tags: z.array(z.string().max(100)).max(50).optional(),
      importance: z.number().int().min(1).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { memoryId, ...updates } = input;
      const memory = await memoryService.updateMemory(memoryId, tenantId, updates);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  delete: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const deleted = await memoryService.deleteMemory(input.memoryId, tenantId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return { success: true };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({
      memoryIds: z.array(z.string().min(1)).min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const deletedCount = await memoryService.deleteMemories(input.memoryIds, tenantId);
      return { success: true, deletedCount };
    }),

  promote: protectedProcedure
    .input(z.object({
      memoryId: z.string().min(1),
      toOwnerType: z.enum(["user", "agent", "team", "room", "project", "run"]),
      toOwnerId: z.string().min(1),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      await memoryService.promoteMemory(
        input.memoryId,
        tenantId,
        input.toOwnerType,
        input.toOwnerId,
        input.reason,
        { userId: ctx.user!.id },
      );
      return { success: true };
    }),
});
