Now I understand the task. I need to generate content for section-05-library-router, which focuses on updating the library router for group sharing and trash management. Let me extract the relevant content from the plan and TDD documents.

# Section 05: Library Router Updates

## Overview

This section updates the existing `library` tRPC router to support group-based file sharing and trash management. The router will handle permission changes, trash operations, and integrate with the updated library service layer.

**Dependencies:**
- section-01-database-schema (must be complete)
- section-03-library-service (must be complete)

**Blocks:**
- section-08-file-sharing-ui
- section-09-trash-ui
- section-11-security-tests

**File Modified:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts`

---

## Test Stubs (Write These First)

**Test File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.test.ts` (EXTEND)

Write these test stubs before implementing functionality:

```typescript
describe('library.shareItem', () => {
  it('accepts subjectType = "group"', async () => {
    // Stub: Create test group, share file with group, verify permission created
  });

  it('validates group exists', async () => {
    // Stub: Attempt to share with non-existent group ID, expect NOT_FOUND error
  });

  it('validates group is in same tenant', async () => {
    // Stub: Create group in tenant A, attempt to share file from tenant B, expect FORBIDDEN error
  });
});

describe('library.removeShare', () => {
  it('removes permission when actor has "delete" or "owner" permission', async () => {
    // Stub: Share file with user, then remove share, verify permission deleted
  });

  it('rejects when actor lacks permission', async () => {
    // Stub: User B tries to remove share from User A's file, expect FORBIDDEN error
  });

  it('deletes correct permission entry', async () => {
    // Stub: File shared with 2 users, remove 1 share, verify only 1 permission deleted
  });
});

describe('library.updateSharePermission', () => {
  it('updates permission level when actor has "delete" or "owner" permission', async () => {
    // Stub: Share with "read", update to "write", verify permission updated
  });

  it('rejects when actor lacks permission', async () => {
    // Stub: User B tries to update share on User A's file, expect FORBIDDEN error
  });

  it('updates correct permission entry', async () => {
    // Stub: File shared with 2 users, update 1 permission, verify only 1 updated
  });
});

describe('library.listTrash', () => {
  it('returns only owner\'s deleted items', async () => {
    // Stub: User A deletes file, User B sees nothing in their trash
  });

  it('excludes items deleted by others', async () => {
    // Stub: User A owns file, User B deletes it (if allowed), User B sees it in their trash
  });

  it('includes deletedAt, deletedBy, daysUntilPurge', async () => {
    // Stub: Delete file, verify response includes all required fields
  });
});

describe('library.restoreFromTrash', () => {
  it('restores item when actor is owner or deleter', async () => {
    // Stub: Delete file, restore, verify deletedAt and deletedBy are NULL
  });

  it('rejects when actor is neither owner nor deleter', async () => {
    // Stub: User A deletes file, User B tries to restore, expect FORBIDDEN error
  });

  it('clears deletedAt and deletedBy', async () => {
    // Stub: Delete file, restore, query DB to verify fields are cleared
  });
});

describe('library.permanentDelete', () => {
  it('deletes item when actor is owner', async () => {
    // Stub: Owner deletes file permanently, verify hard delete cascade
  });

  it('deletes item when actor is admin and daysInTrash >= 90', async () => {
    // Stub: Admin tries to delete 91-day-old trash, should succeed
  });

  it('rejects when actor is not owner or admin', async () => {
    // Stub: Regular user tries to delete someone else's trash, expect FORBIDDEN
  });

  it('deletes chunks, permissions, and item (hard delete)', async () => {
    // Stub: Delete file, verify library_chunks and library_permissions rows deleted
  });
});
```

---

## Implementation Details

### Updated Procedures

#### 1. `shareItem` Mutation (EXTEND)

**Current Behavior:** Supports `subjectType = "user"` and `"tenant_role"`

**New Behavior:** Also support `subjectType = "group"`

**Input Schema Extension:**
```typescript
// Extend existing Zod schema
const shareItemInput = z.object({
  itemId: z.number(),
  subjectType: z.enum(['user', 'tenant_role', 'group']), // Add 'group'
  subjectId: z.union([z.number(), z.string()]), // number for user/group, string for role
  permissionLevel: z.enum(['read', 'write', 'delete']),
});
```

**Implementation Notes:**
- Validate group exists when `subjectType = "group"`: Query `user_groups` table for `subjectId`
- Validate group is in same tenant as file: Check `user_groups.tenantId === actor.tenantId`
- Call updated `libraryService.shareLibraryItem()` with validated inputs
- Return success response with created permission details

