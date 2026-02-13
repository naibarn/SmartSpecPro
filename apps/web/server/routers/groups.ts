import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { groupOperationLimiter } from "../services/rateLimiter";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  createUserGroup,
  getUserGroups,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  deleteUserGroup,
  updateUserGroup,
  updateGroupMemberRole,
  joinOpenGroup,
  requestJoinGroup,
  approveJoinRequest,
  rejectJoinRequest,
  searchPublicGroups,
  searchTenantUsers,
  type GroupsActor,
} from "../services/groupsService";

// Input validation schemas
const createGroupSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  joinPolicy: z.enum(["invite_only", "request_to_join", "open"]).default("invite_only"),
  iconUrl: z.string().url().max(512).refine(
    (val) => /^https?:\/\//i.test(val),
    { message: "Icon URL must use http or https protocol" },
  ).optional(),
});

const updateGroupSchema = z.object({
  id: z.number().positive(),
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional(),
  visibility: z.enum(["private", "public"]).optional(),
  joinPolicy: z.enum(["invite_only", "request_to_join", "open"]).optional(),
  iconUrl: z.string().url().max(512).refine(
    (val) => /^https?:\/\//i.test(val),
    { message: "Icon URL must use http or https protocol" },
  ).nullable().optional(),
});

const memberRoleSchema = z.enum(["admin", "member"]);

function resolveGroupsTenantId(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);

  if (tenantId === null || tenantId === undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for group operations",
    });
  }

  return tenantId;
}

function buildActor(ctx: { user: { id: number; role?: string | null }; tenantId: unknown }, tenantId: string): GroupsActor {
  return {
    userId: ctx.user.id,
    tenantId,
    role: ctx.user.role,
  };
}

function logGroupMutation(action: string, ctx: { user: { id: number }; tenantId: unknown }, tenantId: string, metadata?: Record<string, unknown>) {
  console.log(`[groups.${action}]`, {
    userId: ctx.user.id,
    tenantId,
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

export const groupsRouter = router({
  // ── Queries ──

  list: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["my_groups", "member_of", "all"]).default("all"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const groups = await getUserGroups(actor);

      const scope = input?.scope ?? "all";
      if (scope === "my_groups") {
        return groups.filter(g => g.ownerId === ctx.user.id);
      }
      if (scope === "member_of") {
        return groups.filter(g => g.ownerId !== ctx.user.id);
      }

      return groups;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const groups = await getUserGroups(actor);

      const group = groups.find(g => g.id === input.id);
      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found or you are not a member",
        });
      }

      return group;
    }),

  searchPublic: protectedProcedure
    .input(
      z.object({
        query: z.string().max(128).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      return searchPublicGroups(
        {
          query: input?.query,
          limit: input?.limit ?? 20,
          offset: input?.offset ?? 0,
        },
        actor,
      );
    }),

  listMembers: protectedProcedure
    .input(z.object({ groupId: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      return getGroupMembers(input.groupId, actor);
    }),

  searchTenantUsers: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        excludeGroupId: z.number().positive().optional(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      return searchTenantUsers(
        input.query,
        tenantId,
        input.excludeGroupId,
        input.limit,
      );
    }),

  // ── Mutations ──

  create: protectedProcedure
    .input(createGroupSchema)
    .mutation(async ({ ctx, input }) => {
      if (!groupOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many group operations. Please try again later." });
      }
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const group = await createUserGroup(input, actor);
      logGroupMutation("create", ctx, tenantId, { groupId: group.id, name: input.name });
      return group;
    }),

  update: protectedProcedure
    .input(updateGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const { id, ...updateFields } = input;
      const result = await updateUserGroup(id, updateFields, actor);
      logGroupMutation("update", ctx, tenantId, { groupId: id });
      return result;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await deleteUserGroup(input.id, actor);
      logGroupMutation("delete", ctx, tenantId, { groupId: input.id });
      return result;
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        groupId: z.number().positive(),
        userId: z.number().positive(),
        role: memberRoleSchema.default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!groupOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many group operations. Please try again later." });
      }
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await addGroupMember(
        { groupId: input.groupId, userId: input.userId, role: input.role },
        actor,
      );
      logGroupMutation("addMember", ctx, tenantId, { groupId: input.groupId, targetUserId: input.userId, role: input.role });
      return result;
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        groupId: z.number().positive(),
        userId: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await removeGroupMember(
        { groupId: input.groupId, userId: input.userId },
        actor,
      );
      logGroupMutation("removeMember", ctx, tenantId, { groupId: input.groupId, targetUserId: input.userId });
      return result;
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await removeGroupMember(
        { groupId: input.groupId, userId: ctx.user.id },
        actor,
      );
      logGroupMutation("leave", ctx, tenantId, { groupId: input.groupId });
      return result;
    }),

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        groupId: z.number().positive(),
        userId: z.number().positive(),
        role: memberRoleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await updateGroupMemberRole(input.groupId, input.userId, input.role, actor);
      logGroupMutation("updateMemberRole", ctx, tenantId, { groupId: input.groupId, targetUserId: input.userId, role: input.role });
      return result;
    }),

  join: protectedProcedure
    .input(z.object({ groupId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!groupOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many group operations. Please try again later." });
      }
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await joinOpenGroup(input.groupId, actor);
      logGroupMutation("join", ctx, tenantId, { groupId: input.groupId });
      return result;
    }),

  requestJoin: protectedProcedure
    .input(z.object({ groupId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!groupOperationLimiter.isAllowed(`user:${ctx.user.id}`)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many group operations. Please try again later." });
      }
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await requestJoinGroup(input.groupId, actor);
      logGroupMutation("requestJoin", ctx, tenantId, { groupId: input.groupId });
      return result;
    }),

  approveMember: protectedProcedure
    .input(
      z.object({
        groupId: z.number().positive(),
        userId: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await approveJoinRequest(input, actor);
      logGroupMutation("approveMember", ctx, tenantId, { groupId: input.groupId, targetUserId: input.userId });
      return result;
    }),

  rejectMember: protectedProcedure
    .input(
      z.object({
        groupId: z.number().positive(),
        userId: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveGroupsTenantId(ctx);
      const actor = buildActor(ctx, tenantId);
      const result = await rejectJoinRequest(input, actor);
      logGroupMutation("rejectMember", ctx, tenantId, { groupId: input.groupId, targetUserId: input.userId });
      return result;
    }),
});
