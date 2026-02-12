# Implementation Plan: Custom Groups & Permission-based File Sharing

**Feature ID:** SSP-SHAREFILE-009
**Plan Version:** 1.0
**Last Updated:** 2026-02-12
**Planning Directory:** `specs/feature/009-sharefile/`

---

## Executive Summary

This plan describes the implementation of a comprehensive custom groups and file sharing system for SmartSpecPro's Document Management feature. The system will allow users to create custom groups, share files with granular permissions, and manage a 90-day trash retention system—all while maintaining immediate permission enforcement and supporting large-scale tenants (100+ users, 50+ groups, 1000+ files).

### Key Technical Challenges

1. **Immediate permission enforcement** — User requests permission changes to take effect instantly, ruling out aggressive caching
2. **Large-scale performance** — Must handle 1000+ files with 3-8x permission overhead without degrading search to > 1s
3. **Cascading deletions** — Group deletion must instantly revoke all file access without orphaning data
4. **Multi-source permissions** — Users may have multiple permission sources (direct + group) that must be displayed transparently

### Architecture Decisions

- **Permission resolution:** Query-first with 1-minute Redis cache for group memberships only
- **Search strategy:** Filter-first (apply permissions before vector search, not after)
- **Trash visibility:** Owner-only (sharees don't see deleted files)
- **Notification system:** Phase 2 (in-app + email, not MVP blocking)
- **Database:** Extend existing Drizzle schema with two new tables, reuse existing soft-delete pattern

---

## Part 1: Database Foundation

### 1.1 New Tables

#### user_groups Table

**Purpose:** Store custom user-created groups within a tenant.

**Schema:**
- `id` (serial primary key)
- `tenantId` (varchar(36), FK to tenants, cascades)
- `name` (varchar(128), group name)
- `description` (text, optional)
- `ownerId` (integer, FK to users, group creator/owner)
- `iconUrl` (text, optional avatar URL)
- `settings` (jsonb):
  - `visibility`: "private" | "public"
  - `joinPolicy`: "invite_only" | "request_to_join" | "open"
- `memberCount` (integer, denormalized for performance)
- `createdAt`, `updatedAt`, `deletedAt` (timestamps, soft delete pattern)

**Constraints:**
- Unique (Partial Index): `(tenantId, name)` WHERE `deletedAt IS NULL` — prevents namespace collision with deleted groups
- FK: `tenantId` → `tenants.id` (ON DELETE CASCADE)
- FK: `ownerId` → `users.id` (ON DELETE CASCADE)

**Indexes (Critical for Large Scale):**
- `idx_user_groups_tenant` ON `(tenantId)` WHERE `deletedAt IS NULL` (partial index)
- `idx_user_groups_owner` ON `(ownerId)` WHERE `deletedAt IS NULL` (partial index)
- `idx_user_groups_visibility` ON `(tenantId, (settings->>'visibility'))` WHERE `deletedAt IS NULL`

**Unique Index (Partial):**
```sql
CREATE UNIQUE INDEX user_groups_tenant_name_unique
ON user_groups(tenantId, name)
WHERE deletedAt IS NULL;
```
This allows recreating deleted group names (fixes namespace collision issue).

**Implementation Notes:**
- Use Drizzle ORM's `pgTable()` API
- Settings JSON should have a TypeScript type for type safety
- `memberCount` is updated via triggers or application logic on add/remove member

---

#### group_members Table

**Purpose:** Junction table linking users to groups with roles and status.

**Schema:**
- `id` (serial primary key)
- `groupId` (integer, FK to user_groups, cascades)
- `userId` (integer, FK to users, cascades)
- `role` (varchar(32), "admin" | "member")
- `addedBy` (integer, FK to users, nullable for audit trail)
- `status` (varchar(32), "active" | "pending" | "removed")
- `joinedAt`, `removedAt` (timestamps)

**Constraints:**
- Unique: `(groupId, userId)` — one membership per user per group
- FK: `groupId` → `user_groups.id` (ON DELETE CASCADE)
- FK: `userId` → `users.id` (ON DELETE CASCADE)
- FK: `addedBy` → `users.id` (ON DELETE SET NULL)

**Indexes:**
- `idx_group_members_group` ON `(groupId)` WHERE `status = 'active'` (partial index)
- `idx_group_members_user` ON `(userId)` WHERE `status = 'active'` (partial index)

**Implementation Notes:**
- `status = "pending"` for join requests awaiting admin approval
- `status = "removed"` for soft-deleted memberships (audit trail)
- When member is removed, set `removedAt` but keep row for history

---

### 1.2 Schema Updates

#### library_permissions Table

**Changes:**
- Extend `subjectType` enum to include `"group"`
  - Values: `"user"`, `"tenant_role"`, `"group"`
- Extend `permissionLevel` enum to include `"delete"`
  - Values: `"read"`, `"write"`, `"delete"`, `"owner"`

**New Index:**
- `idx_library_permissions_group` ON `(subjectId, subjectType)` WHERE `subjectType = 'group'`

**Migration Strategy:**
- Add `"group"` to CHECK constraint or enum
- Add `"delete"` to CHECK constraint or enum
- Existing data (all `"user"` or `"tenant_role"`) remains valid
- No data transformation needed

---

#### library_items Table

**Changes:**
- Add `deletedBy` column (integer, FK to users, nullable)
  - Tracks who moved the file to trash
  - Needed for trash UI ("Deleted by John Doe")

**Migration Strategy:**
- `ALTER TABLE library_items ADD COLUMN deletedBy INTEGER REFERENCES users(id) ON DELETE SET NULL;`
- Existing deleted items will have `deletedBy = NULL` (acceptable)
- Future deletes populate this field

---

### 1.3 Migration Execution Plan

**Step 1: Backup**
Before running ANY migration, backup affected tables:
```bash
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=library_items \
  --file=".db-backups/library_items_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=library_permissions \
  --file=".db-backups/library_permissions_$(date +%Y%m%d_%H%M%S).sql"
```

**Step 2: Generate Drizzle Migrations**
```bash
cd apps/web
pnpm drizzle-kit generate
# This creates .sql files in drizzle/ directory
```

**Step 3: Review Generated SQL**
Manually inspect `.sql` files to ensure:
- Indexes are created with `WHERE` clauses (partial indexes)
- Foreign keys have correct ON DELETE behavior
- Enum extensions don't break existing data

**Step 4: Apply Migrations**
```bash
pnpm drizzle-kit migrate
# Or: psql "$DATABASE_URL" < drizzle/XXXX_add_groups.sql
```

**Step 5: Verify**
```sql
-- Check table exists
SELECT * FROM user_groups LIMIT 1;
SELECT * FROM group_members LIMIT 1;

-- Check new column
SELECT deletedBy FROM library_items WHERE deletedAt IS NOT NULL LIMIT 5;

-- Check indexes exist
SELECT indexname FROM pg_indexes WHERE tablename IN ('user_groups', 'group_members');
```

**Rollback Plan:**
If migration fails, restore from backup:
```bash
psql "$DATABASE_URL" < .db-backups/library_items_TIMESTAMP.sql
```

---

## Part 2: Backend Services

### 2.1 Groups Service Layer

**File:** `apps/web/server/services/groupsService.ts` (NEW)

**Purpose:** Business logic for group management, isolated from tRPC routers.

#### Core Functions

**`createUserGroup(input, actor)`**
- Validates unique group name per tenant
- Checks user hasn't exceeded 50 groups limit
- **Transaction:** Wraps group insert + initial membership insert atomically
- Creates group with actor as owner
- Creates initial membership (owner as admin)
- Returns created group object

**`getUserGroups(userId, tenantId)`**
- Queries `group_members` table for active memberships
- Joins with `user_groups` to get group details
- Filters by `deletedAt IS NULL` (exclude deleted groups)
- **Caching:** Redis cache with 1-minute TTL (key: `user:{userId}:groups:{tenantId}`)
- **Invalidation:** On add member, remove member, delete group, leave group

**`addGroupMember(groupId, userId, role, actor)`**
- Validates actor is group admin
- **Validates target userId exists and tenantId matches group.tenantId** (cross-tenant isolation)
- Checks group hasn't exceeded 100 members limit
- Checks user not already a member
- **Transaction:** Wraps membership insert + memberCount increment atomically
- Creates membership with `status = "active"`
- Increments `user_groups.memberCount`
- **Invalidates cache** only for the added user (not all members — they don't need to know)

**`removeGroupMember(groupId, userId, actor)`**
- Validates actor is group admin OR userId === actor (self-removal)
- Prevents owner from removing themselves (must delete group or transfer ownership)
- **Transaction:** Wraps membership update + memberCount decrement atomically
- Sets `status = "removed"`, `removedAt = NOW()`
- Decrements `user_groups.memberCount`
- **Invalidates cache** only for removed user (not all members — their group list didn't change)

**`deleteUserGroup(groupId, actor)`**
- Validates actor is group owner
- **Transaction:** Wraps soft delete + permission cascade atomically
- Soft deletes group: sets `deletedAt = NOW()`
- **CRITICAL:** Deletes ALL `library_permissions` where `subjectType = "group"` AND `subjectId = groupId`
  - This ensures members lose file access immediately (interview Q1)
- **Invalidates cache** for all members (all lost a group)

**`approveJoinRequest(groupId, userId, actor)`**
- Validates actor is group admin
- Validates membership exists with `status = "pending"`
- Updates `status = "pending"` → `"active"`
- Increments `memberCount`
- Sends notification (Phase 2)

**`rejectJoinRequest(groupId, userId, actor)`**
- Validates actor is group admin
- Deletes membership with `status = "pending"`

**`searchPublicGroups(query, tenantId, limit, offset)`**
- Queries `user_groups` WHERE `visibility = "public"` AND `tenantId = X`
- Filters by name/description ILIKE pattern
- Returns paginated results

**Implementation Notes:**
- All functions accept `actor: LibraryActor` for tenant isolation and permission checks
- Use Drizzle ORM for all database operations
- Follow existing error handling patterns (throw custom errors, wrapped in routers)
- Extensive input validation (max lengths, valid enums, etc.)

---

### 2.2 Library Service Updates

**File:** `apps/web/server/services/libraryService.ts` (EXTEND)

#### Pre-requisite Refactoring

**CRITICAL:** Before adding actual user groups, rename existing naming collision to avoid confusion:
- Rename `hasGroupShare` → `hasTenantRoleShare`
- Rename `groupMatches` → `tenantRoleMatches`
- Update references in `getDocumentAccessSource()` and related permission resolution functions
- The existing "shared_groups" scope uses `tenant_role` permissions, NOT actual groups

This prevents logic bugs during implementation where "group" could mean either tenant_role or user groups.

#### New/Updated Functions

**`getUserGroups(userId, tenantId)` (NEW)**
- Thin wrapper around `groupsService.getUserGroups()`
- Used by permission resolution
- Caching handled in groups service

**`rankPermissionLevel(level)` (UPDATE)**
- Add case for "delete" permission (rank 3)
- Updated hierarchy: `read = 1`, `write = 2`, `delete = 3`, `owner = 4`
- Used for determining highest permission level across multiple sources

**`canManageLibraryItem(permissionLevel)` (UPDATE)**
- Update to allow "delete" level (currently only allows "owner")
- New logic: `permissionLevel === "owner" || permissionLevel === "delete"`
- Affects who can share/modify files

**`getUserEffectivePermission(itemId, actor)` (UPDATE)**
- **Current implementation:** Checks owner, direct user share, role share
- **New logic:** Also check group shares
  1. Get user's groups via `getUserGroups(actor.userId, actor.tenantId)`
  2. Extract group IDs
  3. Query `library_permissions` WHERE `subjectType = "group"` AND `subjectId IN (groupIds)`
  4. Include group permissions in resolution
  5. Return both `effectivePermissionLevel` (highest) and `sources` array (all permission sources)

**Return Format (NEW):**
```typescript
{
  effectivePermissionLevel: "write" | "read" | "delete" | "owner" | null,
  sources: [
    { type: "owner" },
    { type: "direct", permissionLevel: "read", subjectId: "123" },
    { type: "group", permissionLevel: "write", subjectId: "456", groupName: "Marketing Team" }
  ]
}
```

**`shareLibraryItem(input, actor)` (UPDATE)**
- **Current implementation:** Supports `subjectType = "user"` and `"tenant_role"`
- **New logic:** Also support `subjectType = "group"`
  1. Validate group exists if `subjectType = "group"`
  2. Validate group is in same tenant
  3. Create permission entry
  4. Send notifications (Phase 2)

**`softDeleteLibraryItem(itemId, actor)` (UPDATE)**
- **Current implementation:** Sets `deletedAt = NOW()`
- **New logic:** Also set `deletedBy = actor.userId`

**`searchLibraryWithPermissions(query, actor, options)` (UPDATE)**
- **Current implementation:** Filter-first (fetches accessible items, then searches)
- **New logic:** Include group permissions in accessibility check
  1. Get user's groups
  2. Build WHERE clause including:
     - `ownerUserId = actor.userId` (owns file)
     - OR `subjectType = "user"` AND `subjectId = actor.userId` (direct share)
     - OR `subjectType = "group"` AND `subjectId IN (groupIds)` (group share)
     - OR `subjectType = "tenant_role"` AND `subjectId = actor.role` (role share)
     - OR `visibility = "public"` (public files)
  3. **CRITICAL:** Filter `deletedAt IS NULL` (exclude trash - interview Q4)
  4. Run vector search on filtered item IDs

---

### 2.3 tRPC Routers

#### groups Router (NEW)

**File:** `apps/web/server/routers/groups.ts` (NEW)

**Procedures:**
- `list` (query) — List user's groups (scopes: my_groups, member_of, all)
- `get` (query) — Get single group with members
- `create` (mutation) — Create new group
- `update` (mutation) — Update group metadata
- `delete` (mutation) — Soft delete group + cascade permission deletion
- `addMember` (mutation) — Add user to group
- `removeMember` (mutation) — Remove user from group
- `leave` (mutation) — Voluntary leave group (interview Q9)
- `updateMemberRole` (mutation) — Change member role (admin ↔ member)
- `listTenantUsers` (query) — Search users for adding to group
- `searchPublic` (query) — Search public groups (interview Q6)
- `join` (mutation) — Join open group (interview Q6)
- `requestJoin` (mutation) — Request to join group (interview Q6)
- `approveMember` (mutation) — Approve join request (interview Q6)
- `rejectMember` (mutation) — Reject join request (interview Q6)

**Input Validation:**
- All inputs use Zod schemas
- Max lengths enforced (name: 128, description: 512)
- Enums validated ("private" | "public", etc.)

**Error Handling:**
- Throw `TRPCError` with appropriate codes:
  - `UNAUTHORIZED` (401) — Not logged in
  - `FORBIDDEN` (403) — Not group admin, not member, etc.
  - `NOT_FOUND` (404) — Group doesn't exist
  - `CONFLICT` (409) — Duplicate group name, already a member
  - `BAD_REQUEST` (400) — Validation errors, limits exceeded

**Audit Logging:**
- Use existing audit logger for all mutations
- Log: `eventType: "groups_mutation"`, `endpoint: "groups.create"`, etc.

**Router Registration:**

Add to `apps/web/server/routers.ts`:
```typescript
import { groupsRouter } from './groups';

export const appRouter = router({
  library: libraryRouter,
  groups: groupsRouter, // NEW
  // ... other routers
});
```

---

#### library Router (UPDATE)

**File:** `apps/web/server/routers/library.ts` (EXTEND)

**Updated Procedures:**

**`shareItem` (mutation):**
- Extend input to accept `subjectType: "group"`
- Validate group exists and is in same tenant
- Call updated `shareLibraryItem()` service function

**`getItemShares` (query):**
- Return shares with populated group names
- Format: `{ subjectType, subjectId, permissionLevel, groupName?, userName? }`

**`getItem` (query):**
- Add `userPermissions` object to response:
  ```typescript
  {
    ...item,
    userPermissions: {
      effectiveLevel: "write",
      sources: [...], // All permission sources (interview Q12)
      canRead: true,
      canWrite: true,
      canDelete: false,
      isOwner: false,
    }
  }
  ```

**New Procedures:**

**`listTrash` (query):**
- Input: `{ limit?, offset? }`
- Query: `WHERE deletedAt IS NOT NULL AND ownerUserId = actor.userId`
- Returns: List of deleted items with `deletedAt`, `deletedBy`, `daysUntilPurge`

**`restoreFromTrash` (mutation):**
- Input: `{ itemId }`
- Check: User is owner or deleter (from spec)
- Action: Set `deletedAt = NULL`, `deletedBy = NULL`

**`permanentDelete` (mutation):**
- Input: `{ itemId }`
- Check: User is owner (interview Q3) OR (admin AND daysInTrash >= 90)
- Action: Delete chunks → permissions → item (hard delete)

**`removeShare` (mutation):**
- Input: `{ itemId, subjectType, subjectId }`
- Validation: Actor has "delete" or "owner" permission on item
- Action: DELETE from library_permissions WHERE match
- Return: `{ success: true }`

**`updateSharePermission` (mutation):**
- Input: `{ itemId, subjectType, subjectId, permissionLevel }`
- Validation: Actor has "delete" or "owner" permission on item
- Action: UPDATE library_permissions SET permissionLevel WHERE match
- Return: `{ success: true }`

---

### 2.4 Background Jobs

#### Trash Auto-Purge Job (NEW)

**File:** `apps/web/server/jobs/purgeOldTrashItems.ts` (NEW)

**Technology:** BullMQ (already used in project)

**Schedule:** Daily at 2 AM (cron: `0 2 * * *`)

**Logic:**
1. Calculate cutoff date: `NOW() - 90 days`
2. Query: `SELECT id, sourceUrl, thumbnailUrl FROM library_items WHERE deletedAt < cutoffDate`
3. For each item:
   - **Delete from S3/R2 storage** (if sourceUrl or thumbnailUrl exists):
     ```typescript
     if (item.sourceUrl) {
       await storageService.deleteFile(item.sourceUrl);
     }
     if (item.thumbnailUrl) {
       await storageService.deleteFile(item.thumbnailUrl);
     }
     ```
   - Delete from vector DB (handle errors gracefully)
   - Delete `library_chunks` rows
   - Delete `library_permissions` rows
   - Delete `library_items` row (hard delete)
4. Log count of purged items

**Error Handling:**
- If vector deletion fails, log warning and continue (orphaned vectors acceptable)
- If DB deletion fails, retry via BullMQ (max 3 retries)

**Registration:**
- Add to `apps/web/server/index.ts` server startup
- Gracefully close worker on SIGTERM

---

## Part 3: Frontend Implementation

### 3.1 Group Management UI

#### Group Management Page

**File:** `apps/web/client/src/pages/GroupManagement.tsx` (NEW)

**Layout:**
- Header: "My Groups" + "Create Group" button
- Tabs: "My Groups" (owner), "Member Of", "Public Groups" (interview Q6)
- Grid/list of group cards
- Empty states for each tab

**State:**
- `selectedTab`: "my_groups" | "member_of" | "public"
- `searchQuery`: string (for filtering)

**Queries:**
- `trpc.groups.list.useQuery({ scope: selectedTab })`
- `trpc.groups.searchPublic.useQuery({ query: searchQuery })` (for Public Groups tab)

**Actions:**
- Click "Create Group" → Open CreateGroupDialog
- Click group card → Navigate to GroupDetailPanel

**Routing Configuration:**

Add to `apps/web/client/src/App.tsx`:
```typescript
<Route path="/groups" component={GroupManagement} />
<Route path="/groups/discover" component={GroupDiscovery} />
<Route path="/groups/:groupId" component={GroupDetailPanel} />
```

Add to sidebar navigation (`MainNav.tsx`):
```typescript
{ path: "/groups", label: "Groups", icon: UsersIcon }
```

Both routes require `protectedRoute` wrapper for authentication.

---

#### Group Detail Panel

**File:** `apps/web/client/src/components/groups/GroupDetailPanel.tsx` (NEW)

**Layout:**
- Header: Group name, icon, member count, settings (visibility, join policy)
- "Edit" button (owner/admin only)
- "Delete Group" button (owner only)
- **"Leave Group" button** (members only, not owner - interview Q9)
- Member list with roles and actions
- **Pending join requests section** (admin only, if any pending)

**State:**
- `groupId`: number (from URL param or props)
- `selectedMemberId`: number | null (for remove confirmation)

**Queries:**
- `trpc.groups.get.useQuery({ id: groupId })`

**Mutations:**
- `trpc.groups.removeMember.useMutation()`
- `trpc.groups.leave.useMutation()` (interview Q9)
- `trpc.groups.delete.useMutation()`
- `trpc.groups.approveMember.useMutation()` (interview Q6)
- `trpc.groups.rejectMember.useMutation()` (interview Q6)

---

#### Create/Edit Group Dialog

**File:** `apps/web/client/src/components/groups/CreateGroupDialog.tsx` (NEW)

**Form Fields:**
- Name (required, max 128 chars)
- Description (optional, max 512 chars)
- Visibility: Private / Public (radio buttons)
- Join Policy: Invite Only / Request to Join / Open (dropdown, only if visibility = public)

**Validation:**
- Name uniqueness (backend enforces, show error on conflict)
- Max lengths (client-side + backend)

**Mutations:**
- `trpc.groups.create.useMutation()`
- `trpc.groups.update.useMutation()` (for edit mode)

---

#### Add Member Dialog

**File:** `apps/web/client/src/components/groups/AddMemberDialog.tsx` (NEW)

**Layout:**
- Search input (placeholder: "Search users..." - interview Q11)
- Results list with user avatars + names
- Role selector: Member / Admin (radio buttons)
- "Add" button

**Search:**
- `trpc.groups.listTenantUsers.useQuery({ search: query, excludeGroupId })`
- Debounced search (300ms delay)

**Mutations:**
- `trpc.groups.addMember.useMutation()`

---

#### Group Discovery Page (NEW)

**File:** `apps/web/client/src/pages/GroupDiscovery.tsx` (NEW - interview Q6)

**Purpose:** Search and join public groups

**Layout:**
- Search input
- Filters: Sort by (member count, created date)
- Grid of group cards
- Each card shows:
  - Group name, description, member count
  - **Join button** (if joinPolicy = "open")
  - **Request Join button** (if joinPolicy = "request_to_join")
  - "Invite Only" badge (if joinPolicy = "invite_only", no button)

**Queries:**
- `trpc.groups.searchPublic.useQuery({ query, limit, offset })`

**Mutations:**
- `trpc.groups.join.useMutation()` (interview Q6)
- `trpc.groups.requestJoin.useMutation()` (interview Q6)

---

### 3.2 File Sharing UI

#### Share Button

**File:** `apps/web/client/src/components/library/ShareButton.tsx` (NEW)

**Location:** DocumentPreviewPanel header (next to download button)

**Visual:**
- Icon: Share/link icon (from Radix Icons)
- Badge: Show count of shares (e.g., "3" if 3 users/groups have access)
- Tooltip: "Share file"

**Behavior:**
- Click → Open ShareDialog modal

---

#### Share Dialog

**File:** `apps/web/client/src/components/library/ShareDialog.tsx` (NEW)

**Layout (interview Q11 & Q12):**
```
┌─────────────────────────────────────────┐
│ Share "Document.pdf"                [X] │
├─────────────────────────────────────────┤
│ Add people or groups                    │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search for people...             │ │  ← Users only (interview Q11)
│ └─────────────────────────────────────┘ │
│                                         │
│ Or select a group:                      │
│ ┌─────────────────────────────────────┐ │
│ │ ▼ Select group...                   │ │  ← Separate dropdown (interview Q11)
│ └─────────────────────────────────────┘ │
│                                         │
│ Permission level: [▼ Read]              │
│                    [Add]                │
│                                         │
│ Who has access:                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 John Doe (You)      [Owner]  [👑]│ │
│ │ 👤 Jane Smith       [▼ Write]   [✕] │ │
│ │ 👥 Marketing Team   [▼ Read]    [✕] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancel]                    [Save]      │
└─────────────────────────────────────────┘
```

**State:**
- `itemId`: number (from props)
- `searchQuery`: string (for user search)
- `selectedPermission`: "read" | "write" | "delete"
- `selectedGroup`: number | null

**Queries:**
- `trpc.groups.listTenantUsers.useQuery({ search: searchQuery })` (debounced)
- `trpc.groups.list.useQuery({ scope: "all" })` (for group dropdown)
- `trpc.library.getItemShares.useQuery({ itemId })` (existing shares)

**Mutations:**
- `trpc.library.shareItem.useMutation()` (add share)
- `trpc.library.removeShare.useMutation()` (remove share)
- `trpc.library.updateSharePermission.useMutation()` (change permission)

**Display Multiple Sources (interview Q12):**
- If user has multiple permission sources (direct + group), show multiple rows:
  ```
  👤 Jane Smith (Direct)       [Read]    [✕]
  👤 Jane Smith (via Marketing) [Write]   [✕]
  ```
- Or: Single row with tooltip showing all sources
- Owner row cannot be removed (disabled X button)

---

#### Permission Badge

**File:** `apps/web/client/src/components/library/PermissionBadge.tsx` (NEW)

**Purpose:** Display permission level with icon, color, and accessibility

**Props:**
- `level`: "read" | "write" | "delete" | "owner"
- `label?`: string (override default label)

**Design:**
- Read: Blue, icon 👁️, label "Read Only"
- Write: Green, icon ✏️, label "Can Edit"
- Delete: Orange, icon 🗑️, label "Can Delete"
- Owner: Purple, icon 👑, label "Owner"

**ARIA Attributes:**
- `role="status"`
- `aria-label` with full text (e.g., "Read Only access")
- Icon has `aria-hidden="true"` (decorative)

---

### 3.3 Trash UI

#### Trash Panel

**File:** `apps/web/client/src/components/library/TrashPanel.tsx` (NEW)

**Location:** 4th tab in DocumentManagement (alongside My Library, Shared With Me, My Group)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ 🗑️ Trash                             [Empty Trash]  │
├─────────────────────────────────────────────────────┤
│ Items will be permanently deleted after 90 days.    │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 Marketing Plan Q1.docx                      │ │
│ │    Deleted by You • 5 days ago • 85 days left  │ │
│ │                          [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 📊 Sales Report.xlsx                           │ │
│ │    Deleted by John Doe • 15 days ago • 75 left │ │
│ │                          [Restore] [Delete]    │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ 🖼️ Logo Design.png                             │ │
│ │    Deleted 89 days ago • 1 day remaining ⚠️    │ │
│ │                          [Restore] [Delete]    │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**State:**
- `selectedItemId`: number | null (for confirmation dialogs)

**Queries:**
- `trpc.library.listTrash.useQuery({ limit: 50, offset: 0 })`

**Mutations:**
- `trpc.library.restoreFromTrash.useMutation()`
- `trpc.library.permanentDelete.useMutation()` (owner only - interview Q3)

**Display Logic:**
- Show relative deleted date ("5 days ago")
- Show days until auto-purge (90 - daysSinceDeletion)
- Warning badge if < 7 days remaining
- "Deleted by" shows user name (from `deletedBy` column)

**Empty State:**
```
┌─────────────────────────────────────┐
│           🗑️                        │
│       Trash is empty                │
│   Deleted items will appear here    │
└─────────────────────────────────────┘
```

---

## Part 4: Performance Optimization

### 4.1 Caching Strategy

**User Groups Cache (Redis)**

**Key:** `user:{userId}:groups:{tenantId}`

**Value:** JSON array of group objects:
```json
[
  { "id": 1, "name": "Marketing Team", "role": "admin" },
  { "id": 2, "name": "Sales Team", "role": "member" }
]
```

**TTL:** 1 minute (60 seconds) — Interview Q7: immediate effect, but 1-minute delay acceptable

**Invalidation Events (Optimized):**
- Group created → Invalidate owner's cache
- Member added → Invalidate ONLY added user's cache (they gained a group)
  - Other members' caches unaffected (their group list didn't change)
- Member removed → Invalidate ONLY removed user's cache (they lost a group)
  - Other members' caches unaffected
- Group deleted → Invalidate ALL members' caches (all lost a group)
- User leaves group → Invalidate user's cache

**Rationale:** The cached value is user-specific (user's groups), not group-specific (group's members). Only invalidate when a user's group membership changes.

**Implementation:**
```typescript
async function getUserGroupsWithCache(userId: number, tenantId: string) {
  const cacheKey = `user:${userId}:groups:${tenantId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss, query database
  const groups = await db
    .select()
    .from(groupMembers)
    .leftJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
        eq(userGroups.tenantId, tenantId),
        isNull(userGroups.deletedAt)
      )
    );

  // Store in cache
  await redis.setex(cacheKey, 60, JSON.stringify(groups));

  return groups;
}
```

---

**Permission Checks (NO CACHING)**

Interview Q7 confirmed: Permission changes must take effect immediately. Therefore:
- DO NOT cache effective permission levels
- Always query `library_permissions` table on each request
- Accept 3-8x overhead (from research) for correctness

**Mitigation:**
- Use database connection pooling (20-50 connections)
- Optimize queries with proper indexes
- Batch permission checks where possible (fetch all permissions for multiple items in one query)

---

### 4.2 Database Query Optimization

**Batch Permission Checks**

When listing files (e.g., library grid view), fetch permissions for ALL items in one query:

```typescript
async function batchGetUserPermissions(
  itemIds: number[],
  actor: LibraryActor
): Promise<Map<number, PermissionInfo>> {
  // 1. Get user's groups (cached)
  const userGroups = await getUserGroupsWithCache(actor.userId, actor.tenantId);
  const groupIds = userGroups.map((g) => g.id);

  // 2. Get all permissions for all items in ONE query
  const permissions = await db
    .select()
    .from(libraryPermissions)
    .where(
      and(
        inArray(libraryPermissions.libraryItemId, itemIds),
        eq(libraryPermissions.tenantId, actor.tenantId)
      )
    );

  // 3. Get all items' owner info
  const items = await db
    .select({ id: libraryItems.id, ownerUserId: libraryItems.ownerUserId })
    .from(libraryItems)
    .where(inArray(libraryItems.id, itemIds));

  // 4. Resolve permissions for each item
  const result = new Map<number, PermissionInfo>();
  for (const item of items) {
    const itemPermissions = permissions.filter((p) => p.libraryItemId === item.id);
    const resolved = resolvePermissions(item, itemPermissions, actor, groupIds);
    result.set(item.id, resolved);
  }

  return result;
}
```

**Pagination**

All list endpoints MUST use pagination:
- Library list: 20-50 items per page
- Group list: 20-50 groups per page
- Member list: 50-100 members per page
- Trash list: 50 items per page

**Partial Indexes**

From research, partial indexes are CRITICAL for performance with soft deletes:
- Index only active records (`WHERE deletedAt IS NULL`)
- Index only active memberships (`WHERE status = 'active'`)
- These indexes are 90%+ smaller than full-table indexes
- Query planner uses partial indexes for common queries

---

### 4.3 Performance Monitoring

**Metrics to Track:**
- Permission check latency (target: < 100ms per request)
- Search latency with permissions (target: < 1s)
- Group operations latency (target: < 200ms)
- Cache hit rate (target: > 80% for group membership queries)
- Database connection pool utilization (target: < 80%)

**Tools:**
- Use existing audit logger for timing data
- Add performance logging to critical paths
- Monitor Redis memory usage (group caches + other caches)

---

## Part 5: Security & Testing

### 5.1 Security Checklist

**Tenant Isolation:**
- [ ] All group queries filter by `tenantId`
- [ ] Group members can only be from same tenant
- [ ] File shares can only be to users/groups in same tenant
- [ ] Public group search is tenant-scoped

**Permission Validation:**
- [ ] Always check `getUserEffectivePermission()` before write/delete operations
- [ ] Never trust client-side permission checks
- [ ] Validate permission hierarchy (read < write < delete < owner)
- [ ] Check permission expiration dates

**Group Admin Authorization:**
- [ ] Only group owner or admins can add/remove members
- [ ] Only group owner can delete group
- [ ] Only group owner can transfer ownership (future feature)
- [ ] Members can leave voluntarily (except owner)

**Rate Limiting:**
- [ ] Max 50 groups per user (enforced in `createUserGroup`)
- [ ] Max 100 members per group (enforced in `addGroupMember`)
- [ ] Max 20 shares per minute per user (TBD: implement rate limiter)

**Audit Logging:**
- [ ] Log all group mutations (create, delete, add member, etc.)
- [ ] Log all share mutations (share, revoke, update permission)
- [ ] Log permission denial events (FORBIDDEN errors)

---

### 5.2 Testing Strategy

**Unit Tests**

**File:** `apps/web/server/services/groupsService.test.ts` (NEW)

**Test Cases:**
- Create group with valid input → success
- Create duplicate group name → error
- Create 51st group → error (limit exceeded)
- Add member to group → success
- Add member already in group → error
- Remove member as admin → success
- Remove self (voluntary leave) → success
- Owner tries to leave → error
- Delete group → permissions cascade deleted
- Approve join request → status changes to active

**File:** `apps/web/server/services/libraryService.test.ts` (EXTEND)

**New Test Cases:**
- Permission resolution with group membership → returns highest level
- Permission resolution with multiple sources → returns all sources
- Search with group permissions → includes group-shared files
- Search with trash → excludes deleted files
- Move to trash → sets deletedAt and deletedBy

---

**Integration Tests**

**File:** `apps/web/server/routers/groups.integration.test.ts` (NEW)

**Test Scenarios:**
- End-to-end group creation flow
- End-to-end member management flow
- Group deletion cascades to permissions
- Public group search and join flow

**File:** `apps/web/server/routers/library.integration.test.ts` (EXTEND)

**New Test Scenarios:**
- Share file with group → members gain access
- Remove member from group → loses file access
- Delete group → all members lose file access
- Move to trash → file excluded from search

**Tenant Isolation Tests (Security-Critical):**
- User from tenant A cannot list groups from tenant B
- User from tenant A cannot view group detail from tenant B
- User from tenant A cannot add user from tenant B to their group
- File shared with group in tenant A is not accessible by user in tenant B
- Public group search only returns groups from user's tenant

---

**E2E Tests (Playwright or similar)**

**Test Flows:**
1. Create group → Add members → Share file → Verify access
   - User A creates "Marketing Team"
   - User A adds User B and User C
   - User A shares file with "Marketing Team" (read permission)
   - User B logs in → sees file in "Shared Groups" tab → can view but not edit
   - User C logs in → same behavior

2. Delete file → View trash → Restore
   - User A deletes file → moves to trash
   - User A sees file in Trash tab
   - User B (sharee) does NOT see file in "Shared With Me" (interview Q2)
   - User A restores file → User B sees it again in "Shared With Me"

3. Permission downgrade takes effect immediately (interview Q7)
   - User A shares file with User B (delete permission)
   - User B can edit file
   - User A changes User B's permission to read
   - User B refreshes → can no longer edit (only view)

---

## Part 6: Deployment & Rollout

### 6.1 Pre-Deployment Checklist

**Database:**
- [ ] Backup production database
- [ ] Test migrations in staging environment
- [ ] Verify all indexes created with correct WHERE clauses
- [ ] Verify foreign keys have correct ON DELETE behavior

**Backend:**
- [ ] All new endpoints have input validation
- [ ] All new endpoints have audit logging
- [ ] All new endpoints have error handling
- [ ] Trash auto-purge job is scheduled and tested

**Frontend:**
- [ ] All new components have loading states
- [ ] All new components have error states
- [ ] All new components have empty states
- [ ] All dialogs have proper ARIA attributes

**Performance:**
- [ ] Redis cache configured for group memberships
- [ ] Database connection pool sized appropriately (20-50)
- [ ] Partial indexes verified with EXPLAIN ANALYZE

---

### 6.2 Rollout Phases

**Phase 1: Alpha (Internal Testing) - Week 1**
- Deploy to staging environment
- Test with 5-10 internal users
- Create test groups, share test files, move to trash
- Monitor performance metrics
- Fix critical bugs

**Phase 2: Beta (Limited Release) - Week 2**
- Enable for 10% of production tenants (select tenants with < 100 files)
- Monitor logs for errors
- Monitor performance:
  - Permission check latency
  - Search latency
  - Cache hit rates
- Collect user feedback
- Iterate on UI/UX issues

**Phase 3: General Availability - Week 3+**
- Enable for all tenants
- Announce feature in changelog
- Provide user documentation:
  - How to create groups
  - How to share files with groups
  - How to manage trash
  - FAQ: When are files permanently deleted?
- Monitor adoption metrics:
  - % of users creating groups
  - Average groups per user
  - Average files shared per user

---

## Part 7: Known Limitations & Future Enhancements

### 7.1 Known Limitations (Accepted for MVP)

1. **Performance Limitation: In-Memory Filtering**
   - The existing `listLibraryDocuments()` function loads all tenant items into memory before applying permission filters
   - At 1000+ files, this creates latency regardless of caching
   - **Mitigation for MVP:** Pagination limits memory impact to 50 items max per render
   - **Post-MVP task:** Refactor to push permission filtering into SQL WHERE clause

2. **Notification System** — Phase 2 (in-app + email not in MVP)
   - Users won't receive notifications when granted/revoked access
   - Workaround: Users can check "Shared With Me" tab periodically

3. **Audit Log UI** — Admin-only, no user-facing history
   - Users can't see who shared a file or when
   - Admins can query existing audit logger for share history

4. **No Transfer Ownership** — Group owner cannot transfer ownership to another admin
   - Owner must delete group or remain owner forever
   - Future enhancement: Add transfer ownership feature

5. **No Bulk Operations** — Cannot share with multiple groups at once
   - Must add each group individually in Share Dialog
   - Future enhancement: Multi-select groups

---

### 7.2 Future Enhancements (Post-MVP)

**Phase 2 Features:**
- In-app + email notifications (interview Q5)
- Notification preferences (opt-out of email, keep in-app)
- Notification bell icon in header

**Post-MVP Features:**
- Share via public link (read-only, expirable)
- Group templates (pre-defined group types: "Project Team", "Department")
- Activity log for file access (who viewed/downloaded)
- Group-level storage quotas
- Advanced permission: "Can share" (separate from delete)
- Bulk share operations (select multiple files, share all at once)
- Group hierarchies (nested groups: "Marketing" → "Content Team")
- Transfer group ownership
- Group soft delete with restoration

---

## Conclusion

This plan provides a comprehensive blueprint for implementing custom groups and permission-based file sharing in SmartSpecPro. The implementation follows existing codebase patterns (Drizzle ORM, tRPC, Radix UI), respects user requirements from the interview (immediate permission enforcement, owner-only trash, public groups), and applies best practices from research (filter-first search, partial indexes, minimal caching).

The phased rollout approach minimizes risk, and the extensive testing strategy ensures quality. Performance optimizations (caching, batching, indexes) are designed to support large-scale tenants (1000+ files, 100+ users), while security measures (tenant isolation, permission validation, rate limiting) protect against common vulnerabilities.

Implementation complexity is HIGH but manageable. Estimated effort: 6-7 weeks for Phases 1-5 (MVP), with an additional 1-2 weeks for notifications (Phase 6). The modular architecture allows for parallel development (backend + frontend teams can work simultaneously after database schema is finalized).

**Key Success Metrics:**
- Permission check latency < 100ms
- Search latency with permissions < 1s
- User adoption: > 30% create groups within first month
- Zero security incidents related to permission bypass

**Risks & Mitigations:**
- **Risk:** Performance degrades with 1000+ files → **Mitigation:** Extensive load testing in beta phase
- **Risk:** Permission caching bugs cause stale access → **Mitigation:** No permission caching (interview Q7), only group membership caching with 1-minute TTL
- **Risk:** Cascading delete on group deletion causes data loss → **Mitigation:** Soft delete groups, permissions can be restored if group is restored

This plan is ready for implementation. Next step: Apply TDD approach (claude-plan-tdd.md) to generate test stubs for each section.

---

**End of Implementation Plan**
