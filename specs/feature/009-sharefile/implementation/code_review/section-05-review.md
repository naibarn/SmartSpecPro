## Section 05: Library Router Updates - Code Review

### CRITICAL Issues

#### 1. SECURITY: Service Layer Bypass -- All 6 New Procedures Use Raw DB Access
All six new procedures (removeShare, updateSharePermission, getItemShares, listTrash, restoreFromTrash, permanentDelete) perform raw Drizzle ORM queries directly in the router instead of delegating to libraryService.ts. The existing procedures (deleteItem→softDeleteLibraryItem, shareItem→shareLibraryItem, getItem→getLibraryItemById) all use service functions. This splits authorization/validation logic across two layers, making it harder to audit, reuse, and test.

#### 2. SECURITY: permanentDelete ignores domain_admin role
Only checks `ctx.user.role === "admin"`, but the roleEnum includes "domain_admin" which should logically have at least the same privileges.

#### 3. SECURITY: restoreFromTrash UPDATE not scoped by tenantId
The SELECT query correctly filters by tenantId (line 819), but the UPDATE only uses `eq(libraryItems.id, input.itemId)` without tenant filter. Defense-in-depth violation — the plan's Security Notes state "Always filter by tenantId."

#### 4. SECURITY: getItemShares exposes user emails to any reader
Users with read-only permission can see emails of all other shared users via the fallback: `userName: userRows[0]?.name ?? userRows[0]?.email ?? null`. Plan specifies `userName` only.

### HIGH Issues

#### 5. getItemShares N+1 query: fires per-row DB query for each permission entry
For 50 shares, fires 50 additional queries. Should batch by subjectType using `inArray()`.

#### 6. removeShare/updateSharePermission don't filter expired permissions
Can operate on expired permission rows. Updating an expired share's permissionLevel effectively "revives" it.

#### 7. Missing storage cleanup in permanentDelete
Comment acknowledges storageDelete doesn't exist. Orphaned files accumulate in S3/R2.

#### 8. Missing vector DB cleanup in permanentDelete
libraryChunks rows are deleted but vector embeddings remain as orphans.

#### 9. restoreFromTrash hardcodes status: "ready"
Original status could have been "draft", "indexing", or "failed". Restoring to "ready" may create broken state.

#### 10. listTrash only shows items where ownerUserId = user
If User B (with delete permission) soft-deletes User A's file, User B cannot see it in their trash. Query should use `OR(ownerUserId = userId, deletedBy = userId)`.

### MEDIUM Issues

#### 11. `.select()` without column specification fetches all columns
Three queries use `.select()` on full tables including potentially large JSONB fields.

#### 12. getItemShares returns subjectId to read-only users
Enables user ID enumeration.

#### 13. restoreFromTrash SELECT+UPDATE not in a transaction
Between SELECT check and UPDATE, another user could permanently delete the item.

#### 14. Inconsistent dynamic vs static imports
New procedures use `await import()` for getDb/schema/drizzle-orm, but getUserEffectivePermission is imported statically. Groups router uses all static imports.

#### 15. 28 todo stubs with zero implemented tests

#### 16. Audit logger format inconsistency with plan (tenantId in requestPayload vs top-level actor field)

### LOW Issues

#### 17. `tenantId: tenantIdResolved as any` repeated — unnecessary cast
#### 18. Missing mimeType in listTrash response (plan specifies it)
#### 19. Magic number 86_400_000 appears twice

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 6 |
| MEDIUM | 6 |
| LOW | 3 |

Most architecturally significant: all 6 new procedures bypass the service layer with raw DB access in the router.
