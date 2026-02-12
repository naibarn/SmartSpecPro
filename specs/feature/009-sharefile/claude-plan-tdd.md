# TDD Plan: Custom Groups & Permission-based File Sharing

**Feature ID:** SSP-SHAREFILE-009
**TDD Plan Version:** 1.0
**Last Updated:** 2026-02-12
**Companion to:** `claude-plan.md`

---

## Overview

This document defines test stubs for each implementation section in the main plan. Write these tests BEFORE implementing the corresponding functionality to follow Test-Driven Development (TDD) methodology.

**Testing Framework:** Vitest
**Test Locations:**
- Router integration tests: `apps/web/server/routers/*.test.ts`
- Service unit tests: `apps/web/server/services/*.test.ts`
- Frontend component tests: `apps/web/client/src/components/**/*.test.tsx`

**Test Patterns:**
- Service unit tests for business logic validation
- Router integration tests for tRPC endpoint validation
- Component tests for UI behavior and accessibility

---

## Part 1: Database Foundation

### 1.1 New Tables

**Test File:** `apps/web/drizzle/schema.test.ts` (NEW)

**Test Stubs:**
- Test: user_groups table schema is valid (Drizzle type check)
- Test: group_members table schema is valid (Drizzle type check)
- Test: user_groups has partial unique index on (tenantId, name) WHERE deletedAt IS NULL
- Test: group_members has foreign keys with correct ON DELETE behavior
- Test: user_groups.settings JSONB column accepts valid visibility/joinPolicy values
- Test: user_groups.memberCount defaults to 0 on insert

### 1.2 Schema Updates

**Test File:** `apps/web/drizzle/schema.test.ts` (EXTEND)

**Test Stubs:**
- Test: library_permissions.subjectType enum includes "group"
- Test: library_permissions.permissionLevel enum includes "delete"
- Test: library_items.deletedBy foreign key points to users.id with ON DELETE SET NULL
- Test: existing permissions remain valid after schema update

### 1.3 Migration Execution Plan

**Verification Stubs:**
- Verify: user_groups table exists after migration
- Verify: group_members table exists after migration
- Verify: library_items.deletedBy column exists
- Verify: library_permissions accepts "group" subjectType
- Verify: row counts match pre-migration baseline

---

## Part 2: Backend Services

### 2.1 Groups Service Layer

**Test File:** `apps/web/server/services/groupsService.test.ts` (NEW)

**Test Stubs:**

**createUserGroup:**
- Test: creates group with valid input and actor as owner
- Test: creates initial membership with owner as admin
- Test: transaction rolls back if membership creation fails
- Test: rejects duplicate group name in same tenant
- Test: rejects when user exceeds 50 groups limit
- Test: allows duplicate group names in different tenants
- Test: allows recreating deleted group name after soft delete

**getUserGroups:**
- Test: returns all active groups for user in tenant
- Test: excludes deleted groups (deletedAt IS NOT NULL)
- Test: excludes removed memberships (status = 'removed')
- Test: caches results in Redis with 1-minute TTL
- Test: serves from cache on subsequent calls within TTL

**addGroupMember:**
- Test: adds member with valid inputs and actor is admin
- Test: rejects when actor is not group admin
- Test: rejects when target user is from different tenant (cross-tenant isolation)
- Test: rejects when group exceeds 100 members limit
- Test: rejects when user is already a member
- Test: transaction wraps membership insert + memberCount increment
- Test: invalidates cache only for added user
- Test: increments group.memberCount by 1

**removeGroupMember:**
- Test: removes member when actor is group admin
- Test: allows self-removal (userId === actor)
- Test: prevents owner from removing themselves
- Test: transaction wraps membership update + memberCount decrement
- Test: sets status = 'removed' and removedAt timestamp
- Test: decrements group.memberCount by 1
- Test: invalidates cache only for removed user

