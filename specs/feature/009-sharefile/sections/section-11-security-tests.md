Now I need to locate section-11-security-tests in the index.md to understand what this section should contain:

Based on the files I've read, I can now generate the content for section-11-security-tests. This section covers security-critical integration tests including tenant isolation, permission validation, group admin authorization, rate limiting, and audit logging.

---

# Section 11: Security Tests

## Overview

This section implements security-critical integration tests for the Custom Groups & Permission-based File Sharing feature. These tests validate tenant isolation, permission enforcement, authorization controls, and audit logging to prevent security vulnerabilities before deployment.

**Critical Requirement:** All tests in this section MUST pass before deployment to any environment (staging or production). Security test failures are deployment blockers.

## Dependencies

**Required Completed Sections:**
- section-02-groups-service (groups business logic)
- section-03-library-service (library permission resolution)
- section-04-groups-router (groups tRPC endpoints)
- section-05-library-router (library tRPC endpoints)
- section-06-trash-job (trash auto-purge background job)

## Files to Create/Modify

### New Test Files

1. **`/home/dev/projects/SmartSpecPro/apps/web/server/routers/security.test.ts`** (NEW)
   - Cross-cutting security tests (tenant isolation, permission validation)
   
2. **`/home/dev/projects/SmartSpecPro/apps/web/server/routers/groups.integration.test.ts`** (NEW)
   - End-to-end group management integration tests
   
### Extended Test Files

3. **`/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.integration.test.ts`** (EXTEND)
   - Add group permission integration tests

## Test Categories

### Category 1: Tenant Isolation Tests (CRITICAL)

**Purpose:** Ensure users cannot access or modify data from other tenants.

**File:** `apps/web/server/routers/security.test.ts`

**Test Stubs:**

```typescript
describe('Tenant Isolation - Groups', () => {
  test('user from tenant A cannot list groups from tenant B', async () => {
    // Setup: Create group in tenant B
    // Action: User from tenant A calls groups.list
    // Assert: Returns empty array (not tenant B's groups)
  });

  test('user from tenant A cannot view group detail from tenant B', async () => {
    // Setup: Create group in tenant B
    // Action: User from tenant A calls groups.get with tenant B's groupId
    // Assert: Throws TRPCError with code 'NOT_FOUND' or 'FORBIDDEN'
  });

  test('user from tenant A cannot add user from tenant B to their group', async () => {
    // Setup: Create group in tenant A, user in tenant B
    // Action: User from tenant A calls groups.addMember with tenant B's userId
    // Assert: Throws TRPCError with code 'BAD_REQUEST' (cross-tenant isolation validation)
  });

  test('file shared with group in tenant A is not accessible by user in tenant B', async () => {
    // Setup: Create group in tenant A, share file with that group
    // Action: User from tenant B calls library.getItem with that fileId
    // Assert: Throws TRPCError with code 'FORBIDDEN' or returns null permission
  });

  test('public group search only returns groups from user\'s tenant', async () => {
    // Setup: Create public groups in tenant A and tenant B
    // Action: User from tenant A calls groups.searchPublic
    // Assert: Returns only tenant A groups (excludes tenant B groups)
  });
});
```

**Implementation Notes:**
- Use test database with multiple tenant records
- Create isolated test users for each tenant
- Verify error codes match expected TRPCError types
- Clean up test data after each test

---

### Category 2: Permission Validation Tests

**Purpose:** Ensure write/delete operations validate permissions correctly.

**File:** `apps/web/server/routers/security.test.ts`

**Test Stubs:**

```typescript
describe('Permission Validation', () => {
  test('write/delete operations require getUserEffectivePermission check', async () => {
    // Setup: Create file owned by user A, shared with user B (read-only)
    // Action: User B attempts to update file metadata
    // Assert: Throws TRPCError with code 'FORBIDDEN'
  });

  test('client-side permission checks are verified server-side', async () => {
    // Setup: Create file with read-only permission for user
    // Action: User sends valid tRPC mutation (e.g., library.updateItem) despite client showing disabled button
    // Assert: Server rejects with 'FORBIDDEN' (ignores client state)
  });

  test('permission hierarchy is respected (read < write < delete < owner)', async () => {
    // Setup: Create file with multiple permission sources (direct: read, group: write)
    // Action: Call getUserEffectivePermission
    // Assert: Returns 'write' (highest level)
  });

  test('permission expiration dates are enforced', async () => {
    // Note: This is a placeholder for future enhancement (permission expiration not in MVP)
    // Setup: Create permission with expiresAt in past
    // Action: Attempt to access file
    // Assert: Permission denied
  });
});
```

---

### Category 3: Group Admin Authorization Tests

**Purpose:** Ensure group admin actions are properly authorized.

**File:** `apps/web/server/routers/security.test.ts`

**Test Stubs:**