**Error Handling:**
- `NOT_FOUND (404)` — Group doesn't exist
- `FORBIDDEN (403)` — Group is in different tenant
- `UNAUTHORIZED (401)` — Actor lacks "delete" or "owner" permission on file

---

#### 2. `getItemShares` Query (UPDATE)

**Current Behavior:** Returns shares with basic info

**New Behavior:** Populate group names for group shares

**Output Format:**
```typescript
{
  shares: [
    {
      id: number,
      subjectType: 'user' | 'tenant_role' | 'group',
      subjectId: number | string,
      permissionLevel: 'read' | 'write' | 'delete',
      userName?: string, // For user shares
      groupName?: string, // For group shares
      roleName?: string, // For tenant_role shares
    }
  ]
}
```

**Implementation Notes:**
- Join `library_permissions` with `users` table for user shares
- Join with `user_groups` table for group shares
- Include `deletedAt IS NULL` filter to exclude deleted groups
- Map results to include appropriate name field based on `subjectType`

---

#### 3. `getItem` Query (UPDATE)

**New Field:** Add `userPermissions` object to response

**Output Format:**
```typescript
{
  ...item, // Existing item fields
  userPermissions: {
    effectiveLevel: 'read' | 'write' | 'delete' | 'owner' | null,
    sources: [
      { type: 'owner' },
      { type: 'direct', permissionLevel: 'read', subjectId: 123 },
      { type: 'group', permissionLevel: 'write', subjectId: 456, groupName: 'Marketing Team' },
    ],
    canRead: boolean,
    canWrite: boolean,
    canDelete: boolean,
    isOwner: boolean,
  }
}
```

**Implementation Notes:**
- Call `libraryService.getUserEffectivePermission(itemId, actor)`
- Map `effectiveLevel` to boolean capability flags:
  - `canRead`: `effectiveLevel` is not null
  - `canWrite`: `effectiveLevel` is "write", "delete", or "owner"
  - `canDelete`: `effectiveLevel` is "delete" or "owner"
  - `isOwner`: `effectiveLevel` is "owner"
- Include `sources` array for transparency (interview requirement Q12)

---

#### 4. `listTrash` Query (NEW)

**Input Schema:**
```typescript
const listTrashInput = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});
```

**Output Format:**
```typescript
{
  items: [
    {
      id: number,
      name: string,
      mimeType: string,
      deletedAt: Date,
      deletedBy: number | null,
      daysInTrash: number,
      daysUntilPurge: number,
    }
  ],
  total: number,
}
```

**Implementation Notes:**
- Query: `WHERE deletedAt IS NOT NULL AND ownerUserId = actor.userId`
- Calculate `daysInTrash`: `Math.floor((NOW() - deletedAt) / 86400000)` (milliseconds to days)
- Calculate `daysUntilPurge`: `90 - daysInTrash`
- Order by `deletedAt DESC` (most recently deleted first)
- Apply pagination (`limit`, `offset`)

---

#### 5. `restoreFromTrash` Mutation (NEW)

**Input Schema:**
```typescript
const restoreFromTrashInput = z.object({
  itemId: z.number(),
});
```

**Authorization Check:**
- Actor is owner: `ownerUserId === actor.userId`
- OR actor is deleter: `deletedBy === actor.userId`
- Throw `FORBIDDEN (403)` if neither condition is met

**Implementation Notes:**
- Query item: Verify `deletedAt IS NOT NULL` (item is in trash)
- Update: `SET deletedAt = NULL, deletedBy = NULL WHERE id = itemId`
- Return: `{ success: true, item: updatedItem }`

**Audit Logging:**
- Log event: `{ eventType: "library_restore", itemId, actor, timestamp }`

---

#### 6. `permanentDelete` Mutation (NEW)

**Input Schema:**
```typescript
const permanentDeleteInput = z.object({
  itemId: z.number(),
});
```

**Authorization Check:**
- Actor is owner: `ownerUserId === actor.userId`
- OR (actor is admin AND `daysInTrash >= 90`)
- Throw `FORBIDDEN (403)` otherwise

**Implementation Notes:**
- **Transaction:** Wrap all deletions atomically
- Delete S3/R2 storage:
  ```typescript
  if (item.sourceUrl) {
    await storageService.deleteFile(item.sourceUrl);
  }
  if (item.thumbnailUrl) {
    await storageService.deleteFile(item.thumbnailUrl);
  }
  ```
- Delete from vector DB (handle errors gracefully, orphaned vectors acceptable)
- Hard delete cascade:
  1. `DELETE FROM library_chunks WHERE libraryItemId = itemId`
  2. `DELETE FROM library_permissions WHERE libraryItemId = itemId`
  3. `DELETE FROM library_items WHERE id = itemId`
