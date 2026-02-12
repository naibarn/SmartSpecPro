# Complete Specification: Custom Groups & Permission-based File Sharing

**Feature ID:** SSP-SHAREFILE-009
**Spec Version:** 1.0 (Deep-Plan Enhanced)
**Last Updated:** 2026-02-12
**Planning Directory:** `specs/feature/009-sharefile/`

---

## Document Purpose

This is the COMPLETE specification for the Custom Groups & Permission-based File Sharing feature, combining:
- Original requirements from `spec.md`
- Codebase research findings (`claude-research.md`)
- User clarifications from interview (`claude-interview.md`)

This document serves as the SOURCE OF TRUTH for implementation.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Features](#core-features)
3. [Current State Analysis](#current-state-analysis)
4. [Requirements & Solution Design](#requirements--solution-design)
5. [Implementation Priorities](#implementation-priorities)
6. [Testing Strategy](#testing-strategy)
7. [Security & Performance](#security--performance)
8. [Rollout Plan](#rollout-plan)

---

## Executive Summary

### Purpose

Create a **full-featured Custom Groups & File Sharing system** for Document Management with:
- **Custom user groups** (user-created, not just hardcoded roles)
- **Granular permission system** (read, write, delete, owner hierarchy)
- **Group-based file sharing** (share files with entire groups)
- **Permission-aware vector search** (RAG respects access control)
- **90-day trash system** with auto-purge

### Business Value

- **Collaboration:** Users can organize into teams and share documents easily
- **Security:** Granular permissions prevent unauthorized access
- **Productivity:** Group sharing is faster than individual shares
- **Compliance:** 90-day trash retention meets data recovery requirements
- **Scale:** Designed for tenants with 100+ users, 50+ groups, 1000+ files

### Key Decisions from Interview

| Decision | Impact |
|----------|--------|
| Notifications: In-app + Email | Need notification system implementation |
| Permission changes: Immediate effect | No caching, always query permissions |
| Scale target: Large (1000+ files) | Requires performance optimization (indexes, caching) |
| Group visibility: Public groups searchable | Need group discovery UI |
| Trash: Owner's trash only | Sharees don't see deleted files |
| Group deletion: Remove all permissions | Cascading delete on permissions |
| Audit log: Admin only | Use existing audit logger |
| Search UI: Users separate from groups | Two search inputs in Share Dialog |
| Permission display: Show all sources | Multiple badges or tooltip |

---

## Core Features

### 1. Custom Groups Management

**User Can:**
- Create custom groups (up to 50 per user)
- Name and describe groups
- Add/remove members from same tenant (up to 100 per group)
- Assign member roles (admin, member)
- Set group visibility (private, public)
- Set join policy (invite_only, request_to_join, open)
- **Leave groups voluntarily** (except owner)
- Delete groups (soft delete with 90-day retention? TBD)

**Automatic Behavior:**
- Group creator becomes group admin automatically
- User can belong to multiple groups
- **When group is deleted: ALL permissions granted through group are immediately removed**

**Public Groups (Confirmed in Interview):**
- Users can search for public groups by name/description
- Join policies:
  - **invite_only:** Can't request, must be invited
  - **request_to_join:** Can request, admin approves
  - **open:** Can join immediately without approval

---

### 2. File Sharing with Permissions

**Permission Levels (Hierarchy: Owner > Delete > Write > Read):**

| Level | Capabilities |
|-------|--------------|
| **Read** | View file, download, search/find file, use in RAG queries |
| **Write** | All Read + update metadata, edit content, rename file |
| **Delete** | All Write + move to trash, share with others |
| **Owner** | All Delete + permanent delete, manage permissions, transfer ownership |

**Sharing Mechanisms:**
1. **Direct user share:** Share with individual users
2. **Group share:** Share with entire group (all members get access)
3. **Role-based share:** Share with tenant role (existing: "user", "admin", "domain_admin")

**Share Dialog UI:**
- Search for people (users only in search box, **not mixed with groups**)
- Select groups from separate dropdown/section
- Set permission level per share
- Optional expiration date
- View existing shares with permission badges
- Remove shares (revoke access)

**Who Has Access Section:**
- Owner badge (cannot remove)
- **Display ALL permission sources** (e.g., if user has "read" direct + "write" via group, show both)
  - Option 1: Multiple badges side-by-side
  - Option 2: Single highest badge with tooltip showing all sources
- Permission level dropdowns (editable for non-owners)
- Remove button (X icon)

---

### 3. Permission-based Search & Vector DB

**Search Behavior:**
- **Files in trash are EXCLUDED from all searches** (confirmed in interview)
- Search results filtered by user's effective permissions:
  - Files user owns
  - Files in "Shared With Me" (direct share)
  - Files in "Shared Groups" (groups user is member of)
- RAG queries respect same permission filtering

**Performance Expectations (from research):**
- Permission filtering adds **3-8x overhead**
- With 1000+ files, search may take 200-800ms
- Mitigation: Pre-filter by tenant + status before vector search

**Implementation Approach:**
- **Filter-first architecture** (apply permissions BEFORE vector search, not after)
- Use existing `searchLibraryItems()` pattern (already implements filter-first)
- Extend permission check to include custom groups

---

### 4. Trash System (Soft Delete)

**Behavior:**
- **Move to trash:** Sets `deletedAt = NOW()`, `deletedBy = userId`
- **Trash visibility:** Only owner sees their deleted files (sharees DON'T see deleted files)
- **Trash retention:** 90 days minimum
- **Permanent delete:**
  - **Owners can delete permanently at any time** (confirmed in interview)
  - Admins can delete permanently after 90 days OR immediately (TBD)
  - Auto-purge runs nightly (2 AM) for items older than 90 days
- **Restore:** Owner can restore from trash, permissions are preserved

**UI Components:**
- Trash tab in DocumentManagement (alongside "My Library", "Shared With Me", "My Group")
- Trash list shows:
  - File icon + name
  - Deleted date (relative: "5 days ago")
  - Deleted by (user name)
  - Days until auto-purge (countdown: "85 days remaining")
- Actions: Restore button, Delete Forever button (owner only)

**Database:**
- `library_items.deletedAt` (timestamp, NULL = active)
- `library_items.deletedBy` (user ID, **new column to add**)

---

### 5. Notifications (In-app + Email)

**Confirmed in Interview:** When user is granted or revoked access, send:
1. **In-app notification** (bell icon, notification panel)
2. **Email notification**

**Notification Events:**
- User granted access to file (direct share)
- User added to group that has access to files
- User's access revoked (direct unshare)
- User removed from group that had access to files
- Permission level changed (e.g., upgraded from read → write)

**Email Templates Needed:**
- "You've been granted [READ/WRITE/DELETE] access to [FILE_NAME] by [SHARER_NAME]"
- "Your access to [FILE_NAME] has been revoked"
- "You've been added to [GROUP_NAME] by [ADMIN_NAME]"

**Implementation Scope:**
- **Phase 2-3 priority** (not MVP blocking)
- Integrate with existing notification system if available
- Otherwise, create notification service

---

## Current State Analysis

### What Exists (From Codebase Research)

#### ✅ Basic Sharing Infrastructure
- `shareLibraryItem()` function in `libraryService.ts:939`
- `library.shareItem` tRPC endpoint at `library.ts:475`
- `libraryPermissions` table with `subjectType`, `subjectId`, `permissionLevel`, `expiresAt`
- Support for `subjectType = "user"` (direct) and `subjectType = "tenant_role"` (role-based)
- **Gap:** No `subjectType = "group"` support yet

#### ✅ Document Scopes
- Three tabs in DocumentLibraryTabs: "My Library", "Shared With Me", "My Group"
- Backend filtering by scope: `my_library`, `shared_with_me`, `shared_groups`
- Tenant isolation: all queries filter by `tenantId`
- **Gap:** "My Group" currently shows role-based and visibility=team files, need to extend for custom groups

#### ✅ Permission Checking
- `getUserPermissionLevel()` function at `libraryService.ts:577`
- `canManageLibraryItem()` check at `libraryService.ts:485`
- Permission ranking: owner > write > read
- **Gap:** Missing "delete" level, no group membership resolution

#### ✅ Soft Delete
- `libraryItems.deletedAt` column exists
- `softDeleteLibraryItem()` function at `libraryService.ts:927`
- All queries filter by `isNull(libraryItems.deletedAt)`
- **Gap:** No `deletedBy` column, no trash UI, no 90-day auto-purge

#### ✅ Vector Database Integration
- `libraryChunks` table stores document chunks
- `vectorRefId` links to external vector DB (ChromaDB/pgvector)
- Search uses filter-first architecture (permissions checked before search)
- **Gap:** No group-based permission filtering yet

#### ✅ Testing Infrastructure
- Vitest for TypeScript tests
- Unit tests for service layer (`libraryService.test.ts`)
- Integration tests for routers (`library.test.ts`)
- Good test coverage for permission functions
- **Gap:** No tests for groups yet

### What's Missing

#### ❌ No Custom Groups
- No `user_groups` table
- No `group_members` table
- No group CRUD operations
- Only hardcoded roles: "user", "admin", "domain_admin"

#### ❌ No Share UI
- No share button in DocumentPreviewPanel
- No ShareDialog component
- No permission management UI

#### ❌ No Group Management UI
- No GroupManagement page
- No GroupCard/GroupDetailPanel components
- No AddMemberDialog, CreateGroupDialog

#### ❌ No Trash UI
- No TrashPanel component
- No trash tab in DocumentManagement
- No restore functionality UI
- No auto-purge scheduler

#### ❌ No Permission-based Search
- Vector search doesn't include group permissions in filtering
- RAG doesn't respect group access rights

---

## Requirements & Solution Design

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

  // Group owner (creator)
  ownerId: integer("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Group icon/avatar (optional)
  iconUrl: text("iconUrl"),

  // Group settings (JSON)
  settings: json("settings").$type<{
    visibility?: "private" | "public"; // public = searchable by all tenant users
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

**Indexes (Critical for Performance):**
```sql
CREATE INDEX idx_user_groups_tenant ON user_groups(tenantId) WHERE deletedAt IS NULL;
CREATE INDEX idx_user_groups_owner ON user_groups(ownerId) WHERE deletedAt IS NULL;
CREATE INDEX idx_user_groups_visibility ON user_groups(tenantId, settings->>'visibility') WHERE deletedAt IS NULL;
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

**Indexes:**
```sql
CREATE INDEX idx_group_members_group ON group_members(groupId) WHERE status = 'active';
CREATE INDEX idx_group_members_user ON group_members(userId) WHERE status = 'active';
```

#### Update Existing Table: `library_permissions`

**Changes:**
1. Extend `subjectType` to support `"group"`
2. Extend `permissionLevel` to support `"delete"`

```typescript
export const libraryPermissions = pgTable("library_permissions", {
  // ... existing columns ...

  // subjectType now supports: "user" | "tenant_role" | "group"
  subjectType: varchar("subjectType", { length: 32 }).notNull(),

  // subjectId interpretation:
  // - If subjectType = "user" → userId (string)
  // - If subjectType = "tenant_role" → role name (string)
  // - If subjectType = "group" → groupId (string)
  subjectId: varchar("subjectId", { length: 64 }).notNull(),

  // Permission levels: "read" | "write" | "delete" | "owner"
  permissionLevel: varchar("permissionLevel", { length: 32 }).notNull(),

  // ... rest of columns ...
});
```

**New Index:**
```sql
CREATE INDEX idx_library_permissions_group ON library_permissions(subjectId, subjectType)
WHERE subjectType = 'group';
```

#### Update Existing Table: `library_items`

**Add column:**
```typescript
export const libraryItems = pgTable("library_items", {
  // ... existing columns ...

  // Soft delete timestamp
  deletedAt: timestamp("deletedAt", { withTimezone: true }),

  // NEW: Who deleted it (for audit)
  deletedBy: integer("deletedBy")
    .references(() => users.id, { onDelete: "set null" }),
});
```

---

### 3.2 Permission System Design

#### Permission Levels & Capabilities

```typescript
export type PermissionLevel = "read" | "write" | "delete" | "owner";

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

#### Permission Resolution Algorithm

**Priority Order:**
1. **Owner** (highest) - `item.ownerUserId === actor.userId`
2. **Direct user permission** - `subjectType = "user" AND subjectId = userId`
3. **Group permission** - `subjectType = "group" AND user is member of group`
4. **Role permission** - `subjectType = "tenant_role" AND subjectId = user.role`

**Implementation (Updated from Existing Code):**

```typescript
async function getUserEffectivePermission(
  itemId: number,
  actor: LibraryActor
): Promise<{
  effectivePermissionLevel: PermissionLevel | null;
  sources: PermissionSource[];
}> {
  // 1. Check if owner
  const item = await getLibraryItemById(itemId, actor.tenantId);
  if (item.ownerUserId === actor.userId) {
    return {
      effectivePermissionLevel: "owner",
      sources: [{ type: "owner" }],
    };
  }

  // 2. Get all permissions for this item
  const permissions = await db
    .select()
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actor.tenantId),
        // Only consider non-expired permissions
        or(
          isNull(libraryPermissions.expiresAt),
          gt(libraryPermissions.expiresAt, new Date())
        )
      )
    );

  // 3. Get user's groups (NEW - from group_members)
  const userGroups = await getUserGroups(actor.userId);
  const groupIds = userGroups.map((g) => g.id);

  // 4. Filter permissions by actor's identities
  const permissionSources: PermissionSource[] = [];

  for (const p of permissions) {
    if (p.subjectType === "user" && p.subjectId === String(actor.userId)) {
      permissionSources.push({
        type: "direct",
        permissionLevel: p.permissionLevel,
        subjectId: p.subjectId,
      });
    } else if (p.subjectType === "group" && groupIds.includes(Number(p.subjectId))) {
      const group = userGroups.find((g) => g.id === Number(p.subjectId));
      permissionSources.push({
        type: "group",
        permissionLevel: p.permissionLevel,
        subjectId: p.subjectId,
        groupName: group?.name,
      });
    } else if (p.subjectType === "tenant_role" && p.subjectId === actor.role) {
      permissionSources.push({
        type: "role",
        permissionLevel: p.permissionLevel,
        subjectId: p.subjectId,
      });
    }
  }

  // 5. Return highest permission
  if (permissionSources.length === 0) {
    return { effectivePermissionLevel: null, sources: [] };
  }

  const levels = permissionSources.map((p) => p.permissionLevel);
  let effectiveLevel: PermissionLevel | null = null;

  if (levels.includes("owner")) effectiveLevel = "owner";
  else if (levels.includes("delete")) effectiveLevel = "delete";
  else if (levels.includes("write")) effectiveLevel = "write";
  else if (levels.includes("read")) effectiveLevel = "read";

  return { effectivePermissionLevel: effectiveLevel, sources: permissionSources };
}
```

**Performance Note (from interview):**
- User wants permission changes to take effect **immediately**
- Recommendation: Cache user's groups in Redis with 1-minute TTL
- Cache key: `user:{userId}:groups:{tenantId}`
- Invalidate on group membership changes (add/remove member, leave group)

---

### 3.3 API Endpoints (tRPC)

#### New Router: `groupsRouter`

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
    .mutation(async ({ input, ctx }) => {
      // CRITICAL: Delete all permissions where subjectType = "group" AND subjectId = groupId
      // This ensures members lose access immediately (confirmed in interview Q1)
      /* ... */
    }),

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

  // NEW: Leave group voluntarily (confirmed in interview Q9)
  leave: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: user is a member
      // Check: user is NOT the owner (owner cannot leave)
      // Delete membership
      /* ... */
    }),

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

  // NEW: Search public groups (confirmed in interview Q6)
  searchPublic: protectedProcedure
    .input(z.object({
      query: z.string().max(100),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // WHERE visibility = "public" AND tenantId = actor.tenantId
      // AND (name ILIKE %query% OR description ILIKE %query%)
      /* ... */
    }),

  // NEW: Join open group (confirmed in interview Q6)
  join: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: group.settings.joinPolicy = "open"
      // Create membership with status = "active"
      /* ... */
    }),

  // NEW: Request to join group (confirmed in interview Q6)
  requestJoin: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: group.settings.joinPolicy = "request_to_join"
      // Create membership with status = "pending"
      /* ... */
    }),

  // NEW: Approve join request (confirmed in interview Q6)
  approveMember: protectedProcedure
    .input(z.object({ groupId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: actor is group admin
      // Update membership status: "pending" → "active"
      /* ... */
    }),

  // NEW: Reject join request (confirmed in interview Q6)
  rejectMember: protectedProcedure
    .input(z.object({ groupId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: actor is group admin
      // Delete membership with status = "pending"
      /* ... */
    }),
});
```

#### Update `libraryRouter` for Sharing

```typescript
export const libraryRouter = router({
  // ... existing endpoints ...

  // UPDATE: Share item with users/groups (extend to support groups)
  shareItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      shares: z.array(z.object({
        subjectType: z.enum(["user", "group"]), // "tenant_role" can stay but not exposed in UI
        subjectId: z.string(), // userId or groupId
        permissionLevel: z.enum(["read", "write", "delete"]), // Removed "owner" - only file owner can have owner level
        expiresAt: z.coerce.date().nullable().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => { /* ... */ }),

  // Get all shares for an item (with group info)
  getItemShares: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Return shares with group names populated
      // Format: { subjectType, subjectId, permissionLevel, groupName?, userName? }
      /* ... */
    }),

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
    .mutation(async ({ input, ctx }) => {
      // Set deletedAt = NOW(), deletedBy = actor.userId
      /* ... */
    }),

  // List trash items
  listTrash: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // WHERE deletedAt IS NOT NULL AND ownerUserId = actor.userId
      // (confirmed in interview Q2: only owner sees their trash)
      /* ... */
    }),

  // Restore from trash
  restoreFromTrash: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Set deletedAt = NULL, deletedBy = NULL
      // Check: only owner or deleter can restore (from spec)
      /* ... */
    }),

  // Permanent delete
  permanentDelete: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check: (isOwner) OR (isAdmin AND daysInTrash >= 90)
      // (confirmed in interview Q3: owner can delete permanently anytime)
      // Delete: chunks → permissions → item
      /* ... */
    }),

  // UPDATE: Get item with permissions (add userPermissions to response)
  getItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const item = await getLibraryItemById(input.id, ctx.actor.tenantId);
      const permissionInfo = await getUserEffectivePermission(input.id, ctx.actor);

      return {
        ...item,
        userPermissions: {
          effectiveLevel: permissionInfo.effectivePermissionLevel,
          sources: permissionInfo.sources, // For UI to display multiple badges (interview Q12)
          canRead: permissionInfo.effectivePermissionLevel !== null,
          canWrite: ["write", "delete", "owner"].includes(permissionInfo.effectivePermissionLevel),
          canDelete: ["delete", "owner"].includes(permissionInfo.effectivePermissionLevel),
          isOwner: permissionInfo.effectivePermissionLevel === "owner",
        },
      };
    }),
});
```

---

### 3.4 Frontend Components

#### 3.4.1 Group Management Components

**`apps/web/client/src/pages/GroupManagement.tsx`** (New)
- List of user's groups (tabs: "My Groups", "Member Of", "Public Groups")
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
- **Leave group button** (visible to members, not owner - interview Q9)
- **Pending join requests section** (for admin, if joinPolicy is "request_to_join")

**`apps/web/client/src/components/groups/CreateGroupDialog.tsx`** (New)
- Form: group name, description, visibility, join policy
- Validation: unique name per tenant

**`apps/web/client/src/components/groups/AddMemberDialog.tsx`** (New)
- Search tenant users (excluding current members)
- Select user(s) to add
- Assign role (admin/member)

**`apps/web/client/src/pages/GroupDiscovery.tsx`** (New - interview Q6)
- Search public groups by name/description
- Display search results with group cards
- Join/Request Join buttons based on joinPolicy
- Filters: search query, sort (member count, created date)

#### 3.4.2 File Sharing Components

**`apps/web/client/src/components/library/ShareButton.tsx`** (New)
- Share icon button in DocumentPreviewPanel header
- Opens ShareDialog on click
- Shows badge with count of existing shares (e.g., "3" if 3 users/groups have access)

**`apps/web/client/src/components/library/ShareDialog.tsx`** (New)
- Modal dialog with tabs: "People" and "Groups" (interview Q11: separate sections)
- **People tab:**
  - Search input for users ONLY (not mixed with groups)
  - Dropdown results with avatars
  - Permission level selector (Read/Write/Delete)
  - Add button
- **Groups tab:**
  - Dropdown selector for user's accessible groups
  - Permission level selector
  - Add button
- **Who has access section:**
  - Owner badge (cannot remove)
  - User/Group rows with permission dropdowns (editable)
  - **Show ALL permission sources** (interview Q12): if user has multiple sources, show multiple rows or tooltip
  - Remove button (X icon)
  - Expiration date (if set)

**`apps/web/client/src/components/library/ShareeRow.tsx`** (New)
- Single row displaying a sharee (user or group)
- Avatar + name
- Permission dropdown
- Remove button
- Expiration date (if set)
- **Badge showing permission source** (e.g., "Direct" vs "via Marketing Team")

**`apps/web/client/src/components/library/PermissionBadge.tsx`** (New)
- Display permission level with icon + color
  - Read: Blue, icon 👁️
  - Write: Green, icon ✏️
  - Delete: Orange, icon 🗑️
  - Owner: Purple, icon 👑
- ARIA attributes for accessibility

#### 3.4.3 Trash Components

**`apps/web/client/src/components/library/TrashPanel.tsx`** (New)
- Tab in DocumentManagement (4th tab alongside "My Library", "Shared With Me", "My Group")
- List of deleted items (only items user OWNS - interview Q2)
- Display:
  - File icon + name
  - Deleted date (relative: "5 days ago")
  - Deleted by (user name - may be self or admin)
  - Days until permanent delete (countdown: "85 days remaining")
  - Warning badge if < 7 days remaining
- Actions:
  - Restore button (for all items in trash)
  - Delete Forever button (owner only - interview Q3)
- Empty state: "Trash is empty"

---

### 3.5 Vector Database Integration

#### Index Files with Permission Metadata

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
  isDeleted: boolean; // NEW: true if deletedAt IS NOT NULL (interview Q4: exclude from search)

  // These will be checked in real-time during search
  // (metadata is NOT sufficient for permission check - still need DB query)
}
```

