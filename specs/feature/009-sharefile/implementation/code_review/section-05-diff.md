diff --git a/apps/web/server/routers/library.test.ts b/apps/web/server/routers/library.test.ts
index 36e28cc..270fc21 100644
--- a/apps/web/server/routers/library.test.ts
+++ b/apps/web/server/routers/library.test.ts
@@ -4,6 +4,7 @@ const {
   mockCreateLibraryItem,
   mockGetLibraryItemById,
   mockGetLibraryMarkdownContent,
+  mockGetUserEffectivePermission,
   mockListLibraryDocuments,
   mockSaveLibraryMarkdown,
   mockSearchLibraryItems,
@@ -16,6 +17,7 @@ const {
   mockCreateLibraryItem: vi.fn(),
   mockGetLibraryItemById: vi.fn(),
   mockGetLibraryMarkdownContent: vi.fn(),
+  mockGetUserEffectivePermission: vi.fn(),
   mockListLibraryDocuments: vi.fn(),
   mockSaveLibraryMarkdown: vi.fn(),
   mockSearchLibraryItems: vi.fn(),
@@ -30,6 +32,7 @@ vi.mock("../services/libraryService", () => ({
   createLibraryItem: mockCreateLibraryItem,
   getLibraryItemById: mockGetLibraryItemById,
   getLibraryMarkdownContent: mockGetLibraryMarkdownContent,
+  getUserEffectivePermission: mockGetUserEffectivePermission,
   listLibraryDocuments: mockListLibraryDocuments,
   saveLibraryMarkdown: mockSaveLibraryMarkdown,
   searchLibraryItems: mockSearchLibraryItems,
@@ -37,6 +40,14 @@ vi.mock("../services/libraryService", () => ({
   updateLibraryItem: mockUpdateLibraryItem,
   softDeleteLibraryItem: mockSoftDeleteLibraryItem,
   shareLibraryItem: mockShareLibraryItem,
+  LibraryMarkdownVersionConflictError: class extends Error {
+    currentUpdatedAt: Date;
+    constructor(msg: string, currentUpdatedAt: Date) {
+      super(msg);
+      this.name = "LibraryMarkdownVersionConflictError";
+      this.currentUpdatedAt = currentUpdatedAt;
+    }
+  },
 }));
 
 vi.mock("../services/auditLogger", () => ({
@@ -464,6 +475,32 @@ describe("libraryRouter.getItem", () => {
       }),
     ).rejects.toThrow("Library item not found");
   });
+
+  it("returns item with userPermissions when found", async () => {
+    mockGetLibraryItemById.mockResolvedValue({ id: 123, title: "Test" });
+    mockGetUserEffectivePermission.mockResolvedValue({
+      effectivePermissionLevel: "write",
+      sources: [{ type: "direct", permissionLevel: "write" }],
+    });
+
+    const fn = libraryRouter.getItem as Function;
+    const result = await fn({
+      ctx: {
+        user: { id: 4, role: "user", currentTenantId: 2 },
+        tenantId: 2,
+      },
+      input: { id: 123 },
+    });
+
+    expect(result.userPermissions).toEqual({
+      effectiveLevel: "write",
+      sources: [{ type: "direct", permissionLevel: "write" }],
+      canRead: true,
+      canWrite: true,
+      canDelete: false,
+      isOwner: false,
+    });
+  });
 });
 
 describe("libraryRouter.updateItem", () => {
@@ -513,3 +550,51 @@ describe("libraryRouter.shareItem", () => {
     );
   });
 });
+
+// ── New ShareFile procedures (section-05) ──
+
+describe("libraryRouter.removeShare", () => {
+  it.todo("removes share when actor has delete permission");
+  it.todo("rejects when actor has only read/write permission");
+  it.todo("throws NOT_FOUND for non-existent share");
+  it.todo("logs audit event on success");
+});
+
+describe("libraryRouter.updateSharePermission", () => {
+  it.todo("updates permission level when actor has manage permission");
+  it.todo("rejects when actor lacks delete/owner permission");
+  it.todo("throws NOT_FOUND for non-existent share");
+  it.todo("logs audit event on success");
+});
+
+describe("libraryRouter.getItemShares", () => {
+  it.todo("returns share list with resolved user names");
+  it.todo("returns share list with resolved group names");
+  it.todo("returns tenant_role shares with roleName");
+  it.todo("rejects when actor has no permission on item");
+});
+
+describe("libraryRouter.listTrash", () => {
+  it.todo("returns owner's deleted items with pagination");
+  it.todo("calculates daysInTrash and daysUntilPurge correctly");
+  it.todo("returns empty list when no trashed items");
+  it.todo("applies default limit and offset");
+});
+
+describe("libraryRouter.restoreFromTrash", () => {
+  it.todo("restores item when actor is the owner");
+  it.todo("restores item when actor is the deleter");
+  it.todo("rejects when actor is neither owner nor deleter");
+  it.todo("throws NOT_FOUND for non-trashed item");
+  it.todo("clears deletedAt and deletedBy, sets status to ready");
+  it.todo("logs audit event on success");
+});
+
+describe("libraryRouter.permanentDelete", () => {
+  it.todo("hard deletes item and cascades chunks + permissions for owner");
+  it.todo("allows admin to purge items 90+ days in trash");
+  it.todo("rejects non-owner non-admin permanent delete");
+  it.todo("rejects admin for items < 90 days in trash");
+  it.todo("throws NOT_FOUND for non-trashed item");
+  it.todo("logs audit event with daysInTrash");
+});
diff --git a/apps/web/server/routers/library.ts b/apps/web/server/routers/library.ts
index 92446d4..7ea8950 100644
--- a/apps/web/server/routers/library.ts
+++ b/apps/web/server/routers/library.ts
@@ -9,6 +9,7 @@ import {
   createLibraryItem,
   getLibraryMarkdownContent,
   getLibraryItemById,
+  getUserEffectivePermission,
   LibraryMarkdownVersionConflictError,
   listLibraryDocuments,
   saveLibraryMarkdown,
@@ -21,8 +22,9 @@ import {
 
 const visibilitySchema = z.enum(["private", "team", "public"]);
 const itemStatusSchema = z.enum(["draft", "ready", "indexing", "archived", "failed"]);
-const permissionLevelSchema = z.enum(["read", "write", "owner"]);
-const subjectTypeSchema = z.enum(["user", "tenant_role"]);
+const permissionLevelSchema = z.enum(["read", "write", "delete", "owner"]);
+const sharePermissionLevelSchema = z.enum(["read", "write", "delete"]);
+const subjectTypeSchema = z.enum(["user", "tenant_role", "group"]);
 
 const sourceLinkSchema = z.object({
   linkType: z.string().min(1).max(64),
@@ -350,7 +352,22 @@ export const libraryRouter = router({
         });
       }
 
-      return item;
+      // Include effective permissions for the requesting user
+      const effectivePermission = await getUserEffectivePermission(input.id, actor);
+      const level = effectivePermission.effectivePermissionLevel;
+      const rank = level === "owner" ? 4 : level === "delete" ? 3 : level === "write" ? 2 : level === "read" ? 1 : 0;
+
+      return {
+        ...item,
+        userPermissions: {
+          effectiveLevel: level,
+          sources: effectivePermission.sources,
+          canRead: rank >= 1,
+          canWrite: rank >= 2,
+          canDelete: rank >= 3,
+          isOwner: rank >= 4,
+        },
+      };
     }),
 
   updateItem: protectedProcedure
@@ -454,7 +471,7 @@ export const libraryRouter = router({
         itemId: z.number().int().positive(),
         subjectType: subjectTypeSchema,
         subjectId: z.string().min(1).max(64),
-        permissionLevel: permissionLevelSchema,
+        permissionLevel: sharePermissionLevelSchema,
         expiresAt: z.coerce.date().nullable().optional(),
       }),
     )
@@ -492,6 +509,431 @@ export const libraryRouter = router({
         },
       });
 
+      return { success: true };
+    }),
+
+  // ── New procedures for ShareFile feature ──
+
+  removeShare: protectedProcedure
+    .input(
+      z.object({
+        itemId: z.number().int().positive(),
+        subjectType: subjectTypeSchema,
+        subjectId: z.string().min(1).max(64),
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = {
+        userId: ctx.user.id,
+        tenantId: tenantIdResolved as any,
+        role: ctx.user.role,
+      };
+
+      // Check actor has manage permission
+      const permission = await getUserEffectivePermission(input.itemId, actor);
+      const level = permission.effectivePermissionLevel;
+      if (level !== "delete" && level !== "owner") {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "You need delete or owner permission to manage shares",
+        });
+      }
+
+      const { getDb } = await import("../db");
+      const { libraryPermissions } = await import("../../drizzle/schema");
+      const { eq, and } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const deleted = await db
+        .delete(libraryPermissions)
+        .where(
+          and(
+            eq(libraryPermissions.libraryItemId, input.itemId),
+            eq(libraryPermissions.subjectType, input.subjectType),
+            eq(libraryPermissions.subjectId, input.subjectId),
+            eq(libraryPermissions.tenantId, tenantIdResolved),
+          ),
+        )
+        .returning({ id: libraryPermissions.id });
+
+      if (!deleted[0]) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Share not found",
+        });
+      }
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.removeShare",
+        requestType: "mutation",
+        requestPayload: {
+          tenantId: tenantIdResolved,
+          itemId: input.itemId,
+          subjectType: input.subjectType,
+          subjectId: input.subjectId,
+        },
+        responsePayload: { success: true },
+      });
+
+      return { success: true };
+    }),
+
+  updateSharePermission: protectedProcedure
+    .input(
+      z.object({
+        itemId: z.number().int().positive(),
+        subjectType: subjectTypeSchema,
+        subjectId: z.string().min(1).max(64),
+        permissionLevel: sharePermissionLevelSchema,
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = {
+        userId: ctx.user.id,
+        tenantId: tenantIdResolved as any,
+        role: ctx.user.role,
+      };
+
+      // Check actor has manage permission
+      const permission = await getUserEffectivePermission(input.itemId, actor);
+      const level = permission.effectivePermissionLevel;
+      if (level !== "delete" && level !== "owner") {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "You need delete or owner permission to manage shares",
+        });
+      }
+
+      const { getDb } = await import("../db");
+      const { libraryPermissions } = await import("../../drizzle/schema");
+      const { eq, and } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const updated = await db
+        .update(libraryPermissions)
+        .set({
+          permissionLevel: input.permissionLevel,
+          updatedAt: new Date(),
+        })
+        .where(
+          and(
+            eq(libraryPermissions.libraryItemId, input.itemId),
+            eq(libraryPermissions.subjectType, input.subjectType),
+            eq(libraryPermissions.subjectId, input.subjectId),
+            eq(libraryPermissions.tenantId, tenantIdResolved),
+          ),
+        )
+        .returning({ id: libraryPermissions.id });
+
+      if (!updated[0]) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Share not found",
+        });
+      }
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.updateSharePermission",
+        requestType: "mutation",
+        requestPayload: {
+          tenantId: tenantIdResolved,
+          itemId: input.itemId,
+          subjectType: input.subjectType,
+          subjectId: input.subjectId,
+          permissionLevel: input.permissionLevel,
+        },
+        responsePayload: { success: true },
+      });
+
+      return { success: true };
+    }),
+
+  getItemShares: protectedProcedure
+    .input(z.object({ itemId: z.number().int().positive() }))
+    .query(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+      const actor = {
+        userId: ctx.user.id,
+        tenantId: tenantIdResolved as any,
+        role: ctx.user.role,
+      };
+
+      // Check actor has at least read permission
+      const permission = await getUserEffectivePermission(input.itemId, actor);
+      if (!permission.effectivePermissionLevel) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "You don't have access to this item",
+        });
+      }
+
+      const { getDb } = await import("../db");
+      const { libraryPermissions, users, userGroups } = await import("../../drizzle/schema");
+      const { eq, and, isNull } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const permRows = await db
+        .select()
+        .from(libraryPermissions)
+        .where(
+          and(
+            eq(libraryPermissions.libraryItemId, input.itemId),
+            eq(libraryPermissions.tenantId, tenantIdResolved),
+          ),
+        );
+
+      // Resolve names for each share
+      const shares = await Promise.all(
+        permRows.map(async (p) => {
+          const base = {
+            id: p.id,
+            subjectType: p.subjectType,
+            subjectId: p.subjectId,
+            permissionLevel: p.permissionLevel,
+            expiresAt: p.expiresAt,
+          };
+
+          if (p.subjectType === "user") {
+            const userRows = await db
+              .select({ name: users.name, email: users.email })
+              .from(users)
+              .where(eq(users.id, Number(p.subjectId)))
+              .limit(1);
+            return { ...base, userName: userRows[0]?.name ?? userRows[0]?.email ?? null };
+          }
+
+          if (p.subjectType === "group") {
+            const groupRows = await db
+              .select({ name: userGroups.name })
+              .from(userGroups)
+              .where(and(eq(userGroups.id, Number(p.subjectId)), isNull(userGroups.deletedAt)))
+              .limit(1);
+            return { ...base, groupName: groupRows[0]?.name ?? "Deleted Group" };
+          }
+
+          // tenant_role
+          return { ...base, roleName: p.subjectId };
+        }),
+      );
+
+      return { shares };
+    }),
+
+  listTrash: protectedProcedure
+    .input(
+      z.object({
+        limit: z.number().int().min(1).max(100).default(50),
+        offset: z.number().int().min(0).default(0),
+      }).optional(),
+    )
+    .query(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+
+      const { getDb } = await import("../db");
+      const { libraryItems } = await import("../../drizzle/schema");
+      const { eq, and, isNotNull, desc, sql, count } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      const limit = input?.limit ?? 50;
+      const offset = input?.offset ?? 0;
+
+      const whereCondition = and(
+        eq(libraryItems.tenantId, tenantIdResolved),
+        eq(libraryItems.ownerUserId, ctx.user.id),
+        isNotNull(libraryItems.deletedAt),
+      );
+
+      const [totalRow] = await db
+        .select({ total: count() })
+        .from(libraryItems)
+        .where(whereCondition);
+
+      const rows = await db
+        .select({
+          id: libraryItems.id,
+          title: libraryItems.title,
+          itemType: libraryItems.itemType,
+          source: libraryItems.source,
+          thumbnailUrl: libraryItems.thumbnailUrl,
+          deletedAt: libraryItems.deletedAt,
+          deletedBy: libraryItems.deletedBy,
+        })
+        .from(libraryItems)
+        .where(whereCondition)
+        .orderBy(desc(libraryItems.deletedAt))
+        .limit(limit)
+        .offset(offset);
+
+      const now = Date.now();
+      const items = rows.map((r) => {
+        const deletedAtMs = r.deletedAt ? new Date(r.deletedAt).getTime() : now;
+        const daysInTrash = Math.floor((now - deletedAtMs) / 86_400_000);
+        return {
+          ...r,
+          daysInTrash,
+          daysUntilPurge: Math.max(0, 90 - daysInTrash),
+        };
+      });
+
+      return { items, total: Number(totalRow?.total ?? 0) };
+    }),
+
+  restoreFromTrash: protectedProcedure
+    .input(z.object({ itemId: z.number().int().positive() }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+
+      const { getDb } = await import("../db");
+      const { libraryItems } = await import("../../drizzle/schema");
+      const { eq, and, isNotNull } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      // Get the item in trash
+      const rows = await db
+        .select()
+        .from(libraryItems)
+        .where(
+          and(
+            eq(libraryItems.id, input.itemId),
+            eq(libraryItems.tenantId, tenantIdResolved),
+            isNotNull(libraryItems.deletedAt),
+          ),
+        )
+        .limit(1);
+
+      const item = rows[0];
+      if (!item) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Item not found in trash",
+        });
+      }
+
+      // Only owner or deleter can restore
+      if (item.ownerUserId !== ctx.user.id && item.deletedBy !== ctx.user.id) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "Only the item owner or the person who deleted it can restore",
+        });
+      }
+
+      await db
+        .update(libraryItems)
+        .set({
+          deletedAt: null,
+          deletedBy: null,
+          status: "ready",
+          updatedAt: new Date(),
+        })
+        .where(eq(libraryItems.id, input.itemId));
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.restoreFromTrash",
+        requestType: "mutation",
+        requestPayload: {
+          tenantId: tenantIdResolved,
+          itemId: input.itemId,
+        },
+        responsePayload: { success: true },
+      });
+
+      return { success: true };
+    }),
+
+  permanentDelete: protectedProcedure
+    .input(z.object({ itemId: z.number().int().positive() }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantIdResolved = await resolveLibraryTenantId(ctx);
+      assertLibraryEnabled(tenantIdResolved);
+
+      const { getDb } = await import("../db");
+      const { libraryItems, libraryChunks, libraryPermissions } = await import("../../drizzle/schema");
+      const { eq, and, isNotNull } = await import("drizzle-orm");
+
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
+
+      // Get the item in trash
+      const rows = await db
+        .select()
+        .from(libraryItems)
+        .where(
+          and(
+            eq(libraryItems.id, input.itemId),
+            eq(libraryItems.tenantId, tenantIdResolved),
+            isNotNull(libraryItems.deletedAt),
+          ),
+        )
+        .limit(1);
+
+      const item = rows[0];
+      if (!item) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Item not found in trash",
+        });
+      }
+
+      // Only owner can permanently delete, or admin for items >= 90 days in trash
+      const isOwner = item.ownerUserId === ctx.user.id;
+      const daysInTrash = item.deletedAt
+        ? Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / 86_400_000)
+        : 0;
+      const isAdminWithExpired = ctx.user.role === "admin" && daysInTrash >= 90;
+
+      if (!isOwner && !isAdminWithExpired) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "Only the item owner can permanently delete, or admins for items 90+ days in trash",
+        });
+      }
+
+      // Hard delete cascade in transaction
+      await db.transaction(async (tx) => {
+        await tx.delete(libraryChunks).where(eq(libraryChunks.libraryItemId, input.itemId));
+        await tx.delete(libraryPermissions).where(eq(libraryPermissions.libraryItemId, input.itemId));
+        await tx.delete(libraryItems).where(eq(libraryItems.id, input.itemId));
+      });
+
+      // Note: Storage cleanup (sourceUrl/thumbnailUrl) not yet implemented.
+      // storageDelete does not exist yet — files remain in storage after DB purge.
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: ctx.user.id,
+        endpoint: "library.permanentDelete",
+        requestType: "mutation",
+        requestPayload: {
+          tenantId: tenantIdResolved,
+          itemId: input.itemId,
+          daysInTrash,
+        },
+        responsePayload: { success: true },
+      });
+
       return { success: true };
     }),
 });