**deleteUserGroup:**
- Test: soft deletes group when actor is owner
- Test: rejects when actor is not owner
- Test: transaction wraps soft delete + permission cascade
- Test: sets deletedAt timestamp
- Test: deletes all library_permissions where subjectType = 'group' AND subjectId = groupId
- Test: invalidates cache for all members

**approveJoinRequest:**
- Test: approves join request when actor is admin
- Test: rejects when actor is not admin
- Test: changes membership status from 'pending' to 'active'
- Test: increments group.memberCount
- Test: rejects when membership is not in 'pending' status

**searchPublicGroups:**
- Test: returns only public groups in actor's tenant
- Test: filters by name/description ILIKE pattern
- Test: excludes deleted groups
- Test: paginates results correctly
- Test: excludes groups from other tenants

### 2.2 Library Service Updates

**Test File:** `apps/web/server/services/libraryService.test.ts` (EXTEND)

**Test Stubs:**

**Pre-requisite Refactoring:**
- Test: hasTenantRoleShare (renamed from hasGroupShare) works with existing data
- Test: tenantRoleMatches (renamed from groupMatches) filters correctly
- Test: no references to old hasGroupShare function remain

**rankPermissionLevel:**
- Test: returns correct rank for 'read' (1)
- Test: returns correct rank for 'write' (2)
- Test: returns correct rank for 'delete' (3)
- Test: returns correct rank for 'owner' (4)

**canManageLibraryItem:**
- Test: returns true for 'owner' permission level
- Test: returns true for 'delete' permission level
- Test: returns false for 'write' permission level
- Test: returns false for 'read' permission level

**getUserEffectivePermission:**
- Test: includes group permissions in resolution
- Test: returns highest permission level when multiple sources exist
- Test: returns all permission sources in sources array
- Test: includes direct user share in sources
- Test: includes group share in sources with groupName
- Test: returns null when user has no access
- Test: handles user in multiple groups with different permissions

**shareLibraryItem:**
- Test: creates permission for subjectType = 'group'
- Test: validates group exists before creating permission
- Test: validates group is in same tenant as item
- Test: rejects when actor lacks 'delete' or 'owner' permission

**softDeleteLibraryItem:**
- Test: sets deletedAt timestamp
- Test: sets deletedBy to actor.userId
- Test: existing soft deletes remain functional

**searchLibraryWithPermissions:**
- Test: includes files shared via group permissions
- Test: excludes deleted files (deletedAt IS NOT NULL)
- Test: filters by owner, direct share, group share, role share, and public
- Test: handles user with no groups gracefully

### 2.3 tRPC Routers

**Test File:** `apps/web/server/routers/groups.test.ts` (NEW)

**Test Stubs:**

**groups.list:**
- Test: returns user's owned groups when scope = 'my_groups'
- Test: returns user's memberships when scope = 'member_of'
- Test: returns all user's groups when scope = 'all'
- Test: rejects unauthenticated requests

**groups.get:**
- Test: returns group with members for valid groupId
- Test: rejects when user is not a member
- Test: rejects when group doesn't exist
- Test: includes pending join requests for admins

**groups.create:**
- Test: creates group with valid input
- Test: rejects duplicate group name in tenant
- Test: rejects when user exceeds 50 groups limit

**groups.addMember:**
- Test: adds member when actor is admin
- Test: rejects when actor is not admin
- Test: rejects cross-tenant member addition

**groups.removeMember:**
- Test: removes member when actor is admin
- Test: allows self-removal

**groups.leave:**
- Test: allows member to leave group
- Test: prevents owner from leaving

**groups.delete:**
- Test: deletes group when actor is owner
- Test: rejects when actor is not owner
- Test: cascades to library_permissions deletion

**groups.searchPublic:**
- Test: returns public groups in actor's tenant
- Test: excludes private groups
- Test: excludes deleted groups

**groups.join:**
- Test: joins open group immediately
- Test: rejects join for invite-only groups

**Router Registration:**
- Test: groupsRouter is registered in appRouter
- Test: groups.* endpoints are accessible via tRPC client