#### Permission-Aware Search (Filter-First)

**From research: Apply permissions BEFORE vector search, not after.**

```typescript
async function searchLibraryWithPermissions(
  query: string,
  actor: LibraryActor,
  options: {
    scope?: LibraryDocumentScope;
    limit?: number;
  }
): Promise<LibrarySearchResult[]> {
  // 1. Get user's group memberships (cache in Redis for 1 minute)
  const userGroups = await getUserGroups(actor.userId);
  const groupIds = userGroups.map((g) => g.id);

  // 2. Get all items accessible to user (FILTER FIRST)
  const accessibleItemIds = await db
    .selectDistinct({ itemId: libraryItems.id })
    .from(libraryItems)
    .leftJoin(libraryPermissions, eq(libraryPermissions.libraryItemId, libraryItems.id))
    .where(
      and(
        eq(libraryItems.tenantId, actor.tenantId),
        isNull(libraryItems.deletedAt), // EXCLUDE TRASH (interview Q4)
        or(
          eq(libraryItems.ownerUserId, actor.userId), // Owns the file
          and(
            eq(libraryPermissions.subjectType, "user"),
            eq(libraryPermissions.subjectId, String(actor.userId))
          ), // Direct share
          and(
            eq(libraryPermissions.subjectType, "group"),
            inArray(libraryPermissions.subjectId, groupIds.map(String))
          ), // Group share
          and(
            eq(libraryPermissions.subjectType, "tenant_role"),
            eq(libraryPermissions.subjectId, actor.role)
          ), // Role-based
          eq(libraryItems.visibility, "public"), // Public files
          and(
            eq(libraryItems.visibility, "team"),
            // Team visibility = accessible to all tenant users
          )
        )
      )
    );

  const itemIds = accessibleItemIds.map((r) => r.itemId);

  // 3. Now run vector search on this FILTERED set (not full DB)
  const vectorResults = await vectorDb.search(query, {
    tenantId: actor.tenantId,
    itemIds, // Pre-filtered item IDs
    limit: options.limit || 10,
  });

  // 4. Map results back to library items
  return vectorResults.map((r) => toLibrarySearchResult(r));
}
```

