# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-02-12T00:00:00Z

---

# Architecture Review: Custom Groups & Permission-based File Sharing (SSP-SHAREFILE-009)

**Plan location:** `/home/dev/projects/SmartSpecPro/specs/feature/009-sharefile/claude-plan.md`

**Review date:** 2026-02-12

---

## 1. Critical Issues

### 1.1 The "delete" permission level is not integrated into the existing permission ranking system

**Section affected:** Part 1.2 (Schema Updates) and Part 2.2 (Library Service Updates)

The plan adds `"delete"` to the `permissionLevel` enum (line 107: `Values: "read"`, `"write"`, `"delete"`, `"owner"`) but the existing permission ranking function at `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` lines 501-512 does not include `"delete"`:

```typescript
function rankPermissionLevel(permissionLevel: string | null | undefined): number {
  switch (permissionLevel) {
    case "owner":
      return 3;
    case "write":
      return 2;
    case "read":
      return 1;
    default:
      return 0;
  }
}
```

The plan does not specify what rank "delete" receives or where it fits in the hierarchy. Is "delete" > "write"? The plan says the hierarchy is `read < write < delete < owner` (line 883), but the existing `canManageLibraryItem` function (line 626-635) only checks for `"write"` or `"owner"`. A user with "delete" permission would NOT be able to edit files under the current logic. The plan needs to explicitly enumerate every place that permission-level comparisons occur and specify the new behavior for each.

### 1.2 Massive performance problem: listLibraryDocuments fetches ALL items for the tenant

**Section affected:** Part 4 (Performance Optimization)

The existing `listLibraryDocuments` function at `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` line 1144-1148 fetches **every non-deleted item in the tenant**, then filters and paginates in memory:

```typescript
const itemRows = await db
  .select()
  .from(libraryItems)
  .where(and(eq(libraryItems.tenantId, actorTenantId), isNull(libraryItems.deletedAt)))
  .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.createdAt), desc(libraryItems.id));
```

