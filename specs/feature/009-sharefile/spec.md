# spec.md — 009-sharefile (Custom Groups & Permission-based File Sharing)

Spec ID: **SSP-SHAREFILE-009**
Spec folder: `specs/feature/009-sharefile/`
Code boundary: `apps/web/server/routers/library.ts`, `apps/web/server/services/libraryService.ts`, `apps/web/client/src/components/library/`, `apps/web/client/src/pages/DocumentManagement.tsx`
Last updated: 2026-02-12

---

## 1) Purpose

สร้างระบบ **Custom Groups & File Sharing** แบบเต็มรูปแบบสำหรับ Document Management ที่รองรับ:

### Core Features
1. **Custom Groups Management**
   - Users สามารถสร้าง group ของตัวเองได้
   - เพิ่ม/ลบ members จาก tenant เดียวกันเข้า group
   - Group creator เป็น group admin อัตโนมัติ
   - User หนึ่งคนอยู่ได้หลาย groups

2. **File Sharing with Permissions**
   - แชร์ไฟล์ให้กับ individual users หรือ groups
   - Permission levels: **Read**, **Write** (update), **Delete** (move to trash)
   - Share dialog UI ใน Document Management
   - แสดงรายชื่อผู้ที่มีสิทธิ์เข้าถึงไฟล์

3. **Permission-based Search & Vector DB**
   - ไฟล์ทุกไฟล์ถูก index ใน vector database
   - Search results กรองตาม permission:
     - ไฟล์ที่ user เป็นเจ้าของ
     - ไฟล์ใน "Shared With Me" (shared direct)
     - ไฟล์ใน "Shared Groups" (groups ที่ user เป็น member)
   - RAG queries รองรับ permission filtering

4. **Trash System (Soft Delete)**
   - ลบไฟล์ = ย้ายเข้า trash (soft delete)
   - ไฟล์ใน trash เก็บไว้อย่างน้อย **90 วัน** (3 เดือน)
   - Restore from trash ได้ภายในระยะเวลา
   - Auto-purge หลัง 90 วัน (permanent delete)

---

## 2) Current State (What Exists)

### ✅ Already Implemented
1. **Basic Sharing Infrastructure**
   - `shareLibraryItem()` function exists in `libraryService.ts:939`
   - `library.shareItem` tRPC endpoint exists at `library.ts:475`
   - `libraryPermissions` table exists with columns: `subjectType`, `subjectId`, `permissionLevel`, `expiresAt`
   - Support for sharing with `subjectType = "user"` (direct) and `subjectType = "tenant_role"` (role-based)

2. **Document Scopes**
   - Three tabs in DocumentLibraryTabs: "My Library", "Shared With Me", "My Group"
   - Backend filtering by scope: `my_library`, `shared_with_me`, `shared_groups`
   - Tenant isolation: all queries filter by `tenantId`

3. **Permission Checking**
   - `getUserPermissionLevel()` function at `libraryService.ts:577`
   - `canManageLibraryItem()` check at `libraryService.ts:485`
   - Permission ranking: owner > write > read

4. **Soft Delete**
   - `libraryItems.deletedAt` column exists
   - `softDeleteLibraryItem()` function at `libraryService.ts:927`
   - Queries filter by `isNull(libraryItems.deletedAt)`

### ❌ Missing Components
1. **No Custom Groups**
   - Only hardcoded roles: "user", "admin", "domain_admin"
   - No `groups` table or `group_members` table
   - No group CRUD operations

2. **No Share UI**
   - No share button in Document Management
   - No share dialog component
   - No permission management UI

3. **No Group Management UI**
   - No UI to create/edit/delete groups
   - No UI to add/remove members
   - No group listing page

4. **No Trash UI**
   - No trash view/tab
   - No restore functionality UI
   - No auto-purge scheduler

5. **No Permission-based Search**
   - Vector DB search doesn't filter by user permissions
   - RAG doesn't respect file access rights

---

## 3) Requirements & Solution Design

### 3.1 Database Schema Changes

#### New Table: `user_groups`
```typescript
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),

  // Group admin (creator)
  ownerId: integer("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Group icon/avatar (optional)
  iconUrl: text("iconUrl"),

  // Group settings (JSON)
  settings: json("settings").$type<{
    visibility?: "private" | "public"; // public = visible to all tenant users
    joinPolicy?: "invite_only" | "request_to_join" | "open";
  }>().default({}),

  // Metadata
  memberCount: integer("memberCount").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deletedAt", { withTimezone: true }), // Soft delete
});

// Unique constraint: one group name per tenant
export const userGroupsUniqueNamePerTenant = unique("user_groups_tenant_name_unique")
  .on(userGroups.tenantId, userGroups.name);
```

#### New Table: `group_members`
```typescript
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),

  groupId: integer("groupId")
    .notNull()
    .references(() => userGroups.id, { onDelete: "cascade" }),

  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Member role in group
  role: varchar("role", { length: 32 }).notNull().default("member"), // "admin" | "member"

  // Who added this member (for audit)
  addedBy: integer("addedBy")
    .references(() => users.id, { onDelete: "set null" }),

  // Membership status
  status: varchar("status", { length: 32 }).notNull().default("active"), // "active" | "pending" | "removed"

  joinedAt: timestamp("joinedAt", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removedAt", { withTimezone: true }),
});

// Unique constraint: one membership per user per group
export const groupMembersUniqueUserGroup = unique("group_members_user_group_unique")
  .on(groupMembers.groupId, groupMembers.userId);
```

#### Update Existing Table: `library_permissions`
```typescript
// Add new subject type for groups
export const libraryPermissions = pgTable("library_permissions", {
  // ... existing columns ...

  // subjectType now supports: "user" | "tenant_role" | "group"
  subjectType: varchar("subjectType", { length: 32 }).notNull(),

  // subjectId interpretation:
  // - If subjectType = "user" → userId (string)
  // - If subjectType = "tenant_role" → role name (string)
  // - If subjectType = "group" → groupId (string)
  subjectId: varchar("subjectId", { length: 64 }).notNull(),

  // Permission levels: "read" | "write" | "delete"
  permissionLevel: varchar("permissionLevel", { length: 32 }).notNull(),

  // ... rest of columns ...
});
```

