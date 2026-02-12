Now I understand the task. I need to generate the content for section-03-library-service. Let me extract the relevant information from the plan files and create a complete, self-contained section.

# Section 03: Library Service Updates for Group Permissions

## Overview

This section extends the existing Library Service to support group-based file sharing and permission resolution. The service layer handles business logic for determining user permissions across multiple sources (direct shares, group shares, role shares, and ownership), and integrates with the new group permissions system.

**Dependencies:**
- section-01-database-schema (must be completed first)

**Blocks:**
- section-05-library-router
- section-08-file-sharing-ui
- section-09-trash-ui
- section-10-caching-optimization
- section-11-security-tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (EXTEND)

---

## Context & Background

### Current State

The existing library service (`libraryService.ts`) handles document management with permission checks for:
- File owners (`ownerUserId` matches actor)
- Direct user shares (`subjectType = "user"`)
- Tenant role shares (`subjectType = "tenant_role"`)

### What's Changing

This section adds support for:
1. **Group-based permissions** (`subjectType = "group"`)
2. **Multi-source permission resolution** (users can have access via multiple paths)
3. **Enhanced permission levels** (adding "delete" level)
4. **Trash awareness** (excluding deleted files from searches)
5. **Audit trail** (tracking who deleted files)

### Key Requirements

From the feature specification:
- **Immediate permission changes** (interview Q7): No permission caching allowed
- **Multi-source transparency** (interview Q12): Users should see all sources of their permissions
- **Trash visibility** (interview Q4): Only owners see deleted files, sharees don't
- **Group deletion cascades** (interview Q1): Removing a group instantly revokes all member access

---

## Pre-Requisite Refactoring (CRITICAL)

**BEFORE implementing group permissions**, rename existing naming collisions to prevent confusion:

### Current Problem

The existing code uses "group" terminology for tenant role permissions:
- `hasGroupShare` → actually checks `tenant_role` permissions
- `groupMatches` → actually filters by tenant roles

This will cause bugs when we add actual user groups (custom groups created by users).

### Required Changes

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

```typescript
// RENAME these functions:
// OLD: hasGroupShare() → NEW: hasTenantRoleShare()
// OLD: groupMatches() → NEW: tenantRoleMatches()

// Update all references in:
// - getDocumentAccessSource()
// - searchLibraryWithPermissions()
// - Any other permission resolution functions

// Example (current code):
const hasGroupShare = permissions.some(
  p => p.subjectType === "tenant_role" && p.subjectId === actor.role
);

// Should become:
const hasTenantRoleShare = permissions.some(
  p => p.subjectType === "tenant_role" && p.subjectId === actor.role
);
```

**Verification:**
- Grep for `hasGroupShare` → should find 0 results after refactoring
- Grep for `groupMatches` → should find 0 results after refactoring
- All tests should still pass (no functional change, just naming)

---

## Tests First (TDD Approach)

**Test File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` (EXTEND)

### Test Stubs

```typescript
describe('libraryService - Group Permissions', () => {
  describe('rankPermissionLevel', () => {
    it('returns correct rank for read (1)');
    it('returns correct rank for write (2)');
    it('returns correct rank for delete (3)');
    it('returns correct rank for owner (4)');
  });

  describe('canManageLibraryItem', () => {
    it('returns true for owner permission level');
    it('returns true for delete permission level');
    it('returns false for write permission level');
    it('returns false for read permission level');
  });

  describe('getUserEffectivePermission', () => {
    it('includes group permissions in resolution');
    it('returns highest permission level when multiple sources exist');
    it('returns all permission sources in sources array');
    it('includes direct user share in sources');
    it('includes group share in sources with groupName');
    it('returns null when user has no access');
    it('handles user in multiple groups with different permissions');
    it('prioritizes owner over all other sources');
    it('prioritizes delete over write/read');
  });

  describe('shareLibraryItem', () => {
    it('creates permission for subjectType = group');
    it('validates group exists before creating permission');
    it('validates group is in same tenant as item');
    it('rejects when actor lacks delete or owner permission');
    it('rejects when group is from different tenant (cross-tenant isolation)');
  });

  describe('softDeleteLibraryItem', () => {
    it('sets deletedAt timestamp');
    it('sets deletedBy to actor.userId');
    it('existing soft deletes remain functional after update');
  });

  describe('searchLibraryWithPermissions', () => {
    it('includes files shared via group permissions');
    it('excludes deleted files (deletedAt IS NOT NULL)');
    it('filters by owner, direct share, group share, role share, and public');
    it('handles user with no groups gracefully');
    it('applies group permissions for user in multiple groups');
  });
});