The plan claims to target "1000+ files" but this existing architecture already loads all rows into memory. Adding group permission lookups (which means also fetching the user's group memberships, then querying permissions by those group IDs) will compound this problem. The plan mentions "filter-first" strategy and batch permission checks (Part 4.2) but does not address the fundamental issue that `listLibraryDocuments` is an in-memory filter, not a SQL-level filter. At 1000+ items, this will be slow regardless of caching.

**Recommendation:** The plan should include a subtask to refactor `listLibraryDocuments` to push permission filtering down to SQL, or at minimum acknowledge this as a known limitation with a follow-up task. Without this, the claimed "< 1s search latency" target is not realistic at scale.

### 1.3 The existing code already has "shared_groups" scope but uses "tenant_role" -- naming collision

**Section affected:** Part 2.2 (Library Service Updates)

The existing code at `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` lines 1055-1076 already defines `getDocumentAccessSource`:

```typescript
function getDocumentAccessSource(
  item: Pick<LibraryItemRow, "ownerUserId" | "visibility">,
  actor: LibraryActor,
  permissionInfo: {
    hasDirectShare: boolean;
    hasGroupShare: boolean;
  },
): LibraryDocumentAccessSource {
```

Note that `hasGroupShare` currently refers to `tenant_role` shares (see lines 558-563 where `groupMatches` filters on `subjectType === "tenant_role"`). This is a confusing naming overlap. When real groups are added, `hasGroupShare` will need to represent actual group-based shares, but the existing code conflates "tenant_role" permissions with "group" semantics. The plan does not call out this refactoring risk.

**Recommendation:** Add a step to rename the existing `hasGroupShare`/`groupMatches` references to `hasTenantRoleShare`/`tenantRoleMatches` before adding real group support, to avoid logic errors during implementation.

### 1.4 Missing transaction safety on group deletion cascade

**Section affected:** Part 2.1 (`deleteUserGroup` in groupsService)

The plan says (lines 227-231):
> **CRITICAL:** Deletes ALL `library_permissions` where `subjectType = "group"` AND `subjectId = groupId`

This must be wrapped in a database transaction along with the soft-delete of the group itself. If the permission deletion succeeds but the group soft-delete fails (or vice versa), the system will be in an inconsistent state. The plan does not mention transactions anywhere, despite multiple operations that require atomicity (create group + create membership, delete group + cascade permissions, etc.).

**Recommendation:** Add explicit transaction boundaries for all multi-step mutations: group creation (group + initial membership), group deletion (soft delete + permission cascade), member removal (status update + memberCount decrement), etc.

---

## 2. Security Concerns

### 2.1 IDOR vulnerability in group member management

**Section affected:** Part 2.1 (Groups Service) and Part 2.3 (tRPC Routers)

The plan defines `addGroupMember(groupId, userId, role, actor)` and `removeMember(groupId, userId, actor)` but does not specify that the **target user must be in the same tenant**. The existing `addMember` validation (line 214) says "Validates actor is group admin" and "Checks group hasn't exceeded 100 members limit", but there is no check that the `userId` being added belongs to the same tenant.

Without tenant isolation on the target user, a group admin in tenant A could add a user from tenant B to their group, which would grant cross-tenant file access through group shares.

**Recommendation:** Add explicit validation: the target `userId` must be a member of the same tenant as the group's `tenantId`. This should be a mandatory check in `addGroupMember`, not just in the UI search.

### 2.2 Insufficient authorization check on `permanentDelete`

**Section affected:** Part 2.3 (`permanentDelete` mutation, line 402-403)

The plan specifies:
> Check: User is owner (interview Q3) OR (admin AND daysInTrash >= 90)

This allows admins to permanently delete any user's files after 90 days. However, it does not specify whether this means tenant admins or system admins. The existing role hierarchy is `user < admin < domain_admin`. A regular `admin` being able to permanently delete other users' files may be a privilege escalation. Clarify which role level is required.

### 2.3 Missing rate limiting on group operations

**Section affected:** Part 5.1 (Security Checklist)

The plan lists "Max 20 shares per minute per user (TBD: implement rate limiter)" (line 893) but marks it as TBD. Group creation, join requests, and member additions should also have rate limits to prevent abuse. A malicious user could spam group creation up to the 50-group limit or flood join requests.

### 2.4 Permission check on `restoreFromTrash`

**Section affected:** Part 2.3 (`restoreFromTrash` mutation, line 397-398)

The plan says:
> Check: User is owner or deleter (from spec)

This means any user who deleted a shared file can restore it. But `deletedBy` could be any user with write permission. If user B (who had write access) soft-deleted a file owned by user A, and user A revoked user B's access while the file was in trash, user B could still restore the file because they are the "deleter." The plan should specify that restore authorization checks **current** permissions, not historical roles.

---

## 3. Data Model Issues

### 3.1 `subjectType` and `subjectId` in `library_permissions` are plain `varchar`, not enums

**Section affected:** Part 1.2 (Schema Updates)

The existing schema at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1494 uses plain `varchar` for `subjectType`:

```typescript
subjectType: varchar("subject_type", { length: 32 }).notNull(),
```

The plan says "Add `'group'` to CHECK constraint or enum" (line 113) but there is no CHECK constraint or enum in the schema -- it is a raw varchar. This means nothing actually prevents invalid `subjectType` values from being inserted today. The plan should either (a) add a CHECK constraint as part of this migration, or (b) rely purely on application-level validation. Either way, the migration strategy description is inaccurate.

Similarly, `permissionLevel` is a plain varchar (line 1496), not an enum. Adding "delete" requires no DDL changes, only application-level validation updates, which means the migration section is partially misleading.

### 3.2 Soft-deleted groups block namespace indefinitely, not just 90 days

**Section affected:** Part 7.1 (Known Limitations, item 3)

The plan says (line 1052): "Groups in trash still occupy namespace... they can't recreate 'Marketing Team' until 90 days pass." But the unique constraint `(tenantId, name)` (line 53) will prevent recreation forever since the soft-deleted group row is never hard-deleted -- there is no auto-purge job for groups, only for library items.

**Recommendation:** Either (a) change the unique constraint to include `WHERE deletedAt IS NULL` (partial unique index), or (b) add a group auto-purge job, or (c) explicitly document that the name is permanently consumed.

### 3.3 `memberCount` denormalization without database-level protection

**Section affected:** Part 1.1 (`user_groups` table, line 49)

The plan mentions (line 65): "`memberCount` is updated via triggers or application logic on add/remove member." Application-level counters drift over time due to race conditions, failed transactions, and bugs. The plan does not specify which approach to use or how to handle count inconsistencies.

**Recommendation:** Either use a Postgres trigger (reliable) or add a periodic reconciliation job. At minimum, document that the count is best-effort and the UI should not rely on it for access control decisions.

### 3.4 `user_groups.tenantId` is `varchar(36)` but `tenants.id` may be numeric

**Section affected:** Part 1.1 (user_groups table)

The tenantContext system at `/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantContext.ts` reveals that tenant IDs can be either numeric or string-based. The existing `libraryItems.tenantId` uses `varchar("tenant_id", { length: 36 })`, which is consistent. However, the plan's FK `tenantId -> tenants.id` with CASCADE should be verified against the actual `tenants.id` column type. If `tenants.id` is `serial` (integer), a varchar FK will not work in Postgres. Verify this before implementation.

---

## 4. Implementation Gaps

### 4.1 No storage deletion in trash auto-purge

**Section affected:** Part 2.4 (Trash Auto-Purge Job)

The purge job (lines 417-433) deletes from vector DB, `library_chunks`, `library_permissions`, and `library_items` but does NOT delete the actual file from S3/R2 storage. The `sourceUrl` and `thumbnailUrl` point to stored objects that will become orphaned. Over time, this will accumulate unbounded storage costs.

**Recommendation:** Add file storage cleanup (`storageDelete(sourceUrl)`, `storageDelete(thumbnailUrl)`) as the first step in the purge process.

### 4.2 No mention of registering the `groups` router in `appRouter`

**Section affected:** Part 2.3 (tRPC Routers)

The plan defines a new `groupsRouter` in `apps/web/server/routers/groups.ts` but does not mention registering it in `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` (the main router file, line 98: `export const appRouter = router({...})`). This is a simple step but easy to forget, and without it, all group endpoints will be unreachable.

### 4.3 Missing `removeShare` and `updateSharePermission` mutations

**Section affected:** Part 3.2 (Share Dialog)

The Share Dialog (lines 619-622) references three mutations:
- `trpc.library.shareItem.useMutation()` (add share) -- exists
- `trpc.library.removeShare.useMutation()` (remove share) -- **not defined anywhere in the plan**
- `trpc.library.updateSharePermission.useMutation()` (change permission) -- **not defined anywhere in the plan**

These two mutations are mentioned in the UI spec but their backend implementations are never described in Part 2.3 (library Router updates). This is a significant gap -- the Share Dialog cannot function without these endpoints.

### 4.4 Missing navigation/routing setup

**Section affected:** Part 3.1 (Group Management UI)

The plan creates new pages (`GroupManagement.tsx`, `GroupDiscovery.tsx`) but does not specify:
- What route paths they should use (e.g., `/groups`, `/groups/discover`)
- How to add them to the existing Wouter router in `App.tsx`
- Whether they need menu items in the sidebar navigation
- Whether they need the `protectedRoute` wrapper

### 4.5 No handling of `expiresAt` for permissions

**Section affected:** Throughout

The existing `library_permissions` table has an `expiresAt` column (line 1498 of schema.ts). The plan's new `shareLibraryItem` update (Part 2.2) does not address whether group shares can have expiration dates. The Share Dialog UI (Part 3.2) shows no expiration date picker. The plan should explicitly state whether group share expiration is supported in MVP or deferred.

### 4.6 Missing frontend query invalidation strategy

**Section affected:** Part 3 (Frontend Implementation)

When mutations occur (share, remove share, create group, delete group, etc.), the TanStack Query cache must be invalidated. The plan does not describe which query keys should be invalidated after each mutation. For example, after `trpc.groups.addMember.useMutation()` succeeds, the group detail query, group list query, and potentially the library document list all need to be refetched.

---

## 5. Architectural Concerns

### 5.1 Cache invalidation pattern invalidates too many users

**Section affected:** Part 4.1 (Caching Strategy)

The plan states (lines 736-737):
> Member added (invalidate added user's cache + all existing members' caches)

For a group with 100 members, adding one member triggers 101 Redis DEL operations. Removing a member triggers 100+ DEL operations. This creates O(N) Redis operations per group mutation, which becomes expensive at scale and creates a mini-thundering-herd when all 100 members' next requests cause cache misses simultaneously.

**Recommendation:** For the group member list cache, only the added/removed user's cache needs invalidation (their group membership changed). Other members' group membership lists are unaffected by someone joining or leaving. The "all existing members' caches" invalidation is only needed if the cached data includes a member list, which the plan's cache value (line 726-729) does NOT -- it only stores group IDs and roles.

### 5.2 getUserGroupsWithCache returns different data shapes

**Section affected:** Part 4.1 (Caching Strategy)

The cache example (lines 742-770) stores the full Drizzle join result in Redis, but the `batchGetUserPermissions` function (lines 796-830) only needs group IDs. The cached value should be a minimal, stable type -- not whatever Drizzle happens to return. A schema change to `user_groups` could break the cache without anyone noticing because the deserialized data shape would silently change.

### 5.3 The plan conflates two different "group" concepts

The existing codebase already uses "shared_groups" as a document scope and `hasGroupShare` for tenant_role-based permissions. The plan introduces actual user-created groups but does not clearly delineate how these interact. For example, in the `getDocumentAccessSource` function, will a file shared via user group return `"shared_group"` same as a file shared via tenant_role? The UI's "Shared Groups" tab would then mix both types, which may be confusing to users.

---

## 6. Testing Gaps

### 6.1 No negative test cases for cross-tenant isolation

**Section affected:** Part 5.2 (Testing Strategy)

The test cases (lines 907-943) cover happy paths but are missing critical security tests:
- User from tenant A cannot see groups from tenant B
- User from tenant A cannot add a user from tenant B to their group
- File shared with group in tenant A is not accessible by user in tenant B even if the user's ID matches a member ID
- Public group search is tenant-scoped

### 6.2 No concurrency tests

**Section affected:** Part 5.2 (Testing Strategy)

Given the `memberCount` denormalization and cache invalidation patterns, the plan should include tests for:
- Two admins simultaneously adding/removing members (memberCount race condition)
- Permission check during simultaneous permission revocation
- Group deletion while a member is actively using a shared file

---

## 7. Minor Issues and Suggestions

### 7.1 Inconsistent terminology: "interview Q1" through "interview Q12"

The plan references "interview" questions throughout (e.g., "interview Q1", "interview Q7", "interview Q12") but never defines what these are or links to the interview document. An implementer would need this context to understand the rationale behind certain decisions.

### 7.2 The `iconUrl` field on `user_groups` has no validation

**Section affected:** Part 1.1

The `iconUrl` column (line 47) is `text, optional avatar URL` but there is no mention of URL validation, allowed domains, or size limits. Given that this project has an `uploadContentSafety` module and URL validation policy, this URL should go through the same validation.

### 7.3 The plan does not mention the `listTenantUsers` implementation

**Section affected:** Part 2.3 (groups Router)

The `listTenantUsers` query (line 331) is defined as a groups router procedure, but searching users is a sensitive operation. The plan should specify:
- Which fields are returned (avoid leaking email addresses or other PII)
- Search matching logic (email partial match? name only?)
- Result limit to prevent enumeration attacks
- Whether disabled users should be excluded

### 7.4 No feature flag for gradual rollout

**Section affected:** Part 6.2 (Rollout Phases)

The plan describes enabling for "10% of production tenants" but does not describe the mechanism. The existing codebase has `isLibraryEnabledForTenant()` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryFeatureFlags.ts` (referenced in the library router, line 6). A similar feature flag pattern should be used for groups, and the plan should specify how it works.

### 7.5 The 90-day trash retention is hardcoded

**Section affected:** Part 2.4 (Background Jobs)

The 90-day retention period is hardcoded in the purge job. This should be a configurable system setting, stored in the `system_settings` table following the project's existing pattern. Different tenants may have different compliance requirements.

---

## Summary of Required Plan Amendments

**Must fix before implementation (blockers):**
1. Define "delete" permission ranking and update all permission comparison functions
2. Add transaction boundaries for multi-step mutations
3. Add cross-tenant isolation check in `addGroupMember`
4. Define `removeShare` and `updateSharePermission` backend mutations
5. Fix the soft-delete namespace collision (partial unique index)
6. Address the confusing naming overlap between existing `hasGroupShare` (tenant_role) and actual groups

**Should fix (high risk if deferred):**
7. Add S3/R2 storage cleanup to trash purge job
8. Plan a refactoring path for `listLibraryDocuments` to avoid loading all items in memory
9. Register the groups router in `appRouter`
10. Add cross-tenant isolation tests
11. Simplify cache invalidation to avoid O(N) Redis operations per group mutation

**Nice to have (can be deferred):**
12. Feature flag mechanism for groups
13. Configurable trash retention period
14. Route/navigation setup for new pages
15. Frontend query invalidation strategy documentation
16. Concurrency/race condition tests
