# Code Review Interview Transcript - Section 05

## User Decisions

### Issue #1: All 6 new procedures bypass the service layer
**Question:** Should we move the 6 new procedures to libraryService.ts?
**User Decision:** Move to service layer
**Action:** Create service functions for all 6 procedures, router becomes thin wrapper

### Issue #10: listTrash only shows owner's items
**Question:** Should listTrash show items the user deleted (not just owned)?
**User Decision:** Owner + deleter
**Action:** Use `OR(ownerUserId = userId, deletedBy = userId)` filter

## Auto-Fixes to Apply

### Issue #2: permanentDelete ignores domain_admin role
**Severity:** CRITICAL
**Fix:** Add `|| ctx.user.role === "domain_admin"` check (in new service function)

### Issue #3: restoreFromTrash UPDATE not scoped by tenantId
**Severity:** CRITICAL
**Fix:** Add `eq(libraryItems.tenantId, tenantId)` to UPDATE WHERE clause (in new service function)

### Issue #4: getItemShares exposes user emails
**Severity:** CRITICAL
**Fix:** Remove email fallback, use `users.name` only (in new service function)

### Issue #13: restoreFromTrash SELECT+UPDATE not in transaction
**Severity:** MEDIUM
**Fix:** Wrap in `db.transaction()` (in new service function)

### Issue #17: Unnecessary `as any` cast on tenantId
**Severity:** LOW
**Fix:** Remove `as any` casts — string is assignable to `string | number`

## Deferred Items

### Issue #5: getItemShares N+1 query
**Decision:** Defer to section-10 caching optimization

### Issue #6: removeShare/updateSharePermission don't filter expired permissions
**Decision:** Edge case, low risk at this stage

### Issue #7: Missing storage cleanup in permanentDelete
**Decision:** storageDelete doesn't exist yet, out of scope

### Issue #8: Missing vector DB cleanup
**Decision:** Out of scope, orphaned vectors acceptable per plan

### Issue #9: restoreFromTrash hardcodes status: "ready"
**Decision:** Acceptable default, original status lost after soft-delete

### Issues #11, #12, #14, #15, #16, #18, #19: Minor/format/optimization
**Decision:** Deferred — style, test stubs, audit format, SELECT optimization

## Summary of Changes

**Service Layer Additions (libraryService.ts):**
1. `removeLibraryShare(input, actor, dbClient?)` — Delete permission entry with manage check
2. `updateLibrarySharePermission(input, actor, dbClient?)` — Update permission level with manage check
3. `getLibraryItemShares(itemId, actor, dbClient?)` — List shares with resolved names (no email)
4. `listLibraryTrash(input, actor, dbClient?)` — Owner OR deleter trash list with pagination
5. `restoreFromLibraryTrash(itemId, actor, dbClient?)` — Restore with transaction, tenant-scoped UPDATE
6. `permanentDeleteLibraryItem(itemId, actor, dbClient?)` — Hard delete with domain_admin support

**Router Fixes (library.ts):**
1. Replace raw DB access with service function calls
2. Remove `as any` casts on tenantId
3. Thin wrapper pattern matching existing procedures