**Test File:** `apps/web/server/routers/library.test.ts` (EXTEND)

**Test Stubs:**

**library.shareItem:**
- Test: accepts subjectType = 'group'
- Test: validates group exists
- Test: validates group is in same tenant

**library.removeShare:**
- Test: removes permission when actor has 'delete' or 'owner' permission
- Test: rejects when actor lacks permission
- Test: deletes correct permission entry

**library.updateSharePermission:**
- Test: updates permission level when actor has 'delete' or 'owner' permission
- Test: rejects when actor lacks permission
- Test: updates correct permission entry

**library.listTrash:**
- Test: returns only owner's deleted items
- Test: excludes items deleted by others
- Test: includes deletedAt, deletedBy, daysUntilPurge

**library.restoreFromTrash:**
- Test: restores item when actor is owner or deleter
- Test: rejects when actor is neither owner nor deleter
- Test: clears deletedAt and deletedBy

**library.permanentDelete:**
- Test: deletes item when actor is owner
- Test: deletes item when actor is admin and daysInTrash >= 90
- Test: rejects when actor is not owner or admin
- Test: deletes chunks, permissions, and item (hard delete)

### 2.4 Background Jobs

**Test File:** `apps/web/server/jobs/purgeOldTrashItems.test.ts` (NEW)

**Test Stubs:**
- Test: identifies items with deletedAt < (NOW() - 90 days)
- Test: deletes S3/R2 files for sourceUrl and thumbnailUrl
- Test: deletes from vector DB (handles errors gracefully)
- Test: deletes library_chunks rows
- Test: deletes library_permissions rows
- Test: hard deletes library_items rows
- Test: logs count of purged items
- Test: handles vector deletion failures without crashing
- Test: retries DB deletion failures via BullMQ

---

## Part 3: Frontend Implementation

### 3.1 Group Management UI

**Test File:** `apps/web/client/src/pages/GroupManagement.test.tsx` (NEW)

**Test Stubs:**
- Test: renders "My Groups" tab with user's owned groups
- Test: renders "Member Of" tab with user's memberships
- Test: renders "Public Groups" tab with searchable public groups
- Test: opens CreateGroupDialog on "Create Group" button click
- Test: navigates to GroupDetailPanel on group card click
- Test: shows empty state when no groups exist

**Routing Tests:**
- Test: /groups route renders GroupManagement component
- Test: /groups/discover route renders GroupDiscovery component
- Test: /groups/:groupId route renders GroupDetailPanel component
- Test: routes require authentication (redirects to login if not authenticated)

**Navigation Tests:**
- Test: Groups link appears in sidebar navigation
- Test: Groups link routes to /groups correctly

**Test File:** `apps/web/client/src/components/groups/GroupDetailPanel.test.tsx` (NEW)

**Test Stubs:**
- Test: renders group name, icon, member count
- Test: shows "Edit" button only for owner/admin
- Test: shows "Delete Group" button only for owner
- Test: shows "Leave Group" button only for members (not owner)
- Test: shows pending join requests section only for admins
- Test: renders member list with roles
- Test: calls removeMember mutation on remove action
- Test: calls leave mutation on "Leave Group" button click
- Test: calls delete mutation on "Delete Group" button click
- Test: calls approveMember mutation on approve action
- Test: calls rejectMember mutation on reject action

**Test File:** `apps/web/client/src/components/groups/CreateGroupDialog.test.tsx` (NEW)

**Test Stubs:**
- Test: validates required name field
- Test: enforces max 128 chars for name
- Test: enforces max 512 chars for description
- Test: shows "Join Policy" options only when visibility = 'public'
- Test: calls create mutation on submit
- Test: calls update mutation on submit (edit mode)
- Test: shows error on duplicate group name

**Test File:** `apps/web/client/src/components/groups/AddMemberDialog.test.tsx` (NEW)