**Performance Note:**
- With 1000+ files (interview Q8), pre-filtering may return 200-500 accessible items
- Vector search on 200-500 items is much faster than searching all 1000+ then filtering
- Expected overhead: 3-8x from research, but mitigated by smaller candidate set

---

### 3.6 Trash System (Soft Delete) - Full Implementation

#### Auto-Purge Scheduler (BullMQ)

**Location:** `apps/web/server/jobs/purgeOldTrashItems.ts` (New)

```typescript
import { Queue, Worker } from 'bullmq';
import { db } from '../db';
import { libraryItems, libraryChunks, libraryPermissions } from '../../drizzle/schema';
import { lt, isNotNull, and } from 'drizzle-orm';

const TRASH_RETENTION_DAYS = 90;

// Define cleanup queue
export const trashCleanupQueue = new Queue('trash-cleanup', {
  connection: redis,
});

// Schedule daily cleanup
export async function scheduleTrashCleanup() {
  await trashCleanupQueue.add(
    'purge-old-trash',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // Daily at 2 AM
      },
    }
  );
}

// Worker to process cleanup
export const trashCleanupWorker = new Worker(
  'trash-cleanup',
  async (job) => {
    console.log('[Trash Purge] Starting auto-purge of old trash items...');

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
        console.log('[Trash Purge] No items to purge');
        return { purgedCount: 0 };
      }

      console.log(`[Trash Purge] Found ${oldTrashItems.length} items to purge`);

      // Permanent delete (hard delete)
      for (const item of oldTrashItems) {
        // 1. Delete from vector DB
        try {
          await vectorDb.deleteDocument(item.id);
        } catch (error) {
          console.error(`[Trash Purge] Failed to delete vector for item ${item.id}:`, error);
          // Continue anyway (orphaned vectors are acceptable)
        }

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
      return { purgedCount: oldTrashItems.length };
    } catch (error) {
      console.error('[Trash Purge] Error:', error);
      throw error; // BullMQ will retry
    }
  },
  { connection: redis }
);
```