```typescript
describe('Group Admin Authorization', () => {
  test('only group owner or admins can add/remove members', async () => {
    // Setup: Create group with owner A, admin B, member C
    // Action: Member C calls groups.addMember
    // Assert: Throws TRPCError with code 'FORBIDDEN'
  });

  test('only group owner can delete group', async () => {
    // Setup: Create group with owner A, admin B
    // Action: Admin B calls groups.delete
    // Assert: Throws TRPCError with code 'FORBIDDEN'
  });

  test('members can leave group voluntarily (except owner)', async () => {
    // Setup: Create group with owner A, member B
    // Action: Member B calls groups.leave
    // Assert: Success, membership status set to 'removed'
  });

  test('owner cannot leave group', async () => {
    // Setup: Create group with owner A
    // Action: Owner A calls groups.leave
    // Assert: Throws TRPCError with code 'FORBIDDEN' or 'BAD_REQUEST'
  });
});
```

---

### Category 4: Rate Limiting Tests

**Purpose:** Ensure resource limits are enforced.

**File:** `apps/web/server/routers/security.test.ts`

**Test Stubs:**

```typescript
describe('Rate Limiting', () => {
  test('createUserGroup enforces max 50 groups per user', async () => {
    // Setup: Create 50 groups for user A
    // Action: User A attempts to create 51st group
    // Assert: Throws TRPCError with code 'BAD_REQUEST' (limit exceeded)
  });

  test('addGroupMember enforces max 100 members per group', async () => {
    // Setup: Create group with 100 members
    // Action: Owner attempts to add 101st member
    // Assert: Throws TRPCError with code 'BAD_REQUEST' (limit exceeded)
  });

  // Note: Max 20 shares per minute per user is TBD (not implemented in MVP)
  test.skip('shareItem enforces max 20 shares per minute per user', async () => {
    // Setup: User A shares 20 files in rapid succession
    // Action: User A attempts 21st share within same minute
    // Assert: Throws TRPCError with code 'TOO_MANY_REQUESTS'
  });
});
```

---

### Category 5: Audit Logging Tests

**Purpose:** Ensure all mutations are logged for security audit trail.

**File:** `apps/web/server/routers/security.test.ts`

**Test Stubs:**

```typescript
describe('Audit Logging', () => {
  test('all group mutations are logged', async () => {
    // Setup: Spy on audit logger
    // Action: Call groups.create, groups.addMember, groups.delete
    // Assert: Audit logger called with correct eventType and metadata
  });

  test('all share mutations are logged', async () => {
    // Setup: Spy on audit logger
    // Action: Call library.shareItem, library.removeShare
    // Assert: Audit logger called with correct eventType and metadata
  });

  test('permission denial events are logged', async () => {
    // Setup: Create file owned by user A
    // Action: User B (no permission) attempts to delete file
    // Assert: Audit logger called with eventType 'permission_denied'
  });
});
```

**Implementation Notes:**
- Use existing audit logger (check project for current implementation)
- Verify log entries contain: `userId`, `tenantId`, `eventType`, `endpoint`, `metadata`
- Test both success and failure cases

---

### Category 6: Integration Tests (End-to-End Flows)

**Purpose:** Validate complete workflows from group creation to file access.

**File:** `apps/web/server/routers/groups.integration.test.ts`

**Test Stubs:**

```typescript
describe('End-to-End Group Management', () => {
  test('group creation flow', async () => {
    // 1. User A creates "Marketing Team" group
    // 2. Assert: Group created with owner = user A
    // 3. Assert: Initial membership exists (user A as admin)
    // 4. Assert: Group appears in user A's groups list
  });

  test('member management flow', async () => {
    // 1. User A creates group
    // 2. User A adds user B and user C as members
    // 3. Assert: Group memberCount = 3
    // 4. User A removes user C
    // 5. Assert: Group memberCount = 2
    // 6. Assert: User C no longer in group members list
  });

  test('group deletion cascades to permissions', async () => {
    // 1. User A creates group, adds user B
    // 2. User A shares file with group (read permission)
    // 3. Assert: User B can access file
    // 4. User A deletes group
    // 5. Assert: library_permissions rows for that group are deleted
    // 6. Assert: User B can no longer access file
  });

  test('public group search and join flow', async () => {
    // 1. User A creates public group with joinPolicy = 'open'
    // 2. User B searches public groups
    // 3. Assert: User B sees user A's group in results
    // 4. User B joins group
    // 5. Assert: User B is now a member (status = 'active')
  });
});
```

---

**File:** `apps/web/server/routers/library.integration.test.ts` (EXTEND)

**Test Stubs:**

```typescript
describe('Group Permission Integration', () => {
  test('share file with group → members gain access', async () => {
    // 1. User A creates group with user B and user C
    // 2. User A uploads file
    // 3. User A shares file with group (write permission)
    // 4. Assert: User B can read and write file
    // 5. Assert: User C can read and write file
  });

  test('remove member from group → loses file access', async () => {
    // 1. User A creates group with user B
    // 2. User A shares file with group (read permission)
    // 3. Assert: User B can access file
    // 4. User A removes user B from group
    // 5. Assert: User B can no longer access file (permission denied)
  });

  test('delete group → all members lose file access', async () => {
    // 1. User A creates group with user B and user C
    // 2. User A shares file with group (read permission)
    // 3. Assert: User B and user C can access file
    // 4. User A deletes group
    // 5. Assert: User B and user C can no longer access file
  });

  test('move to trash → file excluded from search', async () => {
    // 1. User A creates group with user B
    // 2. User A shares file with group
    // 3. Assert: User B sees file in library search
    // 4. User A moves file to trash (soft delete)
    // 5. Assert: User B does NOT see file in library search
    // 6. Assert: Only user A sees file in trash panel
  });
});
```

