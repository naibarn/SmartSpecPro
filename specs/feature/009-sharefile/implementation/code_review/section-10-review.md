# Code Review: Section 10 - Caching & Optimization

## HIGH Severity Issues

### H1: `getUserPermissionLevel` still ignores group permissions — permission bypass on single-item operations

**Files:** `apps/web/server/services/libraryService.ts` lines 596-630

**Problem:** The function `getUserPermissionLevel()` only queries `user` and `tenant_role` subject types from `libraryPermissions`. It does NOT query or resolve `group` permissions at all. This function is used as the permission gate for **six critical code paths** that were NOT updated in this diff:

- `getLibraryItemById()` — reading a single item
- `updateLibraryItem()` — modifying an item
- `softDeleteLibraryItem()` — soft-deleting an item
- `shareLibraryItem()` — sharing an item
- `getLibraryMarkdownContent()` — reading markdown content
- `saveLibraryMarkdown()` — saving markdown content

This means: if a file is shared with a user solely via a **group share**, the user can see it in `listLibraryDocuments` and `searchLibraryItems` (those were updated), but they **cannot** open the file (`getLibraryItemById` returns null), cannot read its markdown content, cannot update it, and cannot share it further.

**Recommended Fix:** Update `getUserPermissionLevel()` to also fetch the user's groups (via cached `getUserGroups`) and include group permission rows, or replace all call sites with `getUserEffectivePermission()` which already handles groups correctly.

---

### H2: Three placeholder tests with `expect(true).toBe(true)` provide zero actual coverage

**File:** `apps/web/server/services/libraryService.test.ts` lines 449-471

Three tests in the `libraryService - Batch Permission Checks` describe block contain only `expect(true).toBe(true)`. These are fake tests.

**Recommended Fix:** Either write real behavioral tests or remove them.

---

## MEDIUM Severity Issues

### M1: `batchGetUserPermissions` function from plan not implemented

The plan specifies a standalone `batchGetUserPermissions()` function. Instead, group support was added inline to `getPermissionLevelForItem()`. Acceptable deviation but should be documented.

### M2: Performance monitoring middleware not implemented

Plan specifies `performanceMonitoring.ts` — not created. Defer to section 12.

### M3: Pagination constants not added to router

Plan specifies `LIBRARY_PAGE_SIZE` etc. constants. Not implemented. Low impact since values are already inline.

### M4: `invalidateManyUsersGroupsCache` uses `Promise.all` instead of Redis pipeline

100 individual DEL commands vs 1 pipeline batch. Functionally correct but suboptimal.

### M5: Date deserialization issue in cached `getUserGroups` data

`Date` objects become strings after JSON serialization/deserialization. Current callers only use `id`/`name`/`role` so no impact, but future callers may be affected.

### M6: `getDocumentAccessSource` fallback is always `shared_group`

Dead code — the fallback on the last line returns the same value as the preceding condition.

## LOW Severity Issues

### L1: Missing plan-specified test stubs for cache correctness
### L2: `getLibraryItemShares` batch query doesn't filter users by tenant
### L3: `getPermissionLevelForItem` uses `Array.includes` instead of `Set.has` for group ID lookup
### L4: Plan specifies `GROUPS_CACHE_TTL` env var — not implemented (hardcoded to 60)