describe('libraryService - Pre-requisite Refactoring', () => {
  it('hasTenantRoleShare (renamed from hasGroupShare) works with existing data');
  it('tenantRoleMatches (renamed from groupMatches) filters correctly');
  it('no references to old hasGroupShare function remain');
  it('no references to old groupMatches function remain');
});
```

---

## Implementation Details

### 1. Add `getUserGroups()` Helper

**Purpose:** Fetch user's groups for permission resolution (wrapper around groupsService)

```typescript
/**
 * Get all active groups for a user in their tenant.
 * Caching is handled in groupsService layer.
 */
async function getUserGroups(
  userId: number,
  tenantId: string
): Promise<Array<{ id: number; name: string; role: string }>> {
  // Thin wrapper around groupsService.getUserGroups()
  // Implementation note: groupsService handles Redis caching (1-minute TTL)
  // This function just delegates the call
  
  // Returns: Array of { id, name, role } for active memberships
}
```

**Dependencies:**
- Requires `groupsService.getUserGroups()` from section-02-groups-service

---

### 2. Update `rankPermissionLevel()`

**Purpose:** Add "delete" permission to hierarchy

```typescript
/**
 * Rank permission levels for comparison.
 * Higher rank = more permissive.
 */
function rankPermissionLevel(level: string): number {
  switch (level) {
    case 'read': return 1;
    case 'write': return 2;
    case 'delete': return 3;  // NEW
    case 'owner': return 4;
    default: return 0;
  }
}
```

**Usage:** Used to determine highest permission when user has multiple sources

---

### 3. Update `canManageLibraryItem()`

**Purpose:** Allow "delete" level to manage items (share/modify permissions)

**Current logic:**
```typescript
function canManageLibraryItem(permissionLevel: string): boolean {
  return permissionLevel === 'owner';
}
```

**New logic:**
```typescript
function canManageLibraryItem(permissionLevel: string): boolean {
  return permissionLevel === 'owner' || permissionLevel === 'delete';
}
```

**Impact:** Users with "delete" permission can now:
- Share files with others
- Modify existing shares
- Remove shares
- Cannot change ownership (still owner-only)

---

### 4. Update `getUserEffectivePermission()`

**Purpose:** Resolve permissions across all sources (owner, direct, group, role)

**Current signature:**
```typescript
async function getUserEffectivePermission(
  itemId: number,
  actor: LibraryActor
): Promise<string | null>
```

**New signature:**
```typescript
async function getUserEffectivePermission(
  itemId: number,
  actor: LibraryActor
): Promise<{
  effectivePermissionLevel: 'read' | 'write' | 'delete' | 'owner' | null;
  sources: Array<{
    type: 'owner' | 'direct' | 'group' | 'tenant_role';
    permissionLevel?: string;
    subjectId?: string;
    groupName?: string;
  }>;
}>
```

**New implementation logic:**

```typescript
async function getUserEffectivePermission(itemId, actor) {
  const sources = [];
  let highestLevel = null;
  let highestRank = 0;

  // 1. Check ownership
  const item = await db.query.libraryItems.findFirst({
    where: eq(libraryItems.id, itemId)
  });
  
  if (item.ownerUserId === actor.userId) {
    sources.push({ type: 'owner' });
    highestLevel = 'owner';
    highestRank = 4;
  }

  // 2. Get user's groups (cached in groupsService)
  const userGroups = await getUserGroups(actor.userId, actor.tenantId);
  const groupIds = userGroups.map(g => g.id);

  // 3. Fetch all permissions for this item
  const permissions = await db.query.libraryPermissions.findMany({
    where: and(
      eq(libraryPermissions.libraryItemId, itemId),
      eq(libraryPermissions.tenantId, actor.tenantId)
    )
  });

  // 4. Process direct user share
  const directShare = permissions.find(
    p => p.subjectType === 'user' && p.subjectId === String(actor.userId)
  );
  if (directShare) {
    sources.push({
      type: 'direct',
      permissionLevel: directShare.permissionLevel,
      subjectId: directShare.subjectId
    });
    const rank = rankPermissionLevel(directShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = directShare.permissionLevel;
      highestRank = rank;
    }
  }

  // 5. Process group shares (NEW)
  const groupShares = permissions.filter(
    p => p.subjectType === 'group' && groupIds.includes(Number(p.subjectId))
  );
  for (const groupShare of groupShares) {
    const group = userGroups.find(g => g.id === Number(groupShare.subjectId));
    sources.push({
      type: 'group',
      permissionLevel: groupShare.permissionLevel,
      subjectId: groupShare.subjectId,
      groupName: group?.name || 'Unknown Group'
    });
    const rank = rankPermissionLevel(groupShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = groupShare.permissionLevel;
      highestRank = rank;
    }
  }

  // 6. Process tenant role share
  const roleShare = permissions.find(
    p => p.subjectType === 'tenant_role' && p.subjectId === actor.role
  );
  if (roleShare) {
    sources.push({
      type: 'tenant_role',
      permissionLevel: roleShare.permissionLevel,
      subjectId: roleShare.subjectId
    });
    const rank = rankPermissionLevel(roleShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = roleShare.permissionLevel;
      highestRank = rank;
    }
  }

  // 7. Return both effective level and all sources (interview Q12)
  return {
    effectivePermissionLevel: highestLevel,
    sources
  };
}
```

**Performance note:** This queries the database on every call (no caching) per interview Q7 requirement for immediate permission changes.

---

### 5. Update `shareLibraryItem()`

**Purpose:** Support sharing files with groups

**Current logic:**
```typescript
async function shareLibraryItem(input, actor) {
  // Validates subjectType in ['user', 'tenant_role']
  // Creates library_permissions entry
}
```

**New logic additions:**

```typescript
async function shareLibraryItem(input, actor) {
  // ... existing validation for 'user' and 'tenant_role' ...

  // NEW: Handle subjectType = 'group'
  if (input.subjectType === 'group') {
    // 1. Validate group exists
    const group = await db.query.userGroups.findFirst({
      where: and(
        eq(userGroups.id, Number(input.subjectId)),
        isNull(userGroups.deletedAt)
      )
    });

    if (!group) {
      throw new Error('Group not found or has been deleted');
    }

    // 2. Validate group is in same tenant (cross-tenant isolation)
    if (group.tenantId !== actor.tenantId) {
      throw new Error('Cannot share with groups from other tenants');
    }

    // 3. Validate item is in same tenant as group
    const item = await db.query.libraryItems.findFirst({
      where: eq(libraryItems.id, input.itemId)
    });

    if (item.tenantId !== group.tenantId) {
      throw new Error('Cannot share items across tenant boundaries');
    }
  }

  // ... existing permission creation logic ...
  // This already handles all subjectTypes uniformly, so no changes needed
}
```

**Validation flow:**
1. Verify actor has "delete" or "owner" permission on item
2. If subjectType = "group": validate group exists and tenant matches
3. Create library_permissions entry
4. (Phase 2: Send notifications)

---

### 6. Update `softDeleteLibraryItem()`

**Purpose:** Track who deleted files for audit trail

**Current logic:**
```typescript
async function softDeleteLibraryItem(itemId, actor) {
  await db.update(libraryItems)
    .set({ deletedAt: new Date() })
    .where(eq(libraryItems.id, itemId));
}
```

**New logic:**
```typescript
async function softDeleteLibraryItem(itemId, actor) {
  await db.update(libraryItems)
    .set({ 
      deletedAt: new Date(),
      deletedBy: actor.userId  // NEW
    })
    .where(eq(libraryItems.id, itemId));
}
```

**Impact:** Trash UI can now display "Deleted by [User Name]" (interview requirement)

---

### 7. Update `searchLibraryWithPermissions()`

**Purpose:** Include group-shared files in search results, exclude trash

**Current logic:**
```typescript
async function searchLibraryWithPermissions(query, actor, options) {
  // 1. Fetch accessible items (owner OR direct share OR role share OR public)
  // 2. Run vector search on accessible items
  // 3. Return results
}
```

**New logic additions:**

```typescript
async function searchLibraryWithPermissions(query, actor, options) {
  // 1. Get user's groups
  const userGroups = await getUserGroups(actor.userId, actor.tenantId);
  const groupIds = userGroups.map(g => g.id);

  // 2. Build WHERE clause including group permissions
  const accessibleItems = await db.query.libraryItems.findMany({
    where: and(
      eq(libraryItems.tenantId, actor.tenantId),
      isNull(libraryItems.deletedAt),  // NEW: Exclude trash (interview Q4)
      or(
        // Owner
        eq(libraryItems.ownerUserId, actor.userId),
        
        // Public files
        eq(libraryItems.visibility, 'public'),
        
        // Has permission entry
        exists(
          db.select()
            .from(libraryPermissions)
            .where(
              and(
                eq(libraryPermissions.libraryItemId, libraryItems.id),
                or(
                  // Direct user share
                  and(
                    eq(libraryPermissions.subjectType, 'user'),
                    eq(libraryPermissions.subjectId, String(actor.userId))
                  ),
                  
                  // Group share (NEW)
                  and(
                    eq(libraryPermissions.subjectType, 'group'),
                    inArray(libraryPermissions.subjectId, groupIds.map(String))
                  ),
                  
                  // Tenant role share
                  and(
                    eq(libraryPermissions.subjectType, 'tenant_role'),
                    eq(libraryPermissions.subjectId, actor.role)
                  )
                )
              )
            )
        )
      )
    )
  });

  // 3. Extract item IDs
  const itemIds = accessibleItems.map(item => item.id);

  // 4. Run vector search on accessible items only (filter-first strategy)
  const searchResults = await vectorSearch(query, itemIds, options);

  return searchResults;
}
```

**Performance consideration:** The filter-first approach (fetch accessible items THEN search) is critical for permission enforcement. Search-first (search ALL items then filter) would expose private files in search results before permission check.

---

## Error Handling

All functions should follow existing error patterns:

```typescript
// Validation errors
if (!group) {
  throw new Error('Group not found'); // Will be wrapped in TRPCError in router
}