**Registration in `apps/web/server/index.ts`:**

```typescript
import { scheduleTrashCleanup, trashCleanupWorker } from './jobs/purgeOldTrashItems';

// After server starts
server.listen(PORT, async () => {
  console.log(`✅ Server listening on port ${PORT}`);

  // Start trash auto-purge job
  await scheduleTrashCleanup();
  console.log('✅ Trash auto-purge job scheduled (runs daily at 2 AM)');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Close trash cleanup worker
  await trashCleanupWorker.close();
  console.log('✅ Trash auto-purge worker stopped');

  // Close server
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
```

---

## Implementation Priorities

### Phase 1: Database Schema & Backend Foundation (Week 1)
**Goal:** Establish infrastructure for groups and permissions

- [ ] Database migrations:
  - [ ] Create `user_groups` table with indexes
  - [ ] Create `group_members` table with indexes
  - [ ] Update `library_permissions` to support `subjectType = "group"`
  - [ ] Add `deletedBy` column to `library_items`
  - [ ] Add partial indexes for `WHERE deletedAt IS NULL`
- [ ] Implement `groupsService.ts`:
  - [ ] CRUD functions (create, update, delete, get, list)
  - [ ] Member management (add, remove, update role, leave)
  - [ ] Group search (public groups)
  - [ ] Join/request join functionality
