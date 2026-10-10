/**
 * Scoped Memory tRPC Router — memory CRUD and search.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getDb } from "../db";
import {
  assistantProfiles,
  assistantTeams,
  scopedMemories,
  teamRoomParticipants,
  teamRooms,
  teamRuns,
} from "../../drizzle/schema";
import * as memoryService from "../services/scopedMemoryService";
import {
  issueProjectResolutionReceipt,
  resolveTrustedHostAppContext,
  validateProjectResolutionReceipt,
} from "../services/smartAiHubRuntimeContext";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: string | number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

async function canAccessTeamScope(
  tenantId: string,
  userId: number,
  teamId: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [team] = await db
    .select({ id: assistantTeams.id, ownerUserId: assistantTeams.ownerUserId })
    .from(assistantTeams)
    .where(
      and(
        eq(assistantTeams.id, teamId),
        eq(assistantTeams.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!team) return false;
  if (team.ownerUserId === userId) return true;

  const [member] = await db
    .select({ id: assistantProfiles.id })
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, teamId),
        eq(assistantProfiles.tenantId, tenantId),
        eq(assistantProfiles.humanUserId, userId),
        eq(assistantProfiles.isActive, true),
      ),
    )
    .limit(1);

  return Boolean(member);
}

async function canAccessRoomScope(
  tenantId: string,
  userId: number,
  roomId: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [participant] = await db
    .select({ id: teamRoomParticipants.id })
    .from(teamRoomParticipants)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRoomParticipants.roomId))
    .where(
      and(
        eq(teamRooms.id, roomId),
        eq(teamRooms.tenantId, tenantId),
        eq(teamRoomParticipants.participantUserId, userId),
      ),
    )
    .limit(1);

  return Boolean(participant);
}

async function canAccessRunScope(
  tenantId: string,
  userId: number,
  runId: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ roomId: teamRuns.roomId })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(
      and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)),
    )
    .limit(1);

  if (!run) return false;
  return canAccessRoomScope(tenantId, userId, run.roomId);
}

async function canAccessAgentScope(
  tenantId: string,
  userId: number,
  assistantId: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assistant] = await db
    .select({ teamId: assistantProfiles.teamId })
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.id, assistantId),
        eq(assistantProfiles.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!assistant?.teamId) return false;
  return canAccessTeamScope(tenantId, userId, assistant.teamId);
}

async function assertScopeAccess(params: {
  tenantId: string;
  userId: number;
  ownerType: "user" | "agent" | "team" | "room" | "project" | "run";
  ownerId: string;
  access: "read" | "write";
  host?: string | null;
  conversationId?: number;
}): Promise<void> {
  switch (params.ownerType) {
    case "user":
      if (params.ownerId !== String(params.userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot access another user's scoped memory",
        });
      }
      return;
    case "team":
      if (
        !(await canAccessTeamScope(
          params.tenantId,
          params.userId,
          params.ownerId,
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this team scope",
        });
      }
      return;
    case "room":
      if (
        !(await canAccessRoomScope(
          params.tenantId,
          params.userId,
          params.ownerId,
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this room scope",
        });
      }
      return;
    case "run":
      if (
        !(await canAccessRunScope(
          params.tenantId,
          params.userId,
          params.ownerId,
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this run scope",
        });
      }
      return;
    case "agent":
      if (
        !(await canAccessAgentScope(
          params.tenantId,
          params.userId,
          params.ownerId,
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this assistant scope",
        });
      }
      return;
    case "project":
      if (params.access === "write") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Durable ProjectResolutionReceipt required for project-shared memory writes",
        });
      }
      if (!params.conversationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A server-owned conversation binding is required for Project memory reads",
        });
      }
      {
        const appContext = await resolveTrustedHostAppContext({
          tenantId: params.tenantId,
          host: params.host,
        });
        const receipt = await issueProjectResolutionReceipt({
          tenantId: params.tenantId,
          userId: params.userId,
          appContext,
          conversationId: params.conversationId,
          selectedProjectId: params.ownerId,
        });
        const validation = await validateProjectResolutionReceipt({
          receipt,
          operation: "read",
          tenantId: params.tenantId,
          userId: params.userId,
          appId: appContext?.hostAppId ?? null,
          conversationId: params.conversationId,
        });
        if (!validation.authorized || validation.canonicalProjectId !== params.ownerId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have current App-bound access to this Project scope",
          });
        }
      }
      return;
    default:
      throw new TRPCError({ code: "FORBIDDEN", message: "Unsupported scope" });
  }
}

async function assertMemoryAccess(
  tenantId: string,
  userId: number,
  memoryId: string,
  access: "read" | "write",
  host?: string | null,
  conversationId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [metadata] = await db
    .select({ ownerType: scopedMemories.ownerType, ownerId: scopedMemories.ownerId })
    .from(scopedMemories)
    .where(and(eq(scopedMemories.id, memoryId), eq(scopedMemories.tenantId, tenantId)))
    .limit(1);
  if (!metadata) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
  }

  await assertScopeAccess({
    tenantId,
    userId,
    ownerType: metadata.ownerType,
    ownerId: metadata.ownerId,
    access,
    host,
    conversationId,
  });

  const memory = await memoryService.getMemory(memoryId, tenantId);
  if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
  return memory;
}

function trustedRequestHost(ctx: { req?: { hostname?: string; get?: (name: string) => string | undefined } }): string | null {
  return ctx.req?.hostname || ctx.req?.get?.("host")?.split(":")[0] || null;
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
      await assertScopeAccess({
        tenantId,
        userId: ctx.user!.id,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        access: "write",
        host: trustedRequestHost(ctx),
      });
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
      conversationId: z.number().int().positive().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      for (const scope of input.scopes) {
        await assertScopeAccess({
          tenantId,
          userId: ctx.user!.id,
          ownerType: scope.type,
          ownerId: scope.id,
          access: "read",
          host: trustedRequestHost(ctx),
          conversationId: input.conversationId,
        });
      }
      return memoryService.searchMemories({
        tenantId,
        scopes: input.scopes,
        query: input.query,
        topK: input.topK,
      });
    }),

  get: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1), conversationId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const memory = await assertMemoryAccess(
        tenantId,
        ctx.user!.id,
        input.memoryId,
        "read",
        trustedRequestHost(ctx),
        input.conversationId,
      );
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
      await assertMemoryAccess(tenantId, ctx.user!.id, memoryId, "write", trustedRequestHost(ctx));
      const memory = await memoryService.updateMemory(memoryId, tenantId, updates);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  delete: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      await assertMemoryAccess(tenantId, ctx.user!.id, input.memoryId, "write", trustedRequestHost(ctx));
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
      for (const memoryId of input.memoryIds) {
        await assertMemoryAccess(tenantId, ctx.user!.id, memoryId, "write", trustedRequestHost(ctx));
      }
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
      await assertMemoryAccess(tenantId, ctx.user!.id, input.memoryId, "write", trustedRequestHost(ctx));
      await assertScopeAccess({
        tenantId,
        userId: ctx.user!.id,
        ownerType: input.toOwnerType,
        ownerId: input.toOwnerId,
        access: "write",
        host: trustedRequestHost(ctx),
      });
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