#### Update Existing Table: `library_items`
```typescript
// Already has deletedAt for soft delete
export const libraryItems = pgTable("library_items", {
  // ... existing columns ...

  // Soft delete timestamp
  deletedAt: timestamp("deletedAt", { withTimezone: true }),

  // Who deleted it (for audit)
  deletedBy: integer("deletedBy")
    .references(() => users.id, { onDelete: "set null" }),
});
```

---

### 3.2 Permission System Design

#### Permission Levels
```typescript
export type PermissionLevel = "read" | "write" | "delete";

// Capability matrix
const PERMISSION_CAPABILITIES = {
  read: {
    viewFile: true,
    downloadFile: true,
    searchFile: true,
    ragQuery: true,
  },
  write: {
    ...PERMISSION_CAPABILITIES.read,
    updateMetadata: true,
    updateContent: true, // For markdown files
    renameFile: true,
  },
  delete: {
    ...PERMISSION_CAPABILITIES.write,
    moveToTrash: true,
    share: true, // Can share to others
  },
  owner: {
    ...PERMISSION_CAPABILITIES.delete,
    permanentDelete: true,
    managePermissions: true,
    transferOwnership: true,
  },
};
```

#### Permission Resolution Order
1. **Owner** (highest) - `item.ownerUserId === actor.userId`
2. **Direct user permission** - `subjectType = "user" AND subjectId = userId`
3. **Group permission** - `subjectType = "group" AND user is member of group`
4. **Role permission** - `subjectType = "tenant_role" AND subjectId = user.role`

```typescript
async function getUserEffectivePermission(
  itemId: number,
  actor: LibraryActor
): Promise<PermissionLevel | null> {
  // 1. Check if owner
  const item = await getLibraryItemById(itemId, actor.tenantId);
  if (item.ownerUserId === actor.userId) {
    return "owner";
  }

  // 2. Get all permissions for this item
  const permissions = await db
    .select()
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actor.tenantId)
      )
    );

  // 3. Filter by actor's identities
  const userGroups = await getUserGroups(actor.userId);
  const groupIds = userGroups.map((g) => g.id);

  const applicablePermissions = permissions.filter((p) => {
    if (p.subjectType === "user" && p.subjectId === String(actor.userId)) {
      return true;
    }
    if (p.subjectType === "group" && groupIds.includes(Number(p.subjectId))) {
      return true;
    }
    if (p.subjectType === "tenant_role" && p.subjectId === actor.role) {
      return true;
    }
    return false;
  });

  // 4. Return highest permission
  const levels = applicablePermissions.map((p) => p.permissionLevel);
  if (levels.includes("delete")) return "delete";
  if (levels.includes("write")) return "write";
  if (levels.includes("read")) return "read";

  return null;
}
```

---

### 3.3 API Endpoints (tRPC)

#### Group Management Router: `groupsRouter`

```typescript
export const groupsRouter = router({
  // List all groups user can see (owns or is member of)
  list: protectedProcedure
    .input(z.object({
      scope: z.enum(["my_groups", "member_of", "all"]).optional(),
      includeDeleted: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => { /* ... */ }),

  // Get single group with members
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => { /* ... */ }),

  // Create new group
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().max(512).optional(),
      settings: z.object({
        visibility: z.enum(["private", "public"]).optional(),
        joinPolicy: z.enum(["invite_only", "request_to_join", "open"]).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Update group
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().max(512).optional(),
      settings: z.object({ /* ... */ }).optional(),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Delete group (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Add member to group
  addMember: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      userId: z.number(),
      role: z.enum(["admin", "member"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Remove member from group
  removeMember: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Update member role
  updateMemberRole: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      userId: z.number(),
      role: z.enum(["admin", "member"]),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // List all users in tenant (for adding to group)
  listTenantUsers: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      excludeGroupId: z.number().optional(), // Exclude users already in this group
    }))
    .query(async ({ input, ctx }) => { /* ... */ }),
});
```

#### Update `libraryRouter` for Sharing

```typescript
export const libraryRouter = router({
  // ... existing endpoints ...

  // Share item with users/groups
  shareItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      shares: z.array(z.object({
        subjectType: z.enum(["user", "group"]),
        subjectId: z.string(), // userId or groupId
        permissionLevel: z.enum(["read", "write", "delete"]),
        expiresAt: z.coerce.date().nullable().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Get all shares for an item
  getItemShares: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ input, ctx }) => { /* ... */ }),

  // Remove share (revoke access)
  removeShare: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      subjectType: z.enum(["user", "group", "tenant_role"]),
      subjectId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Update share permission
  updateSharePermission: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      subjectType: z.enum(["user", "group", "tenant_role"]),
      subjectId: z.string(),
      permissionLevel: z.enum(["read", "write", "delete"]),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Move to trash (soft delete)
  moveToTrash: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // List trash items
  listTrash: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => { /* ... */ }),

  // Restore from trash
  restoreFromTrash: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Permanent delete (admin only, or after 90 days)
  permanentDelete: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),
});
```

---

### 3.4 Frontend Components

#### 3.4.1 Group Management Components

**`apps/web/client/src/pages/GroupManagement.tsx`** (New)
- List of user's groups
- Create new group button
- Search/filter groups
- Navigate to group detail page

**`apps/web/client/src/components/groups/GroupCard.tsx`** (New)
- Display group info (name, member count, icon)
- Quick actions: edit, delete, view members

**`apps/web/client/src/components/groups/GroupDetailPanel.tsx`** (New)
- Group metadata (name, description, settings)
- Member list with roles
- Add member button
- Remove member action
- Update member role action

**`apps/web/client/src/components/groups/CreateGroupDialog.tsx`** (New)
- Form: group name, description, visibility, join policy
- Validation: unique name per tenant

**`apps/web/client/src/components/groups/AddMemberDialog.tsx`** (New)
- Search tenant users (excluding current members)
- Select user(s) to add
- Assign role (admin/member)