- Return: `{ success: true }`

**Error Handling:**
- If vector deletion fails: Log warning, continue
- If DB deletion fails: Rollback transaction, throw error

**Audit Logging:**
- Log event: `{ eventType: "library_permanent_delete", itemId, actor, timestamp }`

---

#### 7. `removeShare` Mutation (NEW)

**Input Schema:**
```typescript
const removeShareInput = z.object({
  itemId: z.number(),
  subjectType: z.enum(['user', 'tenant_role', 'group']),
  subjectId: z.union([z.number(), z.string()]),
});
```

**Authorization Check:**
- Actor has "delete" or "owner" permission on item
- Call `libraryService.getUserEffectivePermission(itemId, actor)`
- Throw `FORBIDDEN (403)` if permission level is below "delete"

**Implementation Notes:**
- Delete permission entry:
  ```typescript
  DELETE FROM library_permissions
  WHERE libraryItemId = itemId
    AND subjectType = input.subjectType
    AND subjectId = input.subjectId
    AND tenantId = actor.tenantId
  ```
- Return: `{ success: true }`

**Audit Logging:**
- Log event: `{ eventType: "library_remove_share", itemId, subjectType, subjectId, actor, timestamp }`

---

#### 8. `updateSharePermission` Mutation (NEW)

**Input Schema:**
```typescript
const updateSharePermissionInput = z.object({
  itemId: z.number(),
  subjectType: z.enum(['user', 'tenant_role', 'group']),
  subjectId: z.union([z.number(), z.string()]),
  permissionLevel: z.enum(['read', 'write', 'delete']),
});
```

**Authorization Check:**
- Actor has "delete" or "owner" permission on item
- Throw `FORBIDDEN (403)` if permission level is below "delete"

**Implementation Notes:**
- Update permission entry:
  ```typescript
  UPDATE library_permissions
  SET permissionLevel = input.permissionLevel
  WHERE libraryItemId = itemId
    AND subjectType = input.subjectType
    AND subjectId = input.subjectId
    AND tenantId = actor.tenantId
  ```
- Return: `{ success: true }`

**Audit Logging:**
- Log event: `{ eventType: "library_update_share", itemId, subjectType, subjectId, newPermission, actor, timestamp }`

---

## Error Handling

All procedures must throw `TRPCError` with appropriate codes:

| Error Code | HTTP Status | Usage |
|------------|-------------|-------|
| `UNAUTHORIZED` | 401 | Not logged in |
| `FORBIDDEN` | 403 | Lacks permission (not admin, not owner, etc.) |
| `NOT_FOUND` | 404 | Item/group doesn't exist |
| `BAD_REQUEST` | 400 | Validation errors, malformed input |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected errors (DB failure, etc.) |

---

## Validation Rules

### Input Validation
- `itemId`, `subjectId`: Must be positive integers
- `permissionLevel`: Must be one of `['read', 'write', 'delete']` (not "owner" - owner is immutable)
- `subjectType`: Must be one of `['user', 'tenant_role', 'group']`
- `limit`: Min 1, max 100
- `offset`: Min 0

### Business Validation
- File must exist and be in actor's tenant
- Group must exist and be in actor's tenant
- Actor must have required permission level for mutation
- Trash item must have `deletedAt IS NOT NULL`

---

## Audit Logging

Use existing audit logger for all mutations. Log format:

```typescript
auditLogger.log({
  eventType: 'library_mutation', // or specific event type
  endpoint: 'library.shareItem',
  actor: {
    userId: actor.userId,
    tenantId: actor.tenantId,
    role: actor.role,
  },
  payload: { itemId, subjectType, subjectId, permissionLevel },
  timestamp: new Date().toISOString(),
  traceId: ctx.traceId, // If available
});
```

---

## Integration Notes

### Service Layer Calls

All router procedures should delegate business logic to service layer:
- `libraryService.shareLibraryItem()` — For sharing operations
- `libraryService.getUserEffectivePermission()` — For permission checks
- `libraryService.softDeleteLibraryItem()` — For trash operations
- `libraryService.searchLibraryWithPermissions()` — For list queries

### Tenant Isolation

Every query MUST filter by `tenantId`:
```typescript
WHERE tenantId = actor.tenantId
```

This prevents cross-tenant data access vulnerabilities.

### Permission Enforcement

Never trust client-side permission checks. Always verify server-side:
```typescript
const permission = await libraryService.getUserEffectivePermission(itemId, actor);
if (!canManageLibraryItem(permission.effectiveLevel)) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
}
```

---

## Testing Checklist