- [ ] Implement `groupsRouter.ts` with all endpoints
- [ ] Update `libraryService.ts`:
  - [ ] `getUserGroups(userId)` helper
  - [ ] Update `getUserEffectivePermission()` to check group permissions
  - [ ] Update `shareLibraryItem()` to support group shares
  - [ ] Add cascading delete on group deletion
- [ ] Unit tests for group service
- [ ] Integration tests for sharing with groups

### Phase 2: Group Management UI (Week 2)
**Goal:** Users can create and manage groups

- [ ] Create `GroupManagement.tsx` page (tabs: My Groups, Member Of, Public Groups)
- [ ] Create `GroupCard.tsx` component
- [ ] Create `GroupDetailPanel.tsx` component (with leave button)
- [ ] Create `CreateGroupDialog.tsx` component
- [ ] Create `AddMemberDialog.tsx` component
- [ ] Create `GroupDiscovery.tsx` page (search public groups)
- [ ] Add route `/groups` to navigation
- [ ] Connect to tRPC endpoints
- [ ] UI tests for group creation flow

### Phase 3: File Sharing UI (Week 3)
**Goal:** Users can share files through UI

- [ ] Create `ShareButton.tsx` in DocumentPreviewPanel
- [ ] Create `ShareDialog.tsx` with separate People/Groups tabs (interview Q11)
- [ ] Create `ShareeRow.tsx` component (show all permission sources - interview Q12)
- [ ] Create `PermissionBadge.tsx` component (with ARIA)
- [ ] Implement user search (users only in search box)
- [ ] Implement group selector (separate from user search)
- [ ] Implement permission level selector
- [ ] Connect to `library.shareItem` mutation
- [ ] Connect to `library.getItemShares` query
- [ ] Connect to `library.removeShare` mutation
- [ ] Update DocumentPreviewPanel to show share button
- [ ] UI tests for sharing flow

