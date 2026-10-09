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
  canonicalProjectMemberships,
  canonicalProjects,
  conversations,
  teamRoomParticipants,
  teamRooms,
  teamRuns,
} from "../../drizzle/schema";
import * as memoryService from "../services/scopedMemoryService";

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

async function canAccessProjectScope(
  tenantId: string,
  userId: number,
  projectId: string,
  access: "read" | "write",
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Canonical project IDs are globally unique. Resolve them before checking
  // the legacy conversation projection so a foreign-tenant canonical ID can
  // never fall through to an older conversation with a matching string ID.
  const [canonicalProject] = await db
    .select({ tenantId: canonicalProjects.tenantId, lifecycle: canonicalProjects.lifecycle })
    .from(canonicalProjects)
    .where(eq(canonicalProjects.projectId, projectId))
    .limit(1);

  if (canonicalProject) {
    if (canonicalProject.tenantId !== tenantId || canonicalProject.lifecycle !== "ACTIVE") {
      return false;
    }

    const [membership] = await db
      .select({
        tenantId: canonicalProjectMemberships.tenantId,
        projectId: canonicalProjectMemberships.projectId,
        principalId: canonicalProjectMemberships.principalId,
        role: canonicalProjectMemberships.role,
        lifecycle: canonicalProjectMemberships.lifecycle,
      })
      .from(canonicalProjectMemberships)
      .where(
        and(
          eq(canonicalProjectMemberships.tenantId, tenantId),
          eq(canonicalProjectMemberships.projectId, projectId),
          eq(canonicalProjectMemberships.principalId, `user:${userId}`),
          eq(canonicalProjectMemberships.lifecycle, "ACTIVE"),
        ),
      )
      .limit(1);

    return Boolean(
      membership &&
        membership.tenantId === tenantId &&
        membership.projectId === projectId &&
        membership.principalId === `user:${userId}` &&
        membership.lifecycle === "ACTIVE" &&
        (membership.role === "owner" || membership.role === "editor" ||
          (access === "read" && membership.role === "viewer")),
    );
  }

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.userId, userId),
        eq(conversations.projectId, projectId),
      ),
    )
    .limit(1);

  return Boolean(conversation);
}

async function assertScopeAccess(params: {
  tenantId: string;
  userId: number;
  ownerType: "user" | "agent" | "team" | "room" | "project" | "run";
  ownerId: string;
  access: "read" | "write";
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
      if (
        !(await canAccessProjectScope(
          params.tenantId,
          params.userId,
          params.ownerId,
          params.access,
        ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project scope",
        });
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
) {
  const memory = await memoryService.getMemory(memoryId, tenantId);
  if (!memory) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
  }

  await assertScopeAccess({
    tenantId,
    userId,
    ownerType: memory.ownerType,
    ownerId: memory.ownerId,
    access,
  });

  return memory;
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
    .input(z.object({ memoryId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const memory = await assertMemoryAccess(
        tenantId,
        ctx.user!.id,
        input.memoryId,
        "read",
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
      await assertMemoryAccess(tenantId, ctx.user!.id, memoryId, "write");
      const memory = await memoryService.updateMemory(memoryId, tenantId, updates);
      if (!memory) throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found" });
      return memory;
    }),

  delete: protectedProcedure
    .input(z.object({ memoryId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      await assertMemoryAccess(tenantId, ctx.user!.id, input.memoryId, "write");
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
        await assertMemoryAccess(tenantId, ctx.user!.id, memoryId, "write");
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
      await assertMemoryAccess(tenantId, ctx.user!.id, input.memoryId, "write");
      await assertScopeAccess({
        tenantId,
        userId: ctx.user!.id,
        ownerType: input.toOwnerType,
        ownerId: input.toOwnerId,
        access: "write",
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
