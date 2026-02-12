<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database-schema
section-02-groups-service
section-03-library-service
section-04-groups-router
section-05-library-router
section-06-trash-job
section-07-group-management-ui
section-08-file-sharing-ui
section-09-trash-ui
section-10-caching-optimization
section-11-security-tests
section-12-deployment-verification
END_MANIFEST -->

# Implementation Sections Index

Custom Groups & Permission-based File Sharing (SSP-SHAREFILE-009)

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database-schema | - | 02, 03, 04, 05, 06 | Yes |
| section-02-groups-service | 01 | 04, 07, 10, 11 | No |
| section-03-library-service | 01 | 05, 08, 09, 10, 11 | No |
| section-04-groups-router | 02 | 07, 11 | Yes |
| section-05-library-router | 03 | 08, 09, 11 | Yes |
| section-06-trash-job | 01 | 12 | Yes |
| section-07-group-management-ui | 04 | 11, 12 | Yes |
| section-08-file-sharing-ui | 05 | 11, 12 | Yes |
| section-09-trash-ui | 05 | 11, 12 | Yes |
| section-10-caching-optimization | 02, 03 | 11, 12 | Yes |
| section-11-security-tests | 02, 03, 04, 05, 06 | 12 | Yes |
| section-12-deployment-verification | 01-11 | - | No |

## Execution Order

**Batch 1:** (Database foundation)
1. section-01-database-schema (no dependencies)

**Batch 2:** (Service layer - parallel)
2. section-02-groups-service (after 01)
3. section-03-library-service (after 01)

**Batch 3:** (Routers & jobs - parallel)
4. section-04-groups-router (after 02)
5. section-05-library-router (after 03)
6. section-06-trash-job (after 01)

**Batch 4:** (Frontend UI - parallel)
7. section-07-group-management-ui (after 04)
8. section-08-file-sharing-ui (after 05)
9. section-09-trash-ui (after 05)

**Batch 5:** (Optimization & testing - parallel)
10. section-10-caching-optimization (after 02, 03)
11. section-11-security-tests (after 02, 03, 04, 05, 06)

**Batch 6:** (Final verification)
12. section-12-deployment-verification (after all)

## Section Summaries

### section-01-database-schema
**Scope:** Database migrations and schema changes
**Files:** `apps/web/drizzle/schema.ts`, migration SQL files
**Key Tasks:**
- Create `user_groups` and `group_members` tables
- Add partial unique index for soft-delete namespace collision fix
- Extend `library_permissions` with "group" subjectType and "delete" permissionLevel
- Add `deletedBy` column to `library_items`
- Run and verify migrations

**Tests:** Schema validation, migration verification, index creation

---

### section-02-groups-service
**Scope:** Groups service layer business logic
**Files:** `apps/web/server/services/groupsService.ts` (NEW)
**Key Tasks:**
- Implement `createUserGroup` with transaction boundaries
- Implement `getUserGroups` with Redis caching (1-minute TTL)
- Implement `addGroupMember` with cross-tenant isolation check
- Implement `removeGroupMember` with transaction boundaries
- Implement `deleteUserGroup` with permission cascade
- Implement `approveJoinRequest`, `rejectJoinRequest`, `searchPublicGroups`

**Tests:** Service unit tests for all functions, transaction rollback, cache invalidation, tenant isolation

---

### section-03-library-service
**Scope:** Library service updates for group permissions
**Files:** `apps/web/server/services/libraryService.ts` (EXTEND)
**Key Tasks:**
- Pre-requisite refactoring: Rename `hasGroupShare` → `hasTenantRoleShare`
- Update `rankPermissionLevel` for "delete" permission
- Update `canManageLibraryItem` to allow "delete" level
- Update `getUserEffectivePermission` to include group permissions
- Update `shareLibraryItem` to support `subjectType = "group"`
- Update `softDeleteLibraryItem` to set `deletedBy`
- Update `searchLibraryWithPermissions` to include group shares and exclude trash

**Tests:** Service unit tests for permission resolution, multi-source permissions, group share filtering, trash exclusion

---

### section-04-groups-router
**Scope:** Groups tRPC router endpoints
**Files:** `apps/web/server/routers/groups.ts` (NEW), `apps/web/server/routers.ts` (EXTEND)
**Key Tasks:**
- Implement all groups procedures (list, get, create, update, delete, addMember, removeMember, leave, etc.)
- Add Zod input validation for all endpoints
- Add error handling with TRPCError codes
- Add audit logging for all mutations
- Register `groupsRouter` in `appRouter`

**Tests:** Router integration tests for all endpoints, validation, authorization, error handling

---