### Phase 4: Permission-based Search & Vector DB (Week 4)
**Goal:** Search respects permission filtering

- [ ] Update vector indexing to include `isDeleted` metadata
- [ ] Implement `searchLibraryWithPermissions()` in libraryService
  - [ ] Add group membership resolution
  - [ ] Exclude deleted files (interview Q4)
  - [ ] Filter-first architecture
- [ ] Update `library.search` endpoint to use permission filtering
- [ ] Update frontend search to use new endpoint
- [ ] Test search results respect permissions
- [ ] Performance optimization:
  - [ ] Cache user groups in Redis (1-minute TTL)
  - [ ] Batch permission checks
  - [ ] Profile query performance

### Phase 5: Trash System (Week 5)
**Goal:** Soft delete and trash management

- [ ] Implement `moveToTrash()` in libraryService (with deletedBy)
- [ ] Implement `restoreFromTrash()` in libraryService
- [ ] Implement `permanentDelete()` in libraryService (owner can delete anytime - interview Q3)
- [ ] Create `TrashPanel.tsx` component (show owner's trash only - interview Q2)
- [ ] Add "Trash" tab to DocumentManagement (4th tab)
- [ ] Create auto-purge cron job (BullMQ)
- [ ] Add restore button in TrashPanel
- [ ] Add permanent delete button (owner only)
- [ ] Test trash retention and auto-purge

### Phase 6: Notifications (Week 6)
**Goal:** In-app + email notifications for share events

**Confirmed in Interview Q5:** Need both in-app and email notifications

- [ ] Design notification schema (if not exists)
- [ ] Implement notification service:
  - [ ] `sendShareNotification(userId, itemId, permission, sharer)`
  - [ ] `sendRevokeNotification(userId, itemId)`
  - [ ] `sendGroupAddNotification(userId, groupId, addedBy)`
- [ ] Create email templates:
  - [ ] "You've been granted access" template
  - [ ] "Your access has been revoked" template
  - [ ] "You've been added to a group" template
- [ ] Integrate notification calls in:
  - [ ] `shareLibraryItem()` → send notifications
  - [ ] `removeShare()` → send notifications
  - [ ] `addMember()` → send notifications
  - [ ] `removeMember()` → send notifications
- [ ] In-app notification UI:
  - [ ] Notification bell icon
  - [ ] Notification list panel
  - [ ] Mark as read functionality
- [ ] User preferences:
  - [ ] Allow opt-out of email (keep in-app)
  - [ ] Notification settings page

### Phase 7: Integration & Polish (Week 7)
**Goal:** Integrate features and polish UX

- [ ] Update DocumentManagement tabs to reflect shared counts
- [ ] Add permission badges in DocumentGridList
- [ ] Add "Shared by me" view (optional)
- [ ] Performance optimization for permission queries
- [ ] Add loading states and error handling
- [ ] Add toast notifications for share actions
- [ ] End-to-end testing
- [ ] Documentation and user guide

---

## Testing Strategy

### Unit Tests

**`groupsService.test.ts`:**
- Group CRUD operations
- Member management
- Cascading permission deletion on group delete
- Join/request join flows
- Voluntary leave

**`libraryService.test.ts` (extend existing):**
- Permission resolution with groups
- Group membership caching
- Search with group permissions
- Trash filtering (owner only)

**`permissionCheck.test.ts`:**
- All permission scenarios (read, write, delete, owner)
- Multiple permission sources (direct + group)
- Permission hierarchy

### Integration Tests

**`groupSharing.integration.test.ts`:**
- End-to-end: Create group → Add members → Share file → Verify access
- Remove member → Verify access revoked
- Delete group → Verify all permissions removed (interview Q1)

**`trashManagement.integration.test.ts`:**
- Delete file → View in trash → Restore → Verify restored
- Owner sees trash, sharees don't (interview Q2)
- Owner can permanently delete anytime (interview Q3)

**`permissionSearch.integration.test.ts`:**
- Search with permissions respects group access
- Trash files excluded from search (interview Q4)

### E2E Tests

- Create group → Add members → Share file → Verify access → Search file
- Delete file → View in trash → Restore → Verify restored → Search file
- Permission downgrade (delete → read) takes effect immediately (interview Q7)

---

## Security & Performance

### Security Considerations

**Tenant Isolation (from research & CLAUDE.md):**
- **CRITICAL:** All group operations MUST filter by `tenantId`
- Users can ONLY see/join groups in their own tenant
- Group members MUST be from the same tenant
- File sharing MUST respect tenant boundaries

**Permission Validation:**
- Always check `getUserEffectivePermission()` before allowing actions
- Never trust client-side permission checks
- Validate permission levels: read < write < delete < owner
- Check expiration dates on permissions
- **Permission changes take effect immediately** (interview Q7)

**Group Admin Authorization:**
- Only group owner or admins can:
  - Add/remove members
  - Update group settings
  - Delete group
  - Approve join requests
- Validate group membership before allowing actions

**Rate Limiting:**
- Limit group creation: max 50 groups per user
- Limit member additions: max 100 members per group
- Limit share actions: max 20 shares per minute per user

### Performance Optimization

**Database Indexes (Critical for Large Scale):**

From interview Q8, we need to support **Large scale (> 1000 files, > 100 users, > 50 groups)**.

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

-- Trash (Partial Indexes - from research)
CREATE INDEX idx_library_items_active ON library_items(tenantId, ownerUserId, status)
WHERE deletedAt IS NULL;

CREATE INDEX idx_library_items_trash ON library_items(deletedAt)
WHERE deletedAt IS NOT NULL;
```

**Caching Strategy:**

From interview Q7: Permission changes must take effect immediately, but we can cache groups.

- **User's group memberships:** Cache in Redis with **1-minute TTL**
  - Key: `user:{userId}:groups:{tenantId}`
  - Invalidate on: add/remove member, leave group, delete group
- **Permission checks:** **NO CACHING** (interview Q7: immediate effect)
  - Always query database on each request
  - Accept 3-8x overhead (from research) for correctness
- **Group metadata:** Cache public group listings with 5-minute TTL

**Query Optimization:**
- Use `inArray()` for batch permission checks
- Eager load group memberships when listing files (single query)
- Use pagination for large result sets (limit: 20-50)
- Pre-compute `memberCount` in `user_groups` table (update on add/remove)

---

## Rollout Plan

### Alpha (Internal Testing)
- Deploy to staging environment
- Test with 5-10 internal users
- Verify all features work
- Collect feedback
- Performance testing with 100+ files

### Beta (Limited Release)
- Enable for 10% of users (selected tenants)
- Monitor performance metrics:
  - Permission check latency (target: < 100ms)
  - Search latency (target: < 1s with permissions)
  - Group operations latency (target: < 200ms)
- Fix critical bugs
- Iterate based on feedback

### General Availability
- Enable for all users
- Announce feature in changelog
- Provide user documentation (how to create groups, share files, use trash)
- Monitor adoption metrics:
  - % of users creating groups
  - Average groups per user
  - Average shared files per user
  - Trash usage rate

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

## Appendix B: Key Decisions Summary

| Area | Decision | Source |
|------|----------|--------|
| Group deletion behavior | Delete all permissions immediately | Interview Q1 |
| Trash visibility | Owner's trash only (sharees don't see) | Interview Q2 |
| Permanent delete | Owner can delete anytime | Interview Q3 |
| Vector search | Exclude deleted files | Interview Q4 |
| Notifications | In-app + email | Interview Q5 |
| Group visibility | Public groups searchable, joinable | Interview Q6 |
| Permission changes | Take effect immediately (no cache) | Interview Q7 |
| Scale target | Large (> 100 users, > 50 groups, > 1000 files) | Interview Q8 |
| Voluntary leave | Members can leave groups | Interview Q9 |
| Audit log | Admin-only share history | Interview Q10 |
| Search UI | Users separate from groups | Interview Q11 |
| Permission display | Show all sources (multi-badge/tooltip) | Interview Q12 |
| Partial indexes | Critical for performance | Research |
| Filter-first search | Apply permissions before vector search | Research |
| Notification system | Required for this feature | Interview Q5 |

---

## Appendix C: Out of Scope (Post-MVP)

- Share via public link (read-only, expirable)
- Group templates (pre-defined group types)
- Activity log for file access (only share history for admins)
- Email notifications for file updates
- Group-level storage quotas
- Advanced permission: "Can share" (separate from delete)
- Bulk share operations
- Group hierarchies (nested groups)
- File versioning
- Comment/annotation on files

---

**End of Specification Document**

**Next Steps:**
1. Create implementation plan (claude-plan.md) with detailed technical approach
2. Apply TDD approach (claude-plan-tdd.md) with test stubs
3. Split into implementation sections for parallel work
4. Begin Phase 1 implementation
