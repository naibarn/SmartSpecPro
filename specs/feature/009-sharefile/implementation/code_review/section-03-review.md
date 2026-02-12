## CRITICAL SECURITY ISSUES

### HIGH SEVERITY

**1. MISSING TENANT ISOLATION IN getUserEffectivePermission() (Lines 216-218)**

The function fetches user groups but does NOT validate that the item belongs to the actor's tenant before processing permissions. The tenant check happens at line 194-196, but if the item exists in a different tenant, the function should return early with null permissions.

**Current Code (Line 202-207):**
```typescript
if (!item) {
  return {
    effectivePermissionLevel: null,
    sources: []
  };
}
```

**MISSING CHECK:** After this block, add:
```typescript
if (item.tenantId !== actorTenantId) {
  return {
    effectivePermissionLevel: null,
    sources: []
  };
}
```

**Impact:** Without this check, users could potentially query permissions for items in other tenants. While the WHERE clause filters by tenant (line 194-196), the explicit validation ensures defense-in-depth.

---

**2. DELETED GROUPS NOT FILTERED IN getUserEffectivePermission() (Lines 216-218, 252-270)**

The `getUserGroups()` function correctly filters out deleted groups (via `groupsService`), but the implementation doesn't verify that groups referenced in `library_permissions` are still active. If a group is soft-deleted but permissions still reference it, the permission resolution could fail silently or leak data.

**Current Code (Line 258-259):**
```typescript
const group = userGroups.find(g => g.id === Number(groupShare.subjectId));
```

**Issue:** If `groupShare.subjectId` references a deleted group, `group` will be undefined, and `groupName` will be 'Unknown Group'. However, the permission is STILL COUNTED in the effective permission level (lines 265-269).

**Fix Required:**
```typescript
for (const groupShare of groupShares) {
  const group = userGroups.find(g => g.id === Number(groupShare.subjectId));

  // SKIP permissions for deleted groups
  if (!group) {
    continue; // Don't count this permission
  }

  sources.push({...});
  // ... rest of logic
}
```

**Impact:** HIGH - Deleted groups could still grant permissions if their `library_permissions` entries aren't cascade-deleted. The plan assumes cascade deletion (section-02), but this code should be defensive.

---

**3. MISSING DELETED FILE FILTER IN searchLibraryItems() (Lines 1376-1397)**

The plan explicitly requires "excludes deleted files (deletedAt IS NOT NULL)" (test stub line 53), but the diff does NOT show `isNull(libraryItems.deletedAt)` being added to the WHERE clause in `searchLibraryItems()`.

**Current Code (Lines 1420-1631):** The WHERE clause fetches `chunkRows` and `permissionRows` but does NOT filter by `deletedAt`.

**Required Fix:** Add to the WHERE clause:
```typescript
.where(
  and(
    eq(libraryChunks.tenantId, actorTenantId),
    inArray(libraryChunks.libraryItemId, itemIds),
    // Join to libraryItems and add:
    isNull(libraryItems.deletedAt)  // <-- MISSING
  )
)
```

**Impact:** HIGH - Users can search and access deleted files, violating the requirement that "only owners see deleted files in Trash UI" (interview Q4).

---

### MEDIUM SEVERITY

**4. canManageLibraryItem() ALLOWS 'write' LEVEL TO MANAGE (Line 304)**

The plan states that only "delete" and "owner" should be able to manage items (share/modify permissions). However, the implementation STILL allows "write" level:

**Current Code (Line 304):**
```typescript
return permissionLevel === "write" || permissionLevel === "delete" || permissionLevel === "owner";
```

**Plan Requirement (Line 229):**
```typescript
function canManageLibraryItem(permissionLevel: string): boolean {
  return permissionLevel === 'owner' || permissionLevel === 'delete';
}
```

**Impact:** MEDIUM - Users with "write" permission can share files, which may not be intended. The plan explicitly shows "delete" as the new management tier.

**Recommendation:** Confirm with user whether "write" should retain management rights or if only "delete"/"owner" should manage.

---

**5. NO VALIDATION FOR PERMISSION ESCALATION IN shareLibraryItem() (Lines 954-988)**

The plan requires "validates actor has delete or owner permission" (test stub line 42), but the diff does NOT show this validation being added.

**Missing Check:** Before creating the permission (line 352), validate:
```typescript
const actorPermission = await getUserEffectivePermission(input.itemId, actor, db);
if (!actorPermission.effectivePermissionLevel ||
    !['delete', 'owner'].includes(actorPermission.effectivePermissionLevel)) {
  throw new Error('Insufficient permissions to share this item');
}

// ALSO: Prevent granting higher permissions than actor has
if (rankPermissionLevel(input.permissionLevel) > rankPermissionLevel(actorPermission.effectivePermissionLevel)) {
  throw new Error('Cannot grant higher permissions than you have');
}
```

**Impact:** MEDIUM - Users could potentially share files they don't have permission to manage, or grant higher permissions than they possess.

---

**6. RACE CONDITION IN shareLibraryItem() GROUP VALIDATION (Lines 323-349)**

The group existence check (line 324-334) is NOT wrapped in a transaction with the permission insert (line 352). A group could be deleted between the validation and the insert.

**Fix Required:** Wrap in transaction:
```typescript
await db.transaction(async (tx) => {
  // 1. Check group exists
  const group = await tx.select()...;

  // 2. Insert permission
  await tx.insert(libraryPermissions)...;
});
```

**Impact:** MEDIUM - Low probability but could create orphaned permissions referencing deleted groups.

---

### LOW SEVERITY