#### 3.4.2 File Sharing Components

**`apps/web/client/src/components/library/ShareButton.tsx`** (New)
- Share icon button in DocumentPreviewPanel header
- Opens ShareDialog on click
- Shows count of existing shares (badge)

**`apps/web/client/src/components/library/ShareDialog.tsx`** (New)
- Modal dialog with tabs: "People & Groups" and "Link" (future)
- **People & Groups tab:**
  - List current shares (users/groups) with permission badges
  - Add new share:
    - Search input (users or groups)
    - Dropdown results with avatars
    - Permission level selector (Read/Write/Delete)
    - Add button
  - Existing shares:
    - User/Group name + avatar
    - Permission level dropdown (editable)
    - Remove button (X icon)
- **Owner badge** for file owner (cannot remove)

**`apps/web/client/src/components/library/ShareeRow.tsx`** (New)
- Single row displaying a sharee (user or group)
- Avatar + name
- Permission dropdown
- Remove button
- Expiration date (if set)

#### 3.4.3 Trash Components

**`apps/web/client/src/components/library/TrashPanel.tsx`** (New)
- Tab in DocumentManagement or separate page
- List of deleted items with:
  - File icon + name
  - Deleted date
  - Deleted by (user name)
  - Days until permanent delete (countdown)
- Actions:
  - Restore button
  - Permanent delete button (admin only or after 90 days)
- Empty state: "Trash is empty"

---

### 3.5 Vector Database Integration

#### 3.5.1 Index Files with Metadata

When indexing files to vector DB (ChromaDB/pgvector), include metadata:

```typescript
interface VectorDocumentMetadata {
  libraryItemId: number;
  tenantId: string;
  ownerId: number;
  title: string;
  itemType: string;
  status: string;
  visibility: "private" | "team" | "public";

  // Permission hints (for quick filtering)
  isPublic: boolean; // visibility === "public"

  // These will be checked in real-time during search
  // (metadata is NOT sufficient for permission check)
}
```

#### 3.5.2 Permission-Aware Search

```typescript
async function searchLibraryWithPermissions(
  query: string,
  actor: LibraryActor,
  options: {
    scope?: LibraryDocumentScope;
    limit?: number;
  }
): Promise<LibrarySearchResult[]> {
  // 1. Get raw vector search results
  const vectorResults = await vectorDb.search(query, {
    tenantId: actor.tenantId,
    limit: options.limit * 3, // Over-fetch for filtering
  });

  // 2. Extract item IDs
  const itemIds = vectorResults.map((r) => r.metadata.libraryItemId);

  // 3. Get items from DB
  const items = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.id, itemIds),
        eq(libraryItems.tenantId, actor.tenantId),
        isNull(libraryItems.deletedAt) // Exclude trash
      )
    );

  // 4. Get user's group memberships
  const userGroups = await getUserGroups(actor.userId);
  const groupIds = userGroups.map((g) => g.id);

  // 5. Get permissions for these items
  const permissions = await db
    .select()
    .from(libraryPermissions)
    .where(
      and(
        inArray(libraryPermissions.libraryItemId, itemIds),
        eq(libraryPermissions.tenantId, actor.tenantId)
      )
    );

  // 6. Filter items by permission
  const accessibleItems = items.filter((item) => {
    // Owner always has access
    if (item.ownerUserId === actor.userId) {
      return true;
    }

    // Public items
    if (item.visibility === "public") {
      return true;
    }

    // Check permissions
    const itemPermissions = permissions.filter(
      (p) => p.libraryItemId === item.id
    );

    return itemPermissions.some((p) => {
      if (p.subjectType === "user" && p.subjectId === String(actor.userId)) {
        return true;
      }
      if (p.subjectType === "group" && groupIds.includes(Number(p.subjectId))) {
        return true;
      }
      if (p.subjectType === "tenant_role" && p.subjectId === actor.role) {
        return true;
      }
      return false;
    });
  });

  // 7. Apply scope filter
  const scopeFilteredItems = accessibleItems.filter((item) => {
    if (!options.scope || options.scope === "all") return true;

    if (options.scope === "my_library") {
      return item.ownerUserId === actor.userId;
    }

    if (options.scope === "shared_with_me") {
      const hasDirectShare = permissions.some(
        (p) =>
          p.libraryItemId === item.id &&
          p.subjectType === "user" &&
          p.subjectId === String(actor.userId)
      );
      return hasDirectShare && item.ownerUserId !== actor.userId;
    }

    if (options.scope === "shared_groups") {
      const hasGroupShare = permissions.some(
        (p) =>
          p.libraryItemId === item.id &&
          p.subjectType === "group" &&
          groupIds.includes(Number(p.subjectId))
      );
      return hasGroupShare && item.ownerUserId !== actor.userId;
    }

    return true;
  });

  // 8. Sort by vector similarity and return
  return scopeFilteredItems
    .slice(0, options.limit || 10)
    .map((item) => toLibrarySearchResult(item));
}
```

---

### 3.6 Trash System (Soft Delete)

#### 3.6.1 Move to Trash Flow

```typescript
async function moveToTrash(
  itemId: number,
  actor: LibraryActor
): Promise<void> {
  // 1. Check permission (need "delete" permission)
  const permission = await getUserEffectivePermission(itemId, actor);
  if (!permission || !["delete", "owner"].includes(permission)) {
    throw new Error("Insufficient permission to delete this file");
  }

  // 2. Soft delete
  await db
    .update(libraryItems)
    .set({
      deletedAt: new Date(),
      deletedBy: actor.userId,
    })
    .where(eq(libraryItems.id, itemId));

  // 3. Remove from vector index (optional - or keep for potential restore search)
  // await vectorDb.deleteDocument(itemId);
}
```

#### 3.6.2 Restore from Trash

