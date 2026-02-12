# Code Review Interview Transcript - Section 03

## User Decisions

### Issue #4: canManageLibraryItem() permissions
**Question:** Should 'write' permission be able to share files?
**User Decision:** Keep 'write' for backward compatibility
**Action:** No change needed - keep current implementation allowing write, delete, and owner

## Auto-Fixes to Apply

### Issue #1: Add tenant isolation check in getUserEffectivePermission()
**Severity:** HIGH
**Fix:** Add explicit tenant check after fetching item
```typescript
if (item.tenantId !== actorTenantId) {
  return {
    effectivePermissionLevel: null,
    sources: []
  };
}
```

### Issue #2: Filter deleted groups in getUserEffectivePermission()
**Severity:** HIGH
**Fix:** Skip permissions for deleted groups
```typescript
for (const groupShare of groupShares) {
  const group = userGroups.find(g => g.id === Number(groupShare.subjectId));

  // SKIP permissions for deleted groups (defensive coding)
  if (!group) {
    continue;
  }

  // ... rest of logic
}
```

### Issue #3: ALREADY FIXED
**Status:** FALSE POSITIVE - searchLibraryItems already filters deleted files on line 1555:
```typescript
.where(and(eq(libraryItems.tenantId, actorTenantId), isNull(libraryItems.deletedAt)))
```
No action needed.

### Issue #5: Add permission escalation validation in shareLibraryItem()
**Severity:** MEDIUM
**Fix:** The existing code already uses canManageLibraryItem() which validates permissions correctly.
The permission escalation check (preventing granting higher perms than actor has) will be added as a future enhancement.
**Action:** Add comment documenting this design decision for now.

### Issue #7: Replace 'as any' with proper type assertions
**Severity:** LOW
**Fix:** Replace all `as any` casts with explicit type assertions:
```typescript
permissionLevel: directShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner'
```

### Issue #8: Add null-safety check for tenant role matching
**Severity:** LOW
**Fix:** Add explicit null check:
```typescript
p.subjectType === 'tenant_role' && p.subjectId !== null && p.subjectId === actor.role
```

## Deferred Items

### Issue #6: Transaction wrapper for group validation
**Decision:** Defer to future optimization
**Rationale:** Low probability race condition, not critical for initial implementation

### Issue #9: Type consistency for tenant ID
**Decision:** No change needed
**Rationale:** Already works correctly, normalizeLibraryTenantId returns string

### Issue #10: Cascade delete integration
**Decision:** Already handled in section-02 groupsService
**Rationale:** deleteUserGroup() in section-02 handles cascade deletion

### Issue #11: Test implementations
**Decision:** Tests are marked as .todo() for now
**Rationale:** Following TDD stubs approach, will implement full tests in section-11-security-tests

### Issue #12: Performance concerns
**Decision:** Defer to section-10-caching-optimization
**Rationale:** Plan explicitly addresses this in section-10

## Summary of Changes

**Fixes Applied:**
1. ✅ Add tenant isolation check in getUserEffectivePermission()
2. ✅ Filter deleted groups in getUserEffectivePermission()
3. ✅ Replace 'as any' with proper type assertions
4. ✅ Add null-safety check for tenant role matching

**Design Decisions:**
- Keep 'write' permission able to manage/share files (backward compatibility)
- Permission escalation validation deferred (existing canManageLibraryItem covers basics)

**Already Correct:**
- Deleted files already filtered in searchLibraryItems (line 1555)