**7. TYPE SAFETY ISSUES WITH 'as any' CASTS (Lines 242, 247, 261, 267, 280, 285)**

Multiple `as any` casts suppress TypeScript's type checking:

```typescript
permissionLevel: directShare.permissionLevel as any,
```

**Recommendation:** Define proper type guards or use explicit type assertions:
```typescript
permissionLevel: directShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner',
```

Or validate at runtime:
```typescript
if (!['read', 'write', 'delete', 'owner'].includes(directShare.permissionLevel)) {
  throw new Error(`Invalid permission level: ${directShare.permissionLevel}`);
}
```

**Impact:** LOW - Could mask type mismatches, but database constraints should prevent invalid values.

---

**8. MISSING NULLABLE SUBJECTID TYPE ANNOTATION (Line 274)**

```typescript
p.subjectId === actor.role
```

The type annotation shows `subjectId: string | null`, but the comparison doesn't handle null explicitly. If `actor.role` is undefined/null, this could match null subjectIds unexpectedly.

**Fix:**
```typescript
p.subjectType === 'tenant_role' && p.subjectId !== null && p.subjectId === actor.role
```

---

**9. INCONSISTENT TENANT ID NORMALIZATION (Line 216)**

```typescript
const userGroups = await getUserGroups(actor.userId, actorTenantId);
```

The `actorTenantId` is normalized on line 182, but `getUserGroups()` signature takes a `string`. Ensure `normalizeLibraryTenantId()` returns a string or update the type.

---

### MISSING FUNCTIONALITY

**10. NO CASCADE DELETE HANDLING FOR GROUP PERMISSIONS**

The plan states "When group is deleted, all library_permissions with subjectType='group' are deleted" (line 643-646). This is supposed to be handled in `groupsService.deleteUserGroup()` (section-02), but there's no verification that this integration exists.

**Required Integration Check:**
- Verify that `groupsService.deleteUserGroup()` deletes from `library_permissions`
- OR add a database-level foreign key with ON DELETE CASCADE
- OR add a cleanup function in libraryService

**Current Risk:** Orphaned permissions could grant access after group deletion.

---

**11. MISSING TEST IMPLEMENTATIONS**

All tests are `.todo()` stubs (lines 13-66). The plan requires TDD approach, but no actual test implementations are shown.

**Required:**
- Implement at least the HIGH priority tests:
  - Cross-tenant isolation tests
  - Deleted group handling
  - Permission escalation prevention
  - Deleted file exclusion

---

**12. SEARCH PERFORMANCE CONCERN (Lines 1376-1397)**

The `searchLibraryItems()` now fetches user groups on EVERY search. For users in many groups, the `inArray(libraryPermissions.subjectId, groupIds)` could be expensive.

**Current Approach:**
```typescript
const userGroups = await getUserGroups(actor.userId, actorTenantId);
const groupIds = userGroups.map(g => String(g.id));
```

**Optimization Note:** The plan mentions section-10 will add batch optimization, but for now, this could cause N+1 queries if getUserGroups isn't properly cached.

**Verification Needed:** Confirm that `groupsService.getUserGroups()` implements Redis caching as stated in the plan.

---

## CORRECTNESS ISSUES

**13. rankPermissionLevel() INCONSISTENT WITH PLAN (Lines 505-510)**

The implementation returns:
- owner: 4
- delete: 3
- write: 2
- read: 1

But the function doesn't handle invalid values. The plan shows `default: return 0;` (line 206), which is implemented (line 508), but the switch should handle the old values gracefully during migration.

**Current Code:** Correct, but recommend adding logging for unexpected values.

---

**14. MISSING EXPIRATION HANDLING IN getUserEffectivePermission() (Lines 228-231)**

The function correctly filters expired permissions in the WHERE clause (lines 228-231), but this differs from `getPermissionLevelForItem()` which filters in-memory (line 545-548).

**Consistency:** GOOD - Database-level filtering is more efficient.

---

## POSITIVE OBSERVATIONS

1. **Tenant isolation in group validation** (lines 340-342) - Correctly prevents cross-tenant shares
2. **Expiration filtering** (lines 228-231) - Properly excludes expired permissions
3. **Proper use of normalizeLibraryTenantId()** - Consistent tenant ID handling
4. **deletedBy audit trail** (line 312) - Correctly tracks who deleted files
5. **Shared types file** (lines 398-418) - Good separation of concerns

---

## SUMMARY

### Must Fix Before Merge:
1. Add deleted file filter to searchLibraryItems() (HIGH)
2. Filter out deleted groups in getUserEffectivePermission() (HIGH)
3. Add tenant isolation check after item fetch in getUserEffectivePermission() (HIGH)
4. Add permission escalation validation in shareLibraryItem() (MEDIUM)
5. Clarify whether 'write' level should manage items (MEDIUM)
6. Implement actual tests, not just stubs (CRITICAL for security)

### Recommended for Future:
1. Add transaction wrapper for group share validation
2. Replace 'as any' with proper type guards
3. Add null-safety check for tenant role matching
4. Verify cascade delete integration with groupsService
5. Add performance monitoring for group lookups

### Files Affected:
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (primary implementation)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` (test stubs only)
- `/home/dev/projects/SmartSpecPro/apps/web/shared/types/library.ts` (new file, looks good)

**Overall Assessment:** The implementation covers most of the plan's requirements but has CRITICAL security gaps around deleted file filtering, deleted group handling, and permission escalation. The lack of implemented tests is concerning for a security-sensitive feature. Recommend blocking merge until HIGH severity issues are fixed and key security tests are implemented.