### section-05-library-router
**Scope:** Library router updates for sharing and trash
**Files:** `apps/web/server/routers/library.ts` (EXTEND)
**Key Tasks:**
- Update `shareItem` to accept `subjectType = "group"`
- Implement `removeShare` mutation
- Implement `updateSharePermission` mutation
- Update `getItemShares` to populate group names
- Implement `listTrash` query
- Implement `restoreFromTrash` mutation
- Implement `permanentDelete` mutation

**Tests:** Router integration tests for sharing, trash operations, permission validation

---

### section-06-trash-job
**Scope:** Background job for auto-purging trash
**Files:** `apps/web/server/jobs/purgeOldTrashItems.ts` (NEW)
**Key Tasks:**
- Implement BullMQ job for daily execution (2 AM)
- Implement 90-day cutoff logic
- Add S3/R2 storage cleanup for sourceUrl and thumbnailUrl
- Add vector DB deletion (with error handling)
- Add hard delete cascade (chunks → permissions → items)
- Register job in server startup

**Tests:** Job unit tests for cutoff calculation, deletion cascade, error handling, retry logic

---

### section-07-group-management-ui
**Scope:** Group management React components
**Files:** `apps/web/client/src/pages/GroupManagement.tsx`, `apps/web/client/src/components/groups/*`, `apps/web/client/src/App.tsx` (routing)
**Key Tasks:**
- Implement GroupManagement page with tabs (My Groups, Member Of, Public Groups)
- Implement GroupDetailPanel with member list, leave button, pending requests
- Implement CreateGroupDialog with form validation
- Implement AddMemberDialog with user search
- Implement GroupDiscovery page for public group search
- Add routing configuration (/groups, /groups/discover, /groups/:groupId)
- Add sidebar navigation link

**Tests:** Component tests for rendering, user interactions, mutations, accessibility

---

### section-08-file-sharing-ui
**Scope:** File sharing React components
**Files:** `apps/web/client/src/components/library/ShareButton.tsx`, `ShareDialog.tsx`, `PermissionBadge.tsx`
**Key Tasks:**
- Implement ShareButton with share count badge
- Implement ShareDialog with separate user search and group dropdown
- Implement PermissionBadge with color-coded permission levels
- Add multi-source permission display (interview Q12)
- Add removeShare and updateSharePermission mutations

**Tests:** Component tests for sharing, permission display, accessibility (ARIA attributes)

---

### section-09-trash-ui
**Scope:** Trash management React components
**Files:** `apps/web/client/src/components/library/TrashPanel.tsx`, `apps/web/client/src/pages/DocumentManagement.tsx` (4th tab)
**Key Tasks:**
- Implement TrashPanel as 4th tab in DocumentManagement
- Display deleted items with deletedAt, deletedBy, daysUntilPurge
- Add restore and permanent delete actions
- Add empty state
- Add warning badge for items < 7 days from purge

**Tests:** Component tests for trash display, restore, permanent delete, empty state

---

### section-10-caching-optimization
**Scope:** Performance optimization with caching and batching
**Files:** `apps/web/server/services/groupsService.ts` (EXTEND), `apps/web/server/services/libraryService.ts` (EXTEND)
**Key Tasks:**
- Implement Redis cache for `getUserGroups` with 1-minute TTL
- Implement cache invalidation logic (simplified - only affected users)
- Implement `batchGetUserPermissions` for N+1 query elimination
- Verify partial indexes are used for soft-delete queries

**Tests:** Caching tests (hit rate, TTL, invalidation), batching tests (single query verification)

---

### section-11-security-tests
**Scope:** Security-critical integration tests
**Files:** `apps/web/server/routers/security.test.ts` (NEW), `apps/web/server/routers/groups.integration.test.ts` (NEW), `apps/web/server/routers/library.integration.test.ts` (EXTEND)
**Key Tasks:**
- Implement tenant isolation tests (5 critical tests)
- Implement permission validation tests
- Implement group admin authorization tests
- Implement rate limiting tests
- Implement audit logging verification tests
- Implement end-to-end integration tests (group creation → share → access)

**Tests:** All security-critical scenarios, tenant isolation, permission bypasses, cascade deletions

---

### section-12-deployment-verification
**Scope:** Pre-deployment checklist and verification
**Files:** Verification scripts, deployment documentation
**Key Tasks:**
- Run all tests in staging environment
- Verify migrations apply cleanly
- Verify indexes are created correctly
- Verify trash auto-purge job is scheduled
- Verify Redis cache configuration
- Document rollback procedures
- Create alpha testing plan (Week 1)
- Create beta testing plan (Week 2)

**Tests:** Deployment verification tests, smoke tests, rollback tests

---

## Notes

- **Total sections:** 12
- **Estimated parallel batches:** 6
- **Database changes:** Backward-compatible (existing data unaffected)
- **Test coverage target:** 80%+ for all new code
- **Security priority:** Tenant isolation tests are CRITICAL (must pass before deployment)

---

**End of Section Index**