```typescript
async function restoreFromTrash(
  itemId: number,
  actor: LibraryActor
): Promise<void> {
  // 1. Get item
  const item = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.id, itemId))
    .limit(1);

  if (!item || !item.deletedAt) {
    throw new Error("Item not found in trash");
  }

  // 2. Check permission (owner or original deleter can restore)
  if (item.ownerUserId !== actor.userId && item.deletedBy !== actor.userId) {
    throw new Error("Only owner or deleter can restore this file");
  }

  // 3. Restore
  await db
    .update(libraryItems)
    .set({
      deletedAt: null,
      deletedBy: null,
    })
    .where(eq(libraryItems.id, itemId));

  // 4. Re-index to vector DB
  await reindexLibraryItem(itemId);
}
```

#### 3.6.3 Auto-Purge Scheduler (Cron Job)

**Location:** `apps/web/server/jobs/purgeOldTrashItems.ts` (New)

```typescript
import { CronJob } from "cron";
import { db } from "../db";
import { libraryItems } from "../../drizzle/schema";
import { lt, isNotNull, and } from "drizzle-orm";

const TRASH_RETENTION_DAYS = 90;

export const purgeOldTrashJob = new CronJob(
  "0 2 * * *", // Run daily at 2 AM
  async () => {
    console.log("[Trash Purge] Starting auto-purge of old trash items...");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - TRASH_RETENTION_DAYS);

    try {
      const dbInstance = await db.instance;

      // Find items deleted more than 90 days ago
      const oldTrashItems = await dbInstance
        .select({ id: libraryItems.id })
        .from(libraryItems)
        .where(
          and(
            isNotNull(libraryItems.deletedAt),
            lt(libraryItems.deletedAt, cutoffDate)
          )
        );

      if (oldTrashItems.length === 0) {
        console.log("[Trash Purge] No items to purge");
        return;
      }

      console.log(`[Trash Purge] Found ${oldTrashItems.length} items to purge`);

      // Permanent delete (hard delete)
      for (const item of oldTrashItems) {
        // 1. Delete from vector DB
        await vectorDb.deleteDocument(item.id);

        // 2. Delete chunks
        await dbInstance
          .delete(libraryChunks)
          .where(eq(libraryChunks.libraryItemId, item.id));

        // 3. Delete permissions
        await dbInstance
          .delete(libraryPermissions)
          .where(eq(libraryPermissions.libraryItemId, item.id));

        // 4. Delete the item
        await dbInstance
          .delete(libraryItems)
          .where(eq(libraryItems.id, item.id));
      }

      console.log(`[Trash Purge] Successfully purged ${oldTrashItems.length} items`);
    } catch (error) {
      console.error("[Trash Purge] Error:", error);
    }
  },
  null, // onComplete
  false, // start (will be started manually)
  "America/Los_Angeles" // timezone
);

// Start the job
purgeOldTrashJob.start();
```

**Registration in `apps/web/server/index.ts`:**

```typescript
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./context";
import { purgeOldTrashJob } from "./jobs/purgeOldTrashItems";

const app = express();
const PORT = process.env.PORT || 3000;

// ... middleware setup ...

// tRPC middleware
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);

  // Start cron jobs after server is ready
  purgeOldTrashJob.start();
  console.log("✅ Trash auto-purge job started (runs daily at 2 AM)");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");

  // Stop cron jobs
  purgeOldTrashJob.stop();
  console.log("✅ Trash auto-purge job stopped");

  // Close server
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
```

---

## 3.7) UI Component Mockups & Visual Structure

### 3.7.1 ShareDialog Component Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Share "Marketing Plan Q1.docx"                          [X] │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [People & Groups] [Link Sharing (Future)]            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search people or groups...                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Who has access                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 John Doe (You)                    [Owner]     [👑]  │ │
│ │ 👤 Jane Smith                        [▼ Write]   [✕]  │ │
│ │ 👥 Marketing Team (5 members)       [▼ Read]    [✕]  │ │
│ │ 👤 Mike Johnson                      [▼ Delete]  [✕]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                                      [Cancel] [Save Changes]│
└─────────────────────────────────────────────────────────────┘

Permission Dropdown Options:
┌──────────────────┐
│ ✓ Read Only      │  ← View & download only
│   Write          │  ← Edit metadata & content
│   Delete         │  ← Can move to trash + share
│   Remove Access  │  ← Revoke permission
└──────────────────┘
```

### 3.7.2 GroupManagement Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ My Groups                                   [+ Create Group] │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [My Groups] [Member Of] [All Groups]                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│ │  👥          │  │  👥          │  │  👥          │      │
│ │ Marketing    │  │ Engineering  │  │ Design Team  │      │
│ │ Team         │  │ Team         │  │              │      │
│ │              │  │              │  │              │      │
│ │ 12 members   │  │ 8 members    │  │ 5 members    │      │
│ │ [Manage]     │  │ [Manage]     │  │ [View]       │      │
│ └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.7.3 GroupDetailPanel Component Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Groups                                            │
├─────────────────────────────────────────────────────────────┤
│ 👥 Marketing Team                          [Edit] [Delete]  │
│ Created by John Doe • 12 members                            │
│                                                             │
│ Description:                                                │
│ Collaboration group for marketing campaigns and content.    │
│                                                             │
│ Settings:                                                   │
│ • Visibility: Private                                       │
│ • Join Policy: Invite Only                                  │
├─────────────────────────────────────────────────────────────┤
│ Members (12)                               [+ Add Members]  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 John Doe               [Admin]            [Change]   │ │
│ │ 👤 Jane Smith             [Member]           [Remove]   │ │
│ │ 👤 Mike Johnson           [Member]           [Remove]   │ │
│ │ 👤 Sarah Williams         [Admin]            [Change]   │ │
│ │ ... (8 more)                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.7.4 TrashPanel Component Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🗑️ Trash                                   [Empty Trash]    │
├─────────────────────────────────────────────────────────────┤
│ Items will be permanently deleted after 90 days.            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📄 Marketing Plan Q1.docx                              │ │
│ │    Deleted by You • 5 days ago • 85 days remaining     │ │
│ │                                   [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 📊 Sales Report.xlsx                                   │ │
│ │    Deleted by John Doe • 15 days ago • 75 days left    │ │
│ │                                   [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 🖼️ Logo Design.png                                     │ │
│ │    Deleted by You • 89 days ago • 1 day remaining ⚠️   │ │
│ │                                   [Restore] [Delete]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Empty State (if no items):                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              🗑️                                          │ │
│ │         Trash is empty                                  │ │
│ │   Deleted items will appear here                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 3.7.5 Share Button in DocumentPreviewPanel

```
DocumentPreviewPanel Header:
┌─────────────────────────────────────────────────────────────┐
│ 📄 Marketing Plan Q1.docx          [↓] [🔗] [👥 3] [⋮]    │
│                                           ↑               │
│                                    Share button with       │
│                                    badge showing 3 people  │
│                                    have access             │
└─────────────────────────────────────────────────────────────┘
```

### 3.7.6 Permission Badges in Document List

```
Document Grid Item:
┌──────────────────────┐
│ 📄                   │
│ Marketing Plan.docx  │
│                      │
│ Shared by John Doe   │  ← Shows if not owner
│ [👁️ Read Only]       │  ← Permission badge
└──────────────────────┘