**Test Stubs:**
- Test: debounces user search (300ms delay)
- Test: excludes users already in group
- Test: renders user avatars and names in results
- Test: selects role (Member/Admin) via radio buttons
- Test: calls addMember mutation on "Add" button click

**Test File:** `apps/web/client/src/pages/GroupDiscovery.test.tsx` (NEW)

**Test Stubs:**
- Test: searches public groups with query input
- Test: filters groups by sort option (member count, created date)
- Test: shows "Join" button for open groups
- Test: shows "Request Join" button for request-to-join groups
- Test: shows "Invite Only" badge for invite-only groups (no button)
- Test: calls join mutation on "Join" button click
- Test: calls requestJoin mutation on "Request Join" button click

### 3.2 File Sharing UI

**Test File:** `apps/web/client/src/components/library/ShareButton.test.tsx` (NEW)

**Test Stubs:**
- Test: renders share icon button
- Test: shows badge with share count when shares exist
- Test: opens ShareDialog on click
- Test: has accessible tooltip

**Test File:** `apps/web/client/src/components/library/ShareDialog.test.tsx` (NEW)

**Test Stubs:**
- Test: renders user search input (separate from groups)
- Test: renders group dropdown (separate from users)
- Test: debounces user search (300ms delay)
- Test: shows current shares with permission levels
- Test: shows owner row with disabled remove button
- Test: shows multiple sources for users with multiple permissions
- Test: calls shareItem mutation on "Add" button click
- Test: calls removeShare mutation on remove action
- Test: calls updateSharePermission mutation on permission change
- Test: loads user's groups for group dropdown
- Test: loads current shares on mount

**Test File:** `apps/web/client/src/components/library/PermissionBadge.test.tsx` (NEW)

**Test Stubs:**
- Test: renders 'read' badge with blue color and eye icon
- Test: renders 'write' badge with green color and edit icon
- Test: renders 'delete' badge with orange color and trash icon
- Test: renders 'owner' badge with purple color and crown icon
- Test: has correct ARIA attributes (role="status", aria-label)
- Test: icon has aria-hidden="true"

### 3.3 Trash UI

**Test File:** `apps/web/client/src/components/library/TrashPanel.test.tsx` (NEW)

**Test Stubs:**
- Test: renders only owner's deleted items
- Test: shows relative deleted date ("5 days ago")
- Test: shows days until auto-purge (90 - daysSinceDeletion)
- Test: shows warning badge when < 7 days remaining
- Test: shows "Deleted by" user name
- Test: calls restoreFromTrash mutation on "Restore" button click
- Test: calls permanentDelete mutation on "Delete" button click
- Test: shows empty state when trash is empty
- Test: renders as 4th tab in DocumentManagement

---

## Part 4: Performance Optimization

### 4.1 Caching Strategy

**Test File:** `apps/web/server/services/groupsService.test.ts` (EXTEND - Caching)

**Test Stubs:**
- Test: getUserGroups caches results in Redis with 1-minute TTL
- Test: getUserGroups serves from cache on second call within TTL
- Test: getUserGroups cache expires after 60 seconds
- Test: cache key format is `user:{userId}:groups:{tenantId}`
- Test: addGroupMember invalidates only added user's cache
- Test: removeGroupMember invalidates only removed user's cache
- Test: deleteUserGroup invalidates all members' caches
- Test: cache stores minimal data (id, name, role)

### 4.2 Database Query Optimization

**Test File:** `apps/web/server/services/libraryService.test.ts` (EXTEND - Performance)

**Test Stubs:**
- Test: batchGetUserPermissions fetches all items in one query (not N+1)
- Test: batchGetUserPermissions returns Map<itemId, PermissionInfo>
- Test: batchGetUserPermissions uses inArray for itemIds
- Test: batchGetUserPermissions fetches user's groups once (cached)
- Test: pagination limits results to configured page size
- Test: partial indexes are used for deletedAt IS NULL queries (verify EXPLAIN)

### 4.3 Performance Monitoring