// Tenant isolation errors
if (group.tenantId !== actor.tenantId) {
  throw new Error('Cross-tenant access denied');
}

// Permission errors
if (!canManageLibraryItem(effectiveLevel)) {
  throw new Error('Insufficient permissions');
}
```

**Note:** Service functions throw plain Error objects. The tRPC router layer wraps these in TRPCError with appropriate HTTP codes.

---

## Type Definitions

**Add to** `/home/dev/projects/SmartSpecPro/apps/web/shared/types/library.ts`:

```typescript
export interface PermissionSource {
  type: 'owner' | 'direct' | 'group' | 'tenant_role';
  permissionLevel?: 'read' | 'write' | 'delete' | 'owner';
  subjectId?: string;
  groupName?: string;  // Only present for type = 'group'
}

export interface EffectivePermission {
  effectivePermissionLevel: 'read' | 'write' | 'delete' | 'owner' | null;
  sources: PermissionSource[];
}
```

---

## Integration Points

### With Groups Service (section-02)

```typescript
import { getUserGroups } from './groupsService';

// Called in getUserEffectivePermission() and searchLibraryWithPermissions()
const userGroups = await getUserGroups(actor.userId, actor.tenantId);
```

### With Database Schema (section-01)

Requires completed migrations:
- `library_permissions.subjectType` includes "group"
- `library_permissions.permissionLevel` includes "delete"
- `library_items.deletedBy` column exists

### With Library Router (section-05)

Router will call these service functions:
- `getUserEffectivePermission()` → for `library.getItem` response
- `shareLibraryItem()` → for `library.shareItem` mutation
- `softDeleteLibraryItem()` → for `library.deleteItem` mutation
- `searchLibraryWithPermissions()` → for `library.search` query

---

## Testing Checklist

From the TDD plan, verify all tests pass:

- [ ] rankPermissionLevel returns correct ranks (1-4)
- [ ] canManageLibraryItem allows both "owner" and "delete"
- [ ] getUserEffectivePermission includes group permissions
- [ ] getUserEffectivePermission returns highest level across sources
- [ ] getUserEffectivePermission returns all sources array
- [ ] shareLibraryItem accepts subjectType = "group"
- [ ] shareLibraryItem validates group exists
- [ ] shareLibraryItem validates tenant isolation
- [ ] softDeleteLibraryItem sets deletedBy
- [ ] searchLibraryWithPermissions includes group-shared files
- [ ] searchLibraryWithPermissions excludes deleted files
- [ ] Refactoring: no references to old hasGroupShare/groupMatches remain

---

## Security Considerations

**Critical security rules (enforced in this layer):**

1. **Tenant Isolation:**
   - Always verify group.tenantId === actor.tenantId
   - Always verify item.tenantId === actor.tenantId
   - Never allow cross-tenant shares

2. **Permission Enforcement:**
   - Never cache effective permission levels (interview Q7)
   - Always query library_permissions on each request
   - Validate actor has "delete" or "owner" before allowing shares

3. **Trash Visibility:**
   - Exclude deletedAt IS NOT NULL from search (interview Q4)
   - Only owners see their deleted files (in Trash UI, section-09)

4. **Group Deletion Cascade:**
   - When group is deleted, all library_permissions with subjectType="group" AND subjectId=groupId are deleted
   - This is handled in groupsService.deleteUserGroup() (section-02)
   - Library service just needs to respect the absence of permissions

---

## Performance Notes

From section-10-caching-optimization (implemented later):

- `getUserGroups()` results are cached in Redis (1-minute TTL) by groupsService
- Permission checks are NOT cached (immediate effect required)
- Batch permission checks will be added in section-10 for list views

For now, implement straightforward single-item permission checks. Optimization comes later.

---

## Verification Steps

After implementation:

1. **Run tests:** `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test services/libraryService.test.ts`
2. **Type check:** `pnpm check` (verify no TypeScript errors)
3. **Manual verification:**
   - Create a group in database
   - Share a file with that group
   - Query getUserEffectivePermission for a group member → should include group source
4. **Cross-tenant test:**
   - Try sharing with group from different tenant → should throw error

---

## Next Steps

After completing this section:

1. Proceed to **section-05-library-router** (extends tRPC endpoints with these service functions)
2. Implement **section-08-file-sharing-ui** (uses the multi-source permission data)
3. Implement **section-09-trash-ui** (uses deletedBy field)
4. Apply **section-10-caching-optimization** (batch permission checks)

---

## File Summary

**Modified:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts`

**Functions added:**
- `getUserGroups()` (new helper)

**Functions updated:**
- `rankPermissionLevel()` (add "delete" rank)
- `canManageLibraryItem()` (allow "delete" level)
- `getUserEffectivePermission()` (return type changed, add group logic)
- `shareLibraryItem()` (validate group shares)
- `softDeleteLibraryItem()` (add deletedBy)
- `searchLibraryWithPermissions()` (add group filtering, exclude trash)

**Functions renamed:**
- `hasGroupShare()` → `hasTenantRoleShare()`
- `groupMatches()` → `tenantRoleMatches()`

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` (extend with stubs shown above)

---

**End of Section 03: Library Service Updates**