Badge Colors:
• Owner: Purple gradient (👑)
• Delete: Red/Pink (🗑️)
• Write: Orange (✏️)
• Read: Blue (👁️)
```

---

## 3.8) Error Handling Strategy

### 3.8.1 API Error Responses

All tRPC endpoints MUST return consistent error formats:

```typescript
// Error Types
export enum ShareErrorCode {
  PERMISSION_DENIED = "PERMISSION_DENIED",
  ITEM_NOT_FOUND = "ITEM_NOT_FOUND",
  GROUP_NOT_FOUND = "GROUP_NOT_FOUND",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  TENANT_MISMATCH = "TENANT_MISMATCH",
  INVALID_PERMISSION_LEVEL = "INVALID_PERMISSION_LEVEL",
  SHARE_LIMIT_EXCEEDED = "SHARE_LIMIT_EXCEEDED",
  GROUP_MEMBER_LIMIT = "GROUP_MEMBER_LIMIT",
  DUPLICATE_SHARE = "DUPLICATE_SHARE",
  SELF_SHARE_NOT_ALLOWED = "SELF_SHARE_NOT_ALLOWED",
  CANNOT_REMOVE_OWNER = "CANNOT_REMOVE_OWNER",
  TRASH_ITEM_NOT_FOUND = "TRASH_ITEM_NOT_FOUND",
  ITEM_NOT_IN_TRASH = "ITEM_NOT_IN_TRASH",
  RESTORE_PERMISSION_DENIED = "RESTORE_PERMISSION_DENIED",
}

// Error Response Format
interface ShareErrorResponse {
  code: ShareErrorCode;
  message: string;
  details?: Record<string, any>;
  userMessage?: string; // User-friendly message for UI display
}

// Example Usage in Router
export const shareItem = protectedProcedure
  .input(shareItemSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      // Check if user has delete permission (required to share)
      const permission = await getUserEffectivePermission(
        input.itemId,
        ctx.actor
      );

      if (!permission || !["delete", "owner"].includes(permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: ShareErrorCode.PERMISSION_DENIED,
          cause: {
            userMessage: "You don't have permission to share this file. Only users with Delete or Owner permission can share.",
            requiredPermission: "delete",
            currentPermission: permission || "none",
          },
        });
      }

      // Check share limit (max 20 shares per item)
      const existingShares = await getItemShareCount(input.itemId);
      if (existingShares + input.shares.length > 20) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ShareErrorCode.SHARE_LIMIT_EXCEEDED,
          cause: {
            userMessage: "This file has reached the maximum of 20 shares.",
            currentShares: existingShares,
            limit: 20,
          },
        });
      }

      // Validate subjects exist and are in same tenant
      for (const share of input.shares) {
        if (share.subjectType === "group") {
          const group = await getGroupById(Number(share.subjectId));
          if (!group) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: ShareErrorCode.GROUP_NOT_FOUND,
              cause: {
                userMessage: "The group you're trying to share with doesn't exist.",
                groupId: share.subjectId,
              },
            });
          }
          if (group.tenantId !== ctx.actor.tenantId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: ShareErrorCode.TENANT_MISMATCH,
              cause: {
                userMessage: "You can only share with groups in your organization.",
              },
            });
          }
        }

        if (share.subjectType === "user") {
          const user = await getUserById(Number(share.subjectId));
          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: ShareErrorCode.USER_NOT_FOUND,
              cause: {
                userMessage: "The user you're trying to share with doesn't exist.",
                userId: share.subjectId,
              },
            });
          }
          if (user.tenantId !== ctx.actor.tenantId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: ShareErrorCode.TENANT_MISMATCH,
              cause: {
                userMessage: "You can only share with users in your organization.",
              },
            });
          }
          // Prevent self-sharing
          if (user.id === ctx.actor.userId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: ShareErrorCode.SELF_SHARE_NOT_ALLOWED,
              cause: {
                userMessage: "You already own this file.",
              },
            });
          }
        }
      }

      // Create shares
      await shareLibraryItem(input.itemId, input.shares, ctx.actor);

      return { success: true, sharesCreated: input.shares.length };
    } catch (error) {
      // Re-throw TRPCError as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Wrap unknown errors
      console.error("Unexpected error in shareItem:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while sharing the file.",
        cause: error,
      });
    }
  });
```

### 3.8.2 Frontend Error Handling

```typescript
// Error Display Component
interface ErrorToastProps {
  error: TRPCClientError<any>;
}