**Test File:** `apps/web/server/middleware/performanceMonitoring.test.ts` (NEW)

**Test Stubs:**
- Test: logs permission check latency for each request
- Test: logs search latency with permissions
- Test: logs group operation latency
- Test: tracks cache hit rate for group membership queries
- Test: tracks database connection pool utilization

---

## Part 5: Security & Testing

### 5.1 Security Checklist

**Test File:** `apps/web/server/routers/security.test.ts` (NEW - Cross-cutting Security)

**Test Stubs:**

**Tenant Isolation:**
- Test: user from tenant A cannot list groups from tenant B
- Test: user from tenant A cannot view group detail from tenant B
- Test: user from tenant A cannot add user from tenant B to their group
- Test: file shared with group in tenant A is not accessible by user in tenant B
- Test: public group search only returns groups from user's tenant

**Permission Validation:**
- Test: write/delete operations require getUserEffectivePermission check
- Test: client-side permission checks are verified server-side
- Test: permission hierarchy is respected (read < write < delete < owner)
- Test: permission expiration dates are enforced

**Group Admin Authorization:**
- Test: only group owner or admins can add/remove members
- Test: only group owner can delete group
- Test: members can leave group voluntarily (except owner)

**Rate Limiting:**
- Test: createUserGroup enforces max 50 groups per user
- Test: addGroupMember enforces max 100 members per group

**Audit Logging:**
- Test: all group mutations are logged
- Test: all share mutations are logged
- Test: permission denial events are logged

### 5.2 Testing Strategy (Meta)

**Integration Test Coverage:**
- Test: end-to-end group creation flow
- Test: end-to-end member management flow
- Test: group deletion cascades to permissions
- Test: public group search and join flow
- Test: share file with group → members gain access
- Test: remove member from group → loses file access
- Test: delete group → all members lose file access
- Test: move to trash → file excluded from search

---

## Part 6: Deployment & Rollout

### 6.1 Pre-Deployment Checklist

**Verification Tests:**
- Test: all migrations apply cleanly in staging
- Test: indexes are created with correct WHERE clauses
- Test: foreign keys have correct ON DELETE behavior
- Test: all new endpoints have input validation
- Test: all new endpoints have audit logging
- Test: trash auto-purge job is scheduled and runs successfully
- Test: Redis cache is configured for group memberships
- Test: database connection pool is sized appropriately

### 6.2 Rollout Phases

**Alpha Testing (Week 1):**
- Test: create groups, share files, move to trash in staging
- Test: monitor performance metrics (permission check latency, search latency)
- Test: verify no critical bugs

**Beta Testing (Week 2):**
- Test: enable for 10% of production tenants
- Test: monitor logs for errors
- Test: monitor performance (cache hit rates, DB connection pool)
- Test: collect user feedback

**General Availability (Week 3+):**
- Test: enable for all tenants
- Test: monitor adoption metrics (% users creating groups, avg groups per user)

---

## Part 7: Known Limitations & Future Enhancements

### 7.1 Known Limitations

**No Test Stubs** - These are documented limitations, not implementation features.

### 7.2 Future Enhancements

**No Test Stubs** - These are post-MVP features, not current implementation scope.

---

## Conclusion

This TDD plan provides test stubs for all implementation sections in `claude-plan.md`. Write these tests BEFORE implementing the corresponding functionality to ensure:
- Test coverage is comprehensive
- Edge cases are considered early
- Regressions are caught immediately
- Code is testable by design

**Testing Priorities:**
1. **Security tests** (tenant isolation, permission validation) — CRITICAL
2. **Service layer tests** (business logic, transactions) — HIGH
3. **Router integration tests** (tRPC endpoints) — HIGH
4. **Component tests** (UI behavior, accessibility) — MEDIUM
5. **Performance tests** (caching, batching) — MEDIUM

**Next Step:** Proceed to Step 17 (Context Check) before splitting into sections.

---

**End of TDD Plan**