---

## Test Setup and Teardown

### Database Setup

All integration tests require a clean database state. Use the following pattern:

```typescript
import { beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { sql } from 'drizzle-orm';

beforeEach(async () => {
  // Create test tenants
  await db.insert(tenants).values([
    { id: 'tenant-a', name: 'Tenant A' },
    { id: 'tenant-b', name: 'Tenant B' },
  ]);

  // Create test users
  await db.insert(users).values([
    { id: 1, email: 'user-a@tenant-a.com', tenantId: 'tenant-a' },
    { id: 2, email: 'user-b@tenant-a.com', tenantId: 'tenant-a' },
    { id: 3, email: 'user-c@tenant-b.com', tenantId: 'tenant-b' },
  ]);
});

afterEach(async () => {
  // Clean up in dependency order
  await db.delete(libraryPermissions);
  await db.delete(libraryItems);
  await db.delete(groupMembers);
  await db.delete(userGroups);
  await db.delete(users);
  await db.delete(tenants);
});
```

### tRPC Caller Setup

Use tRPC caller factory for authenticated requests:

```typescript
import { createCaller } from '../routers';
import { type LibraryActor } from '../services/libraryService';

function createAuthenticatedCaller(userId: number, tenantId: string) {
  const actor: LibraryActor = {
    userId,
    tenantId,
    role: 'user',
    isAuthenticated: true,
  };

  return createCaller({ actor });
}

// Usage in tests
const callerUserA = createAuthenticatedCaller(1, 'tenant-a');
const result = await callerUserA.groups.list({ scope: 'my_groups' });
```

---

## Verification Steps

After implementing all tests:

1. **Run full test suite:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web
   pnpm test server/routers/security.test.ts
   pnpm test server/routers/groups.integration.test.ts
   pnpm test server/routers/library.integration.test.ts
   ```

2. **Verify all security tests pass:**
   - All tenant isolation tests (5 tests) must pass
   - All permission validation tests must pass
   - All authorization tests must pass

3. **Check test coverage:**
   ```bash
   pnpm test:coverage
   ```
   - Target: 80%+ coverage for all new routers and services
   - Security-critical functions must have 100% coverage

4. **Verify audit logs:**
   - Run mutation tests with audit logger enabled
   - Check that log entries are created in test database or JSONL files

---

## Security Test Checklist

Before marking this section complete, verify:

- [ ] All 5 tenant isolation tests implemented and passing
- [ ] Permission validation tests cover all permission levels (read, write, delete, owner)
- [ ] Group admin authorization tests prevent unauthorized actions
- [ ] Rate limiting tests enforce 50 groups/user and 100 members/group limits
- [ ] Audit logging tests verify all mutations are logged
- [ ] Integration tests validate end-to-end flows (group creation → share → access)
- [ ] Cross-tenant isolation verified in all endpoints (groups.*, library.*)
- [ ] Permission bypass attempts are blocked (client-side checks ignored)
- [ ] Cascade deletions work correctly (group delete → permission delete)
- [ ] Trash visibility is owner-only (sharees don't see deleted files)

---

## Common Issues and Troubleshooting

### Issue: Test fails with "Cannot connect to database"

**Solution:** Ensure test database is running and `DATABASE_URL` in `.env.test` points to test database (not production).

### Issue: Tenant isolation test passes when it should fail

**Solution:** Verify `tenantId` filtering is applied in ALL database queries. Check for missing `WHERE tenantId = actor.tenantId` clauses.

### Issue: Permission validation test fails intermittently

**Solution:** Check for race conditions in permission resolution. Ensure cache invalidation happens before permission checks.

### Issue: Audit log test fails to find log entries

**Solution:** Verify audit logger is initialized in test environment. Check if log entries are written to test database or in-memory storage.

---

## Performance Considerations

Security tests should run quickly to enable rapid iteration:

- **Target:** All security tests complete in < 30 seconds
- **Use transactions:** Wrap test setup/teardown in transactions for faster cleanup
- **Parallel execution:** Run independent test suites in parallel (Vitest supports this by default)
- **Mock external services:** Use mocks for S3/R2 storage, vector DB, and Redis (if needed)

---

## Next Steps

After completing this section:

1. Run all security tests in CI/CD pipeline
2. Proceed to section-12-deployment-verification for final pre-deployment checks
3. If any security test fails, halt deployment and fix the issue immediately

**Security tests are deployment gates.** No exceptions.

---

**End of Section 11: Security Tests**