function showShareError(error: TRPCClientError<any>) {
  const cause = error.data?.cause;
  const userMessage = cause?.userMessage || error.message;

  // Map error codes to user-friendly actions
  const errorActions: Record<string, { message: string; action?: string }> = {
    PERMISSION_DENIED: {
      message: userMessage,
      action: "Contact the file owner to request access.",
    },
    ITEM_NOT_FOUND: {
      message: "This file no longer exists or has been deleted.",
      action: "Refresh the page to see updated files.",
    },
    GROUP_NOT_FOUND: {
      message: userMessage,
      action: "The group may have been deleted. Try selecting a different group.",
    },
    SHARE_LIMIT_EXCEEDED: {
      message: userMessage,
      action: "Remove some existing shares before adding new ones.",
    },
    TENANT_MISMATCH: {
      message: userMessage,
      action: "Only users and groups in your organization can be added.",
    },
  };

  const errorInfo = errorActions[error.message] || {
    message: userMessage,
  };

  toast.error(errorInfo.message, {
    description: errorInfo.action,
    duration: 5000,
  });
}

// Usage in Component
const shareItemMutation = trpc.library.shareItem.useMutation({
  onSuccess: () => {
    toast.success("File shared successfully");
    refetchShares();
    closeDialog();
  },
  onError: (error) => {
    showShareError(error);
  },
});
```

### 3.8.3 Group Operation Error Handling

```typescript
// Group Creation Errors
export const createGroup = protectedProcedure
  .input(createGroupSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      // Check group creation limit
      const userGroupCount = await getUserGroupCount(ctx.actor.userId);
      if (userGroupCount >= 50) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GROUP_CREATION_LIMIT",
          cause: {
            userMessage: "You've reached the maximum of 50 groups.",
            currentCount: userGroupCount,
            limit: 50,
          },
        });
      }

      // Check for duplicate group name in tenant
      const existingGroup = await getGroupByName(input.name, ctx.actor.tenantId);
      if (existingGroup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "DUPLICATE_GROUP_NAME",
          cause: {
            userMessage: `A group named "${input.name}" already exists in your organization.`,
            existingGroupId: existingGroup.id,
          },
        });
      }

      const group = await createUserGroup(input, ctx.actor);
      return group;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create group",
        cause: error,
      });
    }
  });

// Add Member Errors
export const addMember = protectedProcedure
  .input(addMemberSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      // Check if user is group admin
      const isAdmin = await isGroupAdmin(input.groupId, ctx.actor.userId);
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "GROUP_ADMIN_REQUIRED",
          cause: {
            userMessage: "Only group admins can add members.",
          },
        });
      }

      // Check member limit
      const memberCount = await getGroupMemberCount(input.groupId);
      if (memberCount >= 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GROUP_MEMBER_LIMIT",
          cause: {
            userMessage: "This group has reached the maximum of 100 members.",
            currentCount: memberCount,
            limit: 100,
          },
        });
      }

      // Check if user is already a member
      const isMember = await isUserInGroup(input.groupId, input.userId);
      if (isMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "ALREADY_MEMBER",
          cause: {
            userMessage: "This user is already a member of this group.",
          },
        });
      }

      await addGroupMember(input.groupId, input.userId, input.role, ctx.actor.userId);
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add member",
        cause: error,
      });
    }
  });
```

### 3.8.4 Trash Operation Error Handling

```typescript
// Move to Trash Errors
export const moveToTrash = protectedProcedure
  .input(z.object({ itemId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    try {
      // Check permission
      const permission = await getUserEffectivePermission(input.itemId, ctx.actor);
      if (!permission || !["delete", "owner"].includes(permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: ShareErrorCode.PERMISSION_DENIED,
          cause: {
            userMessage: "You don't have permission to delete this file.",
            requiredPermission: "delete",
            currentPermission: permission || "none",
          },
        });
      }

      // Check if already in trash
      const item = await getLibraryItemById(input.itemId, ctx.actor.tenantId);
      if (item.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ALREADY_IN_TRASH",
          cause: {
            userMessage: "This file is already in the trash.",
          },
        });
      }

      await softDeleteLibraryItem(input.itemId, ctx.actor.userId);
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to move item to trash",
        cause: error,
      });
    }
  });

// Restore from Trash Errors
export const restoreFromTrash = protectedProcedure
  .input(z.object({ itemId: z.number() }))
  .mutation(async ({ input, ctx }) => {
    try {
      const item = await getLibraryItemById(input.itemId, ctx.actor.tenantId);

      // Check if item is in trash
      if (!item.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ShareErrorCode.ITEM_NOT_IN_TRASH,
          cause: {
            userMessage: "This file is not in the trash.",
          },
        });
      }

      // Check if auto-purge date has passed
      const daysSinceDeletion = Math.floor(
        (Date.now() - item.deletedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceDeletion > 90) {
        throw new TRPCError({
          code: "GONE",
          message: "TRASH_EXPIRED",
          cause: {
            userMessage: "This file has been permanently deleted and cannot be restored.",
            deletedAt: item.deletedAt,
            daysSinceDeletion,
          },
        });
      }

      // Check permission (owner or deleter can restore)
      if (item.ownerUserId !== ctx.actor.userId && item.deletedBy !== ctx.actor.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: ShareErrorCode.RESTORE_PERMISSION_DENIED,
          cause: {
            userMessage: "Only the owner or the person who deleted this file can restore it.",
          },
        });
      }

      await restoreLibraryItem(input.itemId);
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to restore item",
        cause: error,
      });
    }
  });
```

### 3.8.5 Error Logging & Monitoring

```typescript
// Centralized Error Logger
export function logShareError(
  error: Error,
  context: {
    operation: string;
    userId: number;
    tenantId: string;
    itemId?: number;
    groupId?: number;
  }
) {
  console.error("[ShareFile Error]", {
    timestamp: new Date().toISOString(),
    operation: context.operation,
    userId: context.userId,
    tenantId: context.tenantId,
    itemId: context.itemId,
    groupId: context.groupId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });

  // Send to monitoring service (Sentry, LogRocket, etc.)
  // monitoringService.captureException(error, { context });
}