Before marking this section complete, verify:
- [ ] All test stubs pass
- [ ] Group sharing works (file shared with group, members gain access)
- [ ] Trash operations work (list, restore, permanent delete)
- [ ] Permission validation enforced (non-owners cannot remove shares)
- [ ] Tenant isolation maintained (cannot share with groups in other tenants)
- [ ] Audit logging captures all mutations
- [ ] Error handling covers all edge cases (missing files, invalid groups, etc.)
- [ ] Input validation rejects malformed requests

---

## Dependencies on Other Sections

**Requires Complete:**
- section-01-database-schema — Tables `user_groups`, `group_members`, `library_permissions` extended
- section-03-library-service — Service functions updated for group permissions

**Used By:**
- section-08-file-sharing-ui — ShareDialog calls `shareItem`, `removeShare`, `updateSharePermission`
- section-09-trash-ui — TrashPanel calls `listTrash`, `restoreFromTrash`, `permanentDelete`
- section-11-security-tests — Integration tests verify tenant isolation and permission enforcement

---

## Known Limitations (Accepted for MVP)

1. **No bulk operations** — Cannot share with multiple groups at once (must call `shareItem` multiple times)
2. **No notification system** — Users don't receive notifications when granted/revoked access (Phase 2 feature)
3. **No audit log UI** — Users cannot see share history (admin-only via audit logger)

---

## Performance Considerations

- **Batch permission checks** — When fetching multiple items, use `libraryService.batchGetUserPermissions()` to avoid N+1 queries
- **Pagination** — Always enforce limits on list queries (`listTrash` max 100 items per page)
- **Index usage** — Ensure queries use partial indexes (`WHERE deletedAt IS NULL`, `WHERE status = 'active'`)

---

## Security Notes

### Critical Security Rules
1. **Always filter by tenantId** — Prevent cross-tenant access
2. **Always verify permissions** — Never trust client-side checks
3. **Always validate group existence** — Prevent dangling permission entries
4. **Always use transactions** — Prevent partial state on errors

### Common Vulnerabilities to Avoid
- **IDOR (Insecure Direct Object Reference)** — Always check actor owns/has permission on item
- **Authorization bypass** — Always validate permission level before mutation
- **Cross-tenant data leak** — Always filter by `actor.tenantId`
- **SQL injection** — Always use parameterized queries (Drizzle ORM handles this)

---

## Implementation Notes (Actual)

### Files Modified
- `apps/web/server/routers/library.ts` — Router with 6 new procedures (thin wrappers)
- `apps/web/server/services/libraryService.ts` — 6 new service functions + `users` schema import
- `apps/web/server/routers/library.test.ts` — 1 new test + 28 todo stubs

### Deviations from Plan
1. **All 6 new procedures delegated to service layer** — Code review identified raw DB access in router as CRITICAL. Created `removeLibraryShare()`, `updateLibrarySharePermission()`, `getLibraryItemShares()`, `listLibraryTrash()`, `restoreFromLibraryTrash()`, `permanentDeleteLibraryItem()` in libraryService.ts.
2. **listTrash scope expanded** — Plan said `ownerUserId = actor.userId` only. Review identified User B (deleter) should also see items they deleted. Now uses `OR(ownerUserId = userId, deletedBy = userId)`.
3. **permanentDelete includes domain_admin** — Plan said "admin" only. Review identified `domain_admin` role also needs purge authority.
4. **restoreFromTrash wrapped in transaction** — Plan omitted transaction. Review identified race condition between SELECT and UPDATE.
5. **restoreFromTrash UPDATE scoped by tenantId** — Plan omitted tenant filter on UPDATE. Review identified defense-in-depth gap.
6. **getItemShares does not expose email** — Plan had `userName` field. Original implementation fell back to `users.email`. Review flagged as data leak. Now uses `users.name` only.
7. **Storage cleanup deferred** — `storageDelete` function does not exist in storage module. Orphaned files remain after DB purge. TODO for future.
8. **Vector DB cleanup deferred** — Not implemented, acknowledged as accepted limitation.
9. **Output uses `title`/`itemType` not `name`/`mimeType`** — Schema uses `title` not `name`, and `itemType` not `mimeType`. Differs from plan's output format.
10. **Removed `as any` casts** — `resolveLibraryTenantId` returns `string` which is assignable to `LibraryTenantId = string | number`.

### Test Coverage
- 28 todo stubs for new procedures (full implementation deferred to section-11)
- 1 implemented test: `getItem > returns item with userPermissions when found`
- 9 pre-existing test failures (tenantId string vs number mismatch from section-03)

---

**End of Section 05: Library Router Updates**