diff --git a/apps/web/server/services/libraryService.test.ts b/apps/web/server/services/libraryService.test.ts
index 73f3615..1e6a92c 100644
--- a/apps/web/server/services/libraryService.test.ts
+++ b/apps/web/server/services/libraryService.test.ts
@@ -384,3 +384,61 @@ describe("uploadLibraryFile", () => {
     expect(mockDb.insert).not.toHaveBeenCalled();
   });
 });
+
+// Section 03: Group Permissions Tests
+describe("libraryService - Group Permissions", () => {
+  describe("rankPermissionLevel", () => {
+    it.todo("returns correct rank for read (1)");
+    it.todo("returns correct rank for write (2)");
+    it.todo("returns correct rank for delete (3)");
+    it.todo("returns correct rank for owner (4)");
+  });
+
+  describe("canManageLibraryItem", () => {
+    it.todo("returns true for owner permission level");
+    it.todo("returns true for delete permission level");
+    it.todo("returns false for write permission level");
+    it.todo("returns false for read permission level");
+  });
+
+  describe("getUserEffectivePermission", () => {
+    it.todo("includes group permissions in resolution");
+    it.todo("returns highest permission level when multiple sources exist");
+    it.todo("returns all permission sources in sources array");
+    it.todo("includes direct user share in sources");
+    it.todo("includes group share in sources with groupName");
+    it.todo("returns null when user has no access");
+    it.todo("handles user in multiple groups with different permissions");
+    it.todo("prioritizes owner over all other sources");
+    it.todo("prioritizes delete over write/read");
+  });
+
+  describe("shareLibraryItem", () => {
+    it.todo("creates permission for subjectType = group");
+    it.todo("validates group exists before creating permission");
+    it.todo("validates group is in same tenant as item");
+    it.todo("rejects when actor lacks delete or owner permission");
+    it.todo("rejects when group is from different tenant (cross-tenant isolation)");
+  });
+
+  describe("softDeleteLibraryItem", () => {
+    it.todo("sets deletedAt timestamp");
+    it.todo("sets deletedBy to actor.userId");
+    it.todo("existing soft deletes remain functional after update");
+  });
+
+  describe("searchLibraryWithPermissions", () => {
+    it.todo("includes files shared via group permissions");
+    it.todo("excludes deleted files (deletedAt IS NOT NULL)");
+    it.todo("filters by owner, direct share, group share, role share, and public");
+    it.todo("handles user with no groups gracefully");
+    it.todo("applies group permissions for user in multiple groups");
+  });
+});
+
+describe("libraryService - Pre-requisite Refactoring", () => {
+  it.todo("hasTenantRoleShare (renamed from hasGroupShare) works with existing data");
+  it.todo("tenantRoleMatches (renamed from groupMatches) filters correctly");
+  it.todo("no references to old hasGroupShare function remain");
+  it.todo("no references to old groupMatches function remain");
+});
diff --git a/apps/web/server/services/libraryService.ts b/apps/web/server/services/libraryService.ts
index 394bb52..435bcf0 100644
--- a/apps/web/server/services/libraryService.ts
+++ b/apps/web/server/services/libraryService.ts
@@ -14,9 +14,12 @@ import {
   libraryItems,
   libraryLinks,
   libraryPermissions,
+  userGroups,
 } from "../../drizzle/schema";
+import { getUserGroups as getGroupsServiceUserGroups } from "./groupsService";
+import type { EffectivePermission, PermissionSource } from "../../shared/types/library";
 
-export type LibraryPermissionLevel = "read" | "write" | "owner";
+export type LibraryPermissionLevel = "read" | "write" | "delete" | "owner";
 export type LibraryVisibility = "private" | "team" | "public";
 export type LibraryItemStatus = "draft" | "ready" | "indexing" | "archived" | "failed";
 export type LibraryTenantId = string | number;
@@ -58,7 +61,7 @@ export interface UpdateLibraryItemInput {
 
 export interface ShareLibraryItemInput {
   itemId: number;
-  subjectType: "user" | "tenant_role";
+  subjectType: "user" | "tenant_role" | "group";
   subjectId: string;
   permissionLevel: LibraryPermissionLevel;
   expiresAt?: Date | null;
@@ -501,6 +504,8 @@ interface LibraryPermissionRow {
 function rankPermissionLevel(permissionLevel: string | null | undefined): number {
   switch (permissionLevel) {
     case "owner":
+      return 4;
+    case "delete":
       return 3;
     case "write":
       return 2;
@@ -533,7 +538,7 @@ function getPermissionLevelForItem(
 ): {
   effectivePermissionLevel: LibraryPermissionLevel | null;
   hasDirectShare: boolean;
-  hasGroupShare: boolean;
+  hasTenantRoleShare: boolean;
 } {
   const now = new Date();
   const relevant = permissions.filter((permission) => {
@@ -546,7 +551,7 @@ function getPermissionLevelForItem(
     return {
       effectivePermissionLevel: null,
       hasDirectShare: false,
-      hasGroupShare: false,
+      hasTenantRoleShare: false,
     };
   }
 
@@ -555,7 +560,7 @@ function getPermissionLevelForItem(
       permission.subjectType === "user" &&
       permission.subjectId === String(actor.userId),
   );
-  const groupMatches = relevant.filter(
+  const tenantRoleMatches = relevant.filter(
     (permission) =>
       permission.subjectType === "tenant_role" &&
       Boolean(actor.role) &&
@@ -564,13 +569,13 @@ function getPermissionLevelForItem(
 
   const highest = selectHighestPermissionLevel([
     ...directMatches.map((permission) => permission.permissionLevel),
-    ...groupMatches.map((permission) => permission.permissionLevel),
+    ...tenantRoleMatches.map((permission) => permission.permissionLevel),
   ]);
 
   return {
     effectivePermissionLevel: highest,
     hasDirectShare: directMatches.length > 0,
-    hasGroupShare: groupMatches.length > 0,
+    hasTenantRoleShare: tenantRoleMatches.length > 0,
   };
 }
 
@@ -610,6 +615,152 @@ async function getUserPermissionLevel(
   return selectHighestPermissionLevel(rows.map((row) => row.permissionLevel));
 }
 
+/**
+ * Get all active groups for a user in their tenant.
+ * Thin wrapper around groupsService.getUserGroups().
+ * Caching is handled in groupsService layer (Redis, 1-minute TTL).
+ */
+async function getUserGroups(
+  userId: number,
+  tenantId: string,
+  dbClient?: DbClient
+): Promise<Array<{ id: number; name: string; role: string }>> {
+  const groups = await getGroupsServiceUserGroups(
+    { userId, tenantId },
+    dbClient
+  );
+  return groups.map(g => ({
+    id: g.id,
+    name: g.name,
+    role: g.role
+  }));
+}
+
+/**
+ * Get user's effective permission for an item across all sources.
+ * Returns the highest permission level and all sources that grant access.
+ * No caching - queries database on every call for immediate permission changes.
+ */
+export async function getUserEffectivePermission(
+  itemId: number,
+  actor: LibraryActor,
+  dbClient?: DbClient,
+): Promise<EffectivePermission> {
+  const db = await resolveDb(dbClient);
+  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
+
+  const sources: PermissionSource[] = [];
+  let highestLevel: 'read' | 'write' | 'delete' | 'owner' | null = null;
+  let highestRank = 0;
+
+  // 1. Check ownership
+  const itemRows = await db
+    .select()
+    .from(libraryItems)
+    .where(
+      and(
+        eq(libraryItems.id, itemId),
+        eq(libraryItems.tenantId, actorTenantId)
+      )
+    )
+    .limit(1);
+
+  const item = itemRows[0];
+
+  if (!item) {
+    return {
+      effectivePermissionLevel: null,
+      sources: []
+    };
+  }
+
+  if (item.ownerUserId === actor.userId) {
+    sources.push({ type: 'owner' });
+    highestLevel = 'owner';
+    highestRank = 4;
+  }
+
+  // 2. Get user's groups (cached in groupsService)
+  const userGroups = await getUserGroups(actor.userId, actorTenantId);
+  const groupIds = userGroups.map(g => g.id);
+
+  // 3. Fetch all permissions for this item
+  const permissions = await db
+    .select()
+    .from(libraryPermissions)
+    .where(
+      and(
+        eq(libraryPermissions.libraryItemId, itemId),
+        eq(libraryPermissions.tenantId, actorTenantId),
+        or(
+          isNull(libraryPermissions.expiresAt),
+          gt(libraryPermissions.expiresAt, new Date())
+        )
+      )
+    );
+
+  // 4. Process direct user share
+  const directShare = permissions.find(
+    (p: { subjectType: string; subjectId: string }) =>
+      p.subjectType === 'user' && p.subjectId === String(actor.userId)
+  );
+  if (directShare) {
+    sources.push({
+      type: 'direct',
+      permissionLevel: directShare.permissionLevel as any,
+      subjectId: directShare.subjectId
+    });
+    const rank = rankPermissionLevel(directShare.permissionLevel);
+    if (rank > highestRank) {
+      highestLevel = directShare.permissionLevel as any;
+      highestRank = rank;
+    }
+  }
+
+  // 5. Process group shares (NEW)
+  const groupShares = permissions.filter(
+    (p: { subjectType: string; subjectId: string }) =>
+      p.subjectType === 'group' && groupIds.includes(Number(p.subjectId))
+  );
+  for (const groupShare of groupShares) {
+    const group = userGroups.find(g => g.id === Number(groupShare.subjectId));
+    sources.push({
+      type: 'group',
+      permissionLevel: groupShare.permissionLevel as any,
+      subjectId: groupShare.subjectId,
+      groupName: group?.name || 'Unknown Group'
+    });
+    const rank = rankPermissionLevel(groupShare.permissionLevel);
+    if (rank > highestRank) {
+      highestLevel = groupShare.permissionLevel as any;
+      highestRank = rank;
+    }
+  }
+
+  // 6. Process tenant role share
+  const roleShare = permissions.find(
+    (p: { subjectType: string; subjectId: string | null }) =>
+      p.subjectType === 'tenant_role' && p.subjectId === actor.role
+  );
+  if (roleShare) {
+    sources.push({
+      type: 'tenant_role',
+      permissionLevel: roleShare.permissionLevel as any,
+      subjectId: roleShare.subjectId
+    });
+    const rank = rankPermissionLevel(roleShare.permissionLevel);
+    if (rank > highestRank) {
+      highestLevel = roleShare.permissionLevel as any;
+      highestRank = rank;
+    }
+  }
+
+  return {
+    effectivePermissionLevel: highestLevel,
+    sources
+  };
+}
+
 export function canReadLibraryItem(
   item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "visibility">,
   actor: LibraryActor,
@@ -631,7 +782,7 @@ export function canManageLibraryItem(
   if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) return false;
   if (actor.role === "admin") return true;
   if (item.ownerUserId === actor.userId) return true;
-  return permissionLevel === "write" || permissionLevel === "owner";
+  return permissionLevel === "write" || permissionLevel === "delete" || permissionLevel === "owner";
 }
 
 async function getLibraryItemRowById(
@@ -927,6 +1078,7 @@ export async function softDeleteLibraryItem(
     .update(libraryItems)
     .set({
       deletedAt: new Date(),
+      deletedBy: actor.userId,
       status: "archived",
       updatedAt: new Date(),
     })
@@ -954,6 +1106,37 @@ export async function shareLibraryItem(
     return false;
   }
 
+  // NEW: Validate group shares
+  if (input.subjectType === 'group') {
+    // 1. Validate group exists
+    const groupRows = await db
+      .select()
+      .from(userGroups)
+      .where(
+        and(
+          eq(userGroups.id, Number(input.subjectId)),
+          isNull(userGroups.deletedAt)
+        )
+      )
+      .limit(1);
+
+    const group = groupRows[0];
+
+    if (!group) {
+      throw new Error('Group not found or has been deleted');
+    }
+
+    // 2. Validate group is in same tenant (cross-tenant isolation)
+    if (group.tenantId !== actorTenantId) {
+      throw new Error('Cannot share with groups from other tenants');
+    }
+
+    // 3. Validate item is in same tenant as group
+    if (existing.tenantId !== group.tenantId) {
+      throw new Error('Cannot share items across tenant boundaries');
+    }
+  }
+
   const now = new Date();
   await db
     .insert(libraryPermissions)
@@ -1057,7 +1240,7 @@ function getDocumentAccessSource(
   actor: LibraryActor,
   permissionInfo: {
     hasDirectShare: boolean;
-    hasGroupShare: boolean;
+    hasTenantRoleShare: boolean;
   },
 ): LibraryDocumentAccessSource {
   if (item.ownerUserId === actor.userId) {
@@ -1068,7 +1251,7 @@ function getDocumentAccessSource(
     return "shared_direct";
   }
 
-  if (permissionInfo.hasGroupShare || item.visibility === "team" || item.visibility === "public") {
+  if (permissionInfo.hasTenantRoleShare || item.visibility === "team" || item.visibility === "public") {
     return "shared_group";
   }
 
@@ -1409,6 +1592,10 @@ export async function searchLibraryItems(
     };
   }
 
+  // Get user's groups for group permission filtering
+  const userGroups = await getUserGroups(actor.userId, actorTenantId);
+  const groupIds = userGroups.map(g => String(g.id));
+
   const [chunkRows, permissionRows] = await Promise.all([
     db
       .select({
@@ -1444,6 +1631,13 @@ export async function searchLibraryItems(
               eq(libraryPermissions.subjectType, "tenant_role"),
               eq(libraryPermissions.subjectId, actor.role || ""),
             ),
+            // NEW: Include group permissions
+            ...(groupIds.length > 0 ? [
+              and(
+                eq(libraryPermissions.subjectType, "group"),
+                inArray(libraryPermissions.subjectId, groupIds),
+              )
+            ] : [])
           ),
           inArray(libraryPermissions.libraryItemId, itemIds),
           or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
diff --git a/apps/web/shared/types/library.ts b/apps/web/shared/types/library.ts
new file mode 100644
index 0000000..c26ce5e
--- /dev/null
+++ b/apps/web/shared/types/library.ts
@@ -0,0 +1,15 @@
+/**
+ * Shared types for library service with group permissions support
+ */
+
+export interface PermissionSource {
+  type: 'owner' | 'direct' | 'group' | 'tenant_role';
+  permissionLevel?: 'read' | 'write' | 'delete' | 'owner';
+  subjectId?: string;
+  groupName?: string;  // Only present for type = 'group'
+}
+
+export interface EffectivePermission {
+  effectivePermissionLevel: 'read' | 'write' | 'delete' | 'owner' | null;
+  sources: PermissionSource[];
+}