// Usage
try {
  await shareLibraryItem(itemId, shares, actor);
} catch (error) {
  logShareError(error as Error, {
    operation: "shareLibraryItem",
    userId: actor.userId,
    tenantId: actor.tenantId,
    itemId,
  });
  throw error;
}
```

---

## 4) Implementation Phases

### Phase 1: Database Schema & Backend Foundation (Week 1)
**Goal:** ตั้งต้น infrastructure สำหรับ groups และ permissions

- [ ] Create migration for `user_groups` table
- [ ] Create migration for `group_members` table
- [ ] Update `library_permissions` to support `subjectType = "group"`
- [ ] Update `library_items` to add `deletedBy` column
- [ ] Implement `groupsService.ts` with CRUD functions
- [ ] Implement `groupsRouter.ts` with all endpoints
- [ ] Update `libraryService.ts`:
  - [ ] `getUserGroups(userId)` helper
  - [ ] `getUserEffectivePermission()` to check group permissions
  - [ ] Update `shareLibraryItem()` to support group shares
- [ ] Unit tests for group service
- [ ] Integration tests for sharing with groups

### Phase 2: Group Management UI (Week 2)
**Goal:** User สามารถสร้างและจัดการ groups ได้

- [ ] Create `GroupManagement.tsx` page
- [ ] Create `GroupCard.tsx` component
- [ ] Create `GroupDetailPanel.tsx` component
- [ ] Create `CreateGroupDialog.tsx` component
- [ ] Create `AddMemberDialog.tsx` component
- [ ] Add route `/groups` to navigation
- [ ] Connect to tRPC endpoints
- [ ] UI tests for group creation flow

### Phase 3: File Sharing UI (Week 3)
**Goal:** User สามารถแชร์ไฟล์ได้ผ่าน UI

- [ ] Create `ShareButton.tsx` in DocumentPreviewPanel
- [ ] Create `ShareDialog.tsx` with tabs
- [ ] Create `ShareeRow.tsx` component
- [ ] Implement user/group search in ShareDialog
- [ ] Implement permission level selector
- [ ] Connect to `library.shareItem` mutation
- [ ] Connect to `library.getItemShares` query
- [ ] Connect to `library.removeShare` mutation
- [ ] Update DocumentPreviewPanel to show share button
- [ ] UI tests for sharing flow

### Phase 4: Permission-based Search & Vector DB (Week 4)
**Goal:** Search รองรับ permission filtering

- [ ] Update vector indexing to include metadata
- [ ] Implement `searchLibraryWithPermissions()` in libraryService
- [ ] Update `library.search` endpoint to use permission filtering
- [ ] Update frontend search to use new endpoint
- [ ] Test search results respect permissions
- [ ] Performance optimization for permission checks

### Phase 5: Trash System (Week 5)
**Goal:** Soft delete และ trash management

- [ ] Implement `moveToTrash()` in libraryService
- [ ] Implement `restoreFromTrash()` in libraryService
- [ ] Implement `permanentDelete()` in libraryService
- [ ] Create `TrashPanel.tsx` component
- [ ] Add "Trash" tab to DocumentManagement
- [ ] Create auto-purge cron job
- [ ] Add restore button in TrashPanel
- [ ] Add permanent delete button (admin only)
- [ ] Test trash retention and auto-purge

### Phase 6: Integration & Polish (Week 6)
**Goal:** รวม features ทั้งหมดและ polish UX

- [ ] Update DocumentManagement tabs to reflect shared counts
- [ ] Add permission badges in DocumentGridList
- [ ] Add "Shared by me" view (optional)
- [ ] Performance optimization for permission queries
- [ ] Add loading states and error handling
- [ ] Add toast notifications for share actions
- [ ] End-to-end testing
- [ ] Documentation and user guide

---

## 5) Security Considerations

### 5.1 Tenant Isolation
- **CRITICAL:** All group operations MUST filter by `tenantId`
- Users can ONLY see/join groups in their own tenant
- Group members MUST be from the same tenant
- File sharing MUST respect tenant boundaries

### 5.2 Permission Validation
- Always check `getUserEffectivePermission()` before allowing actions
- Never trust client-side permission checks
- Validate permission levels: read < write < delete < owner
- Check expiration dates on permissions

### 5.3 Group Admin Authorization
- Only group owner or admins can:
  - Add/remove members
  - Update group settings
  - Delete group
- Validate group membership before allowing actions

### 5.4 Rate Limiting
- Limit group creation: max 50 groups per user
- Limit member additions: max 100 members per group
- Limit share actions: max 20 shares per minute per user

---

## 6) Performance Optimization

### 6.1 Database Indexes
```sql
-- Groups
CREATE INDEX idx_user_groups_tenant ON user_groups(tenantId) WHERE deletedAt IS NULL;
CREATE INDEX idx_user_groups_owner ON user_groups(ownerId) WHERE deletedAt IS NULL;

-- Group members
CREATE INDEX idx_group_members_group ON group_members(groupId) WHERE status = 'active';
CREATE INDEX idx_group_members_user ON group_members(userId) WHERE status = 'active';

-- Permissions
CREATE INDEX idx_library_permissions_item ON library_permissions(libraryItemId);
CREATE INDEX idx_library_permissions_subject ON library_permissions(subjectType, subjectId);

-- Trash
CREATE INDEX idx_library_items_trash ON library_items(deletedAt) WHERE deletedAt IS NOT NULL;
```

### 6.2 Caching Strategy
- Cache user's group memberships in Redis (TTL: 5 minutes)
- Cache permission checks for frequently accessed files (TTL: 1 minute)
- Invalidate cache on group membership changes

### 6.3 Query Optimization
- Use `inArray()` for batch permission checks
- Eager load group memberships when listing files
- Use pagination for large result sets
- Pre-compute `memberCount` in `user_groups` table

---

## 7) Acceptance Criteria

### 7.1 Functional Requirements
- [x] User can create custom groups
- [x] User can add/remove members from groups they own
- [x] User can belong to multiple groups
- [x] User can share files with individual users
- [x] User can share files with groups
- [x] Permission levels work: Read, Write, Delete
- [x] Search respects user permissions
- [x] Vector DB search filters by accessible files
- [x] Delete moves to trash (soft delete)
- [x] Trash retains items for 90 days
- [x] Auto-purge removes items after 90 days
- [x] Restore from trash works

### 7.2 Security Requirements
- [x] All operations are tenant-isolated
- [x] Permission checks prevent unauthorized access
- [x] Only group admins can manage group
- [x] Only owners can transfer ownership
- [x] Rate limiting prevents abuse

### 7.3 Performance Requirements
- [x] Permission check completes in < 100ms
- [x] Group list loads in < 500ms
- [x] Search with permissions completes in < 1s
- [x] Sharing action completes in < 200ms

### 7.4 UX Requirements
- [x] Clear visual indicators for shared files
- [x] Intuitive share dialog
- [x] Group management is easy to navigate
- [x] Trash shows days until permanent delete
- [x] Loading states for all async actions
- [x] Error messages are helpful

---

## 8) Key Files

### Backend
- `apps/web/drizzle/schema.ts` - Database schema
- `apps/web/server/services/groupsService.ts` - Group CRUD logic (NEW)
- `apps/web/server/services/libraryService.ts` - Updated for group permissions
- `apps/web/server/routers/groupsRouter.ts` - Group management API (NEW)
- `apps/web/server/routers/library.ts` - Updated sharing endpoints
- `apps/web/server/jobs/purgeOldTrashItems.ts` - Trash auto-purge job (NEW)

### Frontend
- `apps/web/client/src/pages/GroupManagement.tsx` - Group management page (NEW)
- `apps/web/client/src/pages/DocumentManagement.tsx` - Updated with share button and trash tab
- `apps/web/client/src/components/groups/` - Group management components (NEW)
- `apps/web/client/src/components/library/ShareDialog.tsx` - File sharing UI (NEW)
- `apps/web/client/src/components/library/TrashPanel.tsx` - Trash management UI (NEW)

### Migrations
- `apps/web/drizzle/0XXX_add_user_groups.sql` - Create user_groups table
- `apps/web/drizzle/0XXX_add_group_members.sql` - Create group_members table
- `apps/web/drizzle/0XXX_update_library_permissions.sql` - Update for group support
- `apps/web/drizzle/0XXX_add_deletedBy_to_library_items.sql` - Add deletedBy column

---

## 9) Testing Strategy

### Unit Tests
- `groupsService.test.ts` - Group CRUD operations
- `libraryService.test.ts` - Permission resolution with groups
- `permissionCheck.test.ts` - All permission scenarios

### Integration Tests
- `groupSharing.integration.test.ts` - End-to-end group sharing flow
- `trashManagement.integration.test.ts` - Trash and restore operations
- `permissionSearch.integration.test.ts` - Search with permission filtering

### E2E Tests
- Create group → Add members → Share file → Verify access
- Delete file → View in trash → Restore → Verify restored
- Search files → Verify results respect permissions

---

## 10) Migration Guide

### For Existing Users
1. **Auto-migration of role-based shares:**
   - Existing `subjectType = "tenant_role"` shares remain unchanged
   - Users can still view files shared with their role
   - No breaking changes to existing functionality

2. **Data preservation:**
   - All existing library items preserved
   - All existing permissions preserved
   - No data loss during migration

### Database Migration Checklist
- [ ] Backup production database before migration
- [ ] Run migrations in staging environment first
- [ ] Verify all existing shares still work
- [ ] Monitor performance after migration
- [ ] Document rollback procedure

---

## 11) Future Enhancements (Out of Scope)

- [ ] Share via public link (read-only, expirable)
- [ ] Group templates (pre-defined group types)
- [ ] Activity log for file access
- [ ] Email notifications for shares
- [ ] Group-level storage quotas
- [ ] Advanced permission: "Can share" (separate from delete)
- [ ] Bulk share operations
- [ ] Group hierarchies (nested groups)

---

## 12) Dependencies

### New NPM Packages
- None required (using existing dependencies)

### External Services
- Vector database (ChromaDB or pgvector) - already configured
- Redis (for caching) - already configured
- Cron scheduler (node-cron) - may need to add

---

## 13) Rollout Plan

### Alpha (Internal Testing)
- Deploy to staging environment
- Test with 5-10 internal users
- Verify all features work
- Collect feedback

### Beta (Limited Release)
- Enable for 10% of users
- Monitor performance metrics
- Fix critical bugs
- Iterate based on feedback

### General Availability
- Enable for all users
- Announce feature in changelog
- Provide user documentation
- Monitor adoption metrics

---

## Appendix A: Permission Matrix

| Action | Read | Write | Delete | Owner |
|--------|------|-------|--------|-------|
| View file | ✅ | ✅ | ✅ | ✅ |
| Download file | ✅ | ✅ | ✅ | ✅ |
| Search/find file | ✅ | ✅ | ✅ | ✅ |
| RAG query | ✅ | ✅ | ✅ | ✅ |
| Update metadata | ❌ | ✅ | ✅ | ✅ |
| Edit content | ❌ | ✅ | ✅ | ✅ |
| Rename file | ❌ | ✅ | ✅ | ✅ |
| Move to trash | ❌ | ❌ | ✅ | ✅ |
| Share with others | ❌ | ❌ | ✅ | ✅ |
| Manage permissions | ❌ | ❌ | ❌ | ✅ |
| Permanent delete | ❌ | ❌ | ❌ | ✅ |
| Transfer ownership | ❌ | ❌ | ❌ | ✅ |

---

## Appendix B: API Examples

### Create Group
```typescript
const newGroup = await trpc.groups.create.mutate({
  name: "Marketing Team",
  description: "Marketing department collaboration group",
  settings: {
    visibility: "private",
    joinPolicy: "invite_only",
  },
});
```

### Add Member to Group
```typescript
await trpc.groups.addMember.mutate({
  groupId: 123,
  userId: 456,
  role: "member",
});
```

### Share File with Group
```typescript
await trpc.library.shareItem.mutate({
  itemId: 789,
  shares: [
    {
      subjectType: "group",
      subjectId: "123",
      permissionLevel: "write",
    },
  ],
});
```

### Search with Permissions
```typescript
const results = await trpc.library.search.query({
  query: "marketing plan",
  scope: "shared_groups", // Only files shared via groups
  limit: 20,
});
```

---

**End of Specification**
