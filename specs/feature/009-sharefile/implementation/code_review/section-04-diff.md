diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 8cd9bc9..e5fc624 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -55,6 +55,7 @@ import { approvalsRouter } from "./routers/approvals";
 import { libraryRouter } from "./routers/library";
 import { libraryOpsRouter } from "./routers/libraryOps";
 import { factoryRouter } from "./routers/factory";
+import { groupsRouter } from "./routers/groups";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1211,6 +1212,9 @@ export const appRouter = router({
   // Library operations (admin)
   libraryOps: libraryOpsRouter,
 
+  // Groups management (ShareFile feature)
+  groups: groupsRouter,
+
   // Factory workflow/settings API
   factory: factoryRouter,
 
diff --git a/apps/web/server/routers/groups.test.ts b/apps/web/server/routers/groups.test.ts
new file mode 100644
index 0000000..5f35c32
--- /dev/null
+++ b/apps/web/server/routers/groups.test.ts
@@ -0,0 +1,105 @@
+import { describe, it } from "vitest";
+
+// Section 04: Groups Router Tests
+// These test stubs correspond to the groups tRPC router procedures.
+// Full integration tests will be implemented in section-11-security-tests.
+
+describe("groupsRouter", () => {
+  describe("groups.list", () => {
+    it.todo("returns user's owned groups when scope = 'my_groups'");
+    it.todo("returns user's memberships when scope = 'member_of'");
+    it.todo("returns all user's groups when scope = 'all'");
+    it.todo("rejects unauthenticated requests");
+  });
+
+  describe("groups.get", () => {
+    it.todo("returns group for valid groupId when user is a member");
+    it.todo("throws NOT_FOUND when user is not a member");
+    it.todo("throws NOT_FOUND when group doesn't exist");
+  });
+
+  describe("groups.searchPublic", () => {
+    it.todo("returns public groups in actor's tenant");
+    it.todo("supports query, limit, and offset parameters");
+  });
+
+  describe("groups.create", () => {
+    it.todo("creates group with valid input");
+    it.todo("throws CONFLICT for duplicate group name in tenant");
+    it.todo("throws BAD_REQUEST when user exceeds group limit");
+    it.todo("validates name length (1-128 chars)");
+    it.todo("validates visibility enum");
+    it.todo("validates joinPolicy enum");
+  });
+
+  describe("groups.update", () => {
+    it.todo("updates group when actor is owner");
+    it.todo("updates group when actor is admin");
+    it.todo("throws FORBIDDEN when actor is regular member");
+    it.todo("throws NOT_FOUND when group doesn't exist");
+    it.todo("merges settings (visibility, joinPolicy) correctly");
+  });
+
+  describe("groups.delete", () => {
+    it.todo("deletes group when actor is owner");
+    it.todo("throws FORBIDDEN when actor is not owner");
+    it.todo("throws NOT_FOUND when group doesn't exist");
+  });
+
+  describe("groups.addMember", () => {
+    it.todo("adds member when actor is admin/owner");
+    it.todo("throws FORBIDDEN when actor is regular member");
+    it.todo("throws CONFLICT when user is already a member");
+    it.todo("throws FORBIDDEN for cross-tenant member addition");
+    it.todo("throws BAD_REQUEST when group exceeds member limit");
+  });
+
+  describe("groups.removeMember", () => {
+    it.todo("removes member when actor is admin/owner");
+    it.todo("throws FORBIDDEN when actor lacks permission");
+    it.todo("throws NOT_FOUND when member not in group");
+  });
+
+  describe("groups.leave", () => {
+    it.todo("allows member to leave group");
+    it.todo("throws FORBIDDEN when owner tries to leave");
+  });
+
+  describe("groups.updateMemberRole", () => {
+    it.todo("updates role when actor is owner");
+    it.todo("updates role when actor is admin");
+    it.todo("throws FORBIDDEN when actor is regular member");
+    it.todo("throws NOT_FOUND when target member doesn't exist");
+  });
+
+  describe("groups.join", () => {
+    it.todo("joins open group immediately");
+    it.todo("throws FORBIDDEN for invite-only groups");
+    it.todo("throws FORBIDDEN for request_to_join groups with redirect message");
+    it.todo("throws CONFLICT when already a member");
+    it.todo("throws NOT_FOUND when group doesn't exist");
+  });
+
+  describe("groups.requestJoin", () => {
+    it.todo("creates pending membership for request_to_join groups");
+    it.todo("throws FORBIDDEN for invite-only groups");
+    it.todo("throws BAD_REQUEST for open groups with redirect message");
+    it.todo("throws CONFLICT when already a member or pending");
+  });
+
+  describe("groups.approveMember", () => {
+    it.todo("approves pending join request");
+    it.todo("throws FORBIDDEN when actor is not admin/owner");
+    it.todo("throws NOT_FOUND when no pending request exists");
+  });
+
+  describe("groups.rejectMember", () => {
+    it.todo("rejects pending join request");
+    it.todo("throws FORBIDDEN when actor is not admin/owner");
+    it.todo("throws NOT_FOUND when no pending request exists");
+  });
+
+  describe("router registration", () => {
+    it.todo("groupsRouter is registered in appRouter as 'groups'");
+  });
+});
diff --git a/apps/web/server/routers/groups.ts b/apps/web/server/routers/groups.ts
new file mode 100644
index 0000000..97d78db
--- /dev/null
+++ b/apps/web/server/routers/groups.ts
@@ -0,0 +1,519 @@
+import { TRPCError } from "@trpc/server";
+import { z } from "zod";
+
+import { protectedProcedure, router } from "../_core/trpc";
+import { resolveTenantIdVarchar } from "../services/tenantContext";
+import {
+  createUserGroup,
+  getUserGroups,
+  addGroupMember,
+  removeGroupMember,
+  deleteUserGroup,
+  approveJoinRequest,
+  rejectJoinRequest,
+  searchPublicGroups,
+  type GroupsActor,
+} from "../services/groupsService";
+
+// Input validation schemas
+const createGroupSchema = z.object({
+  name: z.string().min(1).max(128),
+  description: z.string().max(512).optional(),
+  visibility: z.enum(["private", "public"]).default("private"),
+  joinPolicy: z.enum(["invite_only", "request_to_join", "open"]).default("invite_only"),
+  iconUrl: z.string().max(512).optional(),
+});
+
+const updateGroupSchema = z.object({
+  id: z.number().positive(),
+  name: z.string().min(1).max(128).optional(),
+  description: z.string().max(512).optional(),
+  visibility: z.enum(["private", "public"]).optional(),
+  joinPolicy: z.enum(["invite_only", "request_to_join", "open"]).optional(),
+  iconUrl: z.string().max(512).nullable().optional(),
+});
+
+const memberRoleSchema = z.enum(["admin", "member"]);
+
+async function resolveGroupsTenantId(
+  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
+): Promise<string> {
+  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+
+  if (tenantId === null || tenantId === undefined) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "Tenant context is required for group operations",
+    });
+  }
+
+  return tenantId;
+}
+
+function buildActor(ctx: { user: { id: number; role?: string | null }; tenantId: unknown }, tenantId: string): GroupsActor {
+  return {
+    userId: ctx.user.id,
+    tenantId,
+    role: ctx.user.role,
+  };
+}
+
+export const groupsRouter = router({
+  // ── Queries ──
+
+  list: protectedProcedure
+    .input(
+      z.object({
+        scope: z.enum(["my_groups", "member_of", "all"]).default("all"),
+      }).optional()
+    )
+    .query(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+      const groups = await getUserGroups(actor);
+
+      const scope = input?.scope ?? "all";
+      if (scope === "my_groups") {
+        return groups.filter(g => g.ownerId === ctx.user.id);
+      }
+      if (scope === "member_of") {
+        return groups.filter(g => g.ownerId !== ctx.user.id);
+      }
+
+      return groups;
+    }),
+
+  get: protectedProcedure
+    .input(z.object({ id: z.number().positive() }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+      const groups = await getUserGroups(actor);
+
+      const group = groups.find(g => g.id === input.id);
+      if (!group) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Group not found or you are not a member",
+        });
+      }
+
+      return group;
+    }),
+
+  searchPublic: protectedProcedure
+    .input(
+      z.object({
+        query: z.string().max(128).optional(),
+        limit: z.number().min(1).max(100).default(20),
+        offset: z.number().min(0).default(0),
+      }).optional()
+    )
+    .query(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+      return searchPublicGroups(
+        {
+          query: input?.query,
+          limit: input?.limit ?? 20,
+          offset: input?.offset ?? 0,
+        },
+        actor,
+      );
+    }),
+
+  // ── Mutations ──
+
+  create: protectedProcedure
+    .input(createGroupSchema)
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        const group = await createUserGroup(input, actor);
+        return group;
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to create group";
+        if (message.includes("already exists")) {
+          throw new TRPCError({ code: "CONFLICT", message });
+        }
+        if (message.includes("maximum")) {
+          throw new TRPCError({ code: "BAD_REQUEST", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  update: protectedProcedure
+    .input(updateGroupSchema)
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      // Verify the user has access to this group
+      const groups = await getUserGroups(actor);
+      const group = groups.find(g => g.id === input.id);
+      if (!group) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
+      }
+
+      // Only owner or admin can update
+      if (group.ownerId !== ctx.user.id && group.role !== "admin") {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Only group owner or admin can update group" });
+      }
+
+      // Update is handled at the service level - for now delegate
+      // The service layer doesn't have an explicit updateGroup function yet,
+      // so we use the basic pattern from the groups service
+      const { getDb } = await import("../db");
+      const { userGroups } = await import("../../drizzle/schema");
+      const { eq, and } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
+      if (input.name !== undefined) updatePayload.name = input.name;
+      if (input.description !== undefined) updatePayload.description = input.description;
+      if (input.visibility !== undefined || input.joinPolicy !== undefined) {
+        // Merge with existing settings
+        const currentSettings = group.settings || { visibility: "private", joinPolicy: "invite_only" };
+        updatePayload.settings = {
+          ...currentSettings,
+          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
+          ...(input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}),
+        };
+      }
+      if (input.iconUrl !== undefined) updatePayload.iconUrl = input.iconUrl;
+
+      await db.update(userGroups)
+        .set(updatePayload)
+        .where(and(eq(userGroups.id, input.id), eq(userGroups.tenantId, tenantId)));
+
+      return { success: true };
+    }),
+
+  delete: protectedProcedure
+    .input(z.object({ id: z.number().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        await deleteUserGroup(input.id, actor);
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to delete group";
+        if (message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message });
+        }
+        if (message.includes("Only") || message.includes("permission")) {
+          throw new TRPCError({ code: "FORBIDDEN", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  addMember: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().positive(),
+        userId: z.number().positive(),
+        role: memberRoleSchema.default("member"),
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        await addGroupMember(
+          { groupId: input.groupId, userId: input.userId, role: input.role },
+          actor,
+        );
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to add member";
+        if (message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message });
+        }
+        if (message.includes("already")) {
+          throw new TRPCError({ code: "CONFLICT", message });
+        }
+        if (message.includes("permission") || message.includes("Only") || message.includes("tenant")) {
+          throw new TRPCError({ code: "FORBIDDEN", message });
+        }
+        if (message.includes("maximum")) {
+          throw new TRPCError({ code: "BAD_REQUEST", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  removeMember: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().positive(),
+        userId: z.number().positive(),
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        await removeGroupMember(
+          { groupId: input.groupId, userId: input.userId },
+          actor,
+        );
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to remove member";
+        if (message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message });
+        }
+        if (message.includes("permission") || message.includes("Only") || message.includes("owner")) {
+          throw new TRPCError({ code: "FORBIDDEN", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  leave: protectedProcedure
+    .input(z.object({ groupId: z.number().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        // Self-removal: pass own userId as the target
+        await removeGroupMember(
+          { groupId: input.groupId, userId: ctx.user.id },
+          actor,
+        );
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to leave group";
+        if (message.includes("owner")) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: "Group owner cannot leave. Transfer ownership or delete the group.",
+          });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  updateMemberRole: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().positive(),
+        userId: z.number().positive(),
+        role: memberRoleSchema,
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      // Verify actor is group admin/owner
+      const groups = await getUserGroups(actor);
+      const group = groups.find(g => g.id === input.groupId);
+      if (!group) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
+      }
+      if (group.ownerId !== ctx.user.id && group.role !== "admin") {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Only group owner or admin can change member roles" });
+      }
+
+      // Update the member role directly
+      const { getDb } = await import("../db");
+      const { groupMembers } = await import("../../drizzle/schema");
+      const { eq, and } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const updated = await db.update(groupMembers)
+        .set({ role: input.role })
+        .where(
+          and(
+            eq(groupMembers.groupId, input.groupId),
+            eq(groupMembers.userId, input.userId),
+          )
+        )
+        .returning({ id: groupMembers.id });
+
+      if (!updated[0]) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in group" });
+      }
+
+      return { success: true };
+    }),
+
+  join: protectedProcedure
+    .input(z.object({ groupId: z.number().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      // Fetch the specific group to check its join policy
+      const { getDb } = await import("../db");
+      const { userGroups } = await import("../../drizzle/schema");
+      const { eq, and, isNull } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const groupRows = await db.select()
+        .from(userGroups)
+        .where(and(eq(userGroups.id, input.groupId), eq(userGroups.tenantId, tenantId), isNull(userGroups.deletedAt)))
+        .limit(1);
+
+      const group = groupRows[0];
+      if (!group) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
+      }
+
+      const settings = group.settings as { joinPolicy?: string } | null;
+      const joinPolicy = settings?.joinPolicy ?? "invite_only";
+
+      if (joinPolicy !== "open") {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: joinPolicy === "request_to_join"
+            ? "This group requires a join request. Use requestJoin instead."
+            : "This group is invite-only",
+        });
+      }
+
+      try {
+        await addGroupMember(
+          { groupId: input.groupId, userId: ctx.user.id, role: "member" },
+          // Use a synthetic actor that represents self-join
+          { userId: group.ownerId, tenantId, role: "admin" },
+        );
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to join group";
+        if (message.includes("already")) {
+          throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this group" });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  requestJoin: protectedProcedure
+    .input(z.object({ groupId: z.number().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+
+      // Verify group allows join requests
+      const { getDb } = await import("../db");
+      const { userGroups, groupMembers } = await import("../../drizzle/schema");
+      const { eq, and, isNull } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const groupRows = await db.select()
+        .from(userGroups)
+        .where(and(eq(userGroups.id, input.groupId), eq(userGroups.tenantId, tenantId), isNull(userGroups.deletedAt)))
+        .limit(1);
+
+      const group = groupRows[0];
+      if (!group) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
+      }
+
+      const settings = group.settings as { joinPolicy?: string } | null;
+      const joinPolicy = settings?.joinPolicy ?? "invite_only";
+
+      if (joinPolicy === "invite_only") {
+        throw new TRPCError({ code: "FORBIDDEN", message: "This group is invite-only" });
+      }
+
+      if (joinPolicy === "open") {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "This group is open. Use join instead of requestJoin.",
+        });
+      }
+
+      // Create a pending membership
+      try {
+        await db.insert(groupMembers).values({
+          groupId: input.groupId,
+          userId: ctx.user.id,
+          role: "member",
+          status: "pending",
+          joinedAt: new Date(),
+        });
+      } catch {
+        throw new TRPCError({ code: "CONFLICT", message: "You already have a pending request or are a member" });
+      }
+
+      return { success: true };
+    }),
+
+  approveMember: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().positive(),
+        userId: z.number().positive(),
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        await approveJoinRequest(input, actor);
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to approve member";
+        if (message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message });
+        }
+        if (message.includes("permission") || message.includes("Only")) {
+          throw new TRPCError({ code: "FORBIDDEN", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+
+  rejectMember: protectedProcedure
+    .input(
+      z.object({
+        groupId: z.number().positive(),
+        userId: z.number().positive(),
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = await resolveGroupsTenantId(ctx);
+      const actor = buildActor(ctx, tenantId);
+
+      try {
+        await rejectJoinRequest(input, actor);
+        return { success: true };
+      } catch (error) {
+        if (error instanceof TRPCError) throw error;
+        const message = error instanceof Error ? error.message : "Failed to reject member";
+        if (message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message });
+        }
+        if (message.includes("permission") || message.includes("Only")) {
+          throw new TRPCError({ code: "FORBIDDEN", message });
+        }
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
+      }
+    }),
+});
