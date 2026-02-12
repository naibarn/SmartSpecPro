Now I understand the context. I need to generate the content for **section-02-groups-service**, which covers the Groups Service Layer business logic. Let me extract the relevant information from the planning documents and create a complete, self-contained section.

Based on the section manifest, section-02 covers:
- Groups service layer business logic
- File: `apps/web/server/services/groupsService.ts` (NEW)
- Key functions: createUserGroup, getUserGroups, addGroupMember, removeGroupMember, deleteUserGroup, etc.
- Tests first approach

Let me now generate the complete section content:

---

# Section 02: Groups Service Layer

**File:** `apps/web/server/services/groupsService.ts` (NEW)

**Dependencies:**
- Requires: section-01-database-schema (completed)
- Blocks: section-04-groups-router, section-07-group-management-ui, section-10-caching-optimization, section-11-security-tests

**Purpose:** Implement business logic for group management, isolated from tRPC routers. This service layer handles group creation, membership management, permission cascading, and caching.

---

## Tests First

Create test file `apps/web/server/services/groupsService.test.ts` with the following test stubs:

### createUserGroup Tests

```typescript
describe('groupsService.createUserGroup', () => {
  test('creates group with valid input and actor as owner', async () => {
    // Test: Group created with provided name, description, settings
    // Test: actor.userId set as ownerId
    // Test: Returns created group object
  });

  test('creates initial membership with owner as admin', async () => {
    // Test: group_members entry created with status = 'active'
    // Test: role = 'admin'
    // Test: memberCount incremented to 1
  });

  test('transaction rolls back if membership creation fails', async () => {
    // Test: Simulate membership insert failure
    // Test: Verify group is not created (rollback)
  });

  test('rejects duplicate group name in same tenant', async () => {
    // Test: Create group "Marketing"
    // Test: Attempt to create another "Marketing" in same tenant → throws error
  });

  test('rejects when user exceeds 50 groups limit', async () => {
    // Test: Create 50 groups for user
    // Test: Attempt to create 51st group → throws error
  });

  test('allows duplicate group names in different tenants', async () => {
    // Test: Create "Marketing" in tenant A
    // Test: Create "Marketing" in tenant B → succeeds
  });

  test('allows recreating deleted group name after soft delete', async () => {
    // Test: Create "Marketing", soft delete it
    // Test: Create "Marketing" again → succeeds (partial unique index)
  });
});
```

### getUserGroups Tests

```typescript
describe('groupsService.getUserGroups', () => {
  test('returns all active groups for user in tenant', async () => {
    // Test: Create 3 groups with user as member
    // Test: Returns all 3 groups
  });

  test('excludes deleted groups (deletedAt IS NOT NULL)', async () => {
    // Test: Create group, soft delete it
    // Test: getUserGroups does not return deleted group
  });

  test('excludes removed memberships (status = removed)', async () => {
    // Test: Add user to group, then remove them
    // Test: getUserGroups does not return group
  });

  test('caches results in Redis with 1-minute TTL', async () => {
    // Test: Call getUserGroups, verify Redis SET with TTL=60
  });

  test('serves from cache on subsequent calls within TTL', async () => {
    // Test: Call getUserGroups twice within 60s
    // Test: Second call does not hit database (cache hit)
  });
});
```

### addGroupMember Tests

```typescript
describe('groupsService.addGroupMember', () => {
  test('adds member with valid inputs and actor is admin', async () => {
    // Test: Actor is group admin
    // Test: Target user added with specified role
    // Test: membership status = 'active'
  });

  test('rejects when actor is not group admin', async () => {
    // Test: Actor is regular member, not admin
    // Test: Attempt to add member → throws FORBIDDEN
  });

  test('rejects when target user is from different tenant (cross-tenant isolation)', async () => {
    // Test: Group in tenant A
    // Test: Attempt to add user from tenant B → throws error
  });

  test('rejects when group exceeds 100 members limit', async () => {
    // Test: Add 100 members to group
    // Test: Attempt to add 101st member → throws error
  });

  test('rejects when user is already a member', async () => {
    // Test: Add user to group
    // Test: Attempt to add same user again → throws error
  });

  test('transaction wraps membership insert + memberCount increment', async () => {
    // Test: Simulate memberCount update failure
    // Test: Verify membership is not created (rollback)
  });

  test('invalidates cache only for added user', async () => {
    // Test: Add user B to group
    // Test: Verify cache invalidated for user B only
    // Test: Verify cache NOT invalidated for other members
  });

  test('increments group.memberCount by 1', async () => {
    // Test: Group has memberCount = 5
    // Test: Add member
    // Test: memberCount = 6
  });
});
```

### removeGroupMember Tests

```typescript
describe('groupsService.removeGroupMember', () => {
  test('removes member when actor is group admin', async () => {
    // Test: Actor is admin
    // Test: Target user removed (status = 'removed', removedAt set)
  });

  test('allows self-removal (userId === actor)', async () => {
    // Test: User calls removeGroupMember on themselves
    // Test: Succeeds (voluntary leave)
  });

  test('prevents owner from removing themselves', async () => {
    // Test: Owner attempts to remove themselves
    // Test: Throws error (must delete group or transfer ownership)
  });

  test('transaction wraps membership update + memberCount decrement', async () => {
    // Test: Simulate memberCount update failure
    // Test: Verify membership is not updated (rollback)
  });

  test('sets status = removed and removedAt timestamp', async () => {
    // Test: Remove member
    // Test: Verify status = 'removed', removedAt IS NOT NULL
  });

  test('decrements group.memberCount by 1', async () => {
    // Test: Group has memberCount = 6
    // Test: Remove member
    // Test: memberCount = 5
  });

  test('invalidates cache only for removed user', async () => {
    // Test: Remove user B from group
    // Test: Verify cache invalidated for user B only
    // Test: Verify cache NOT invalidated for other members
  });
});
```

### deleteUserGroup Tests

```typescript
describe('groupsService.deleteUserGroup', () => {
  test('soft deletes group when actor is owner', async () => {
    // Test: Actor is group owner
    // Test: Group soft deleted (deletedAt set)
  });

  test('rejects when actor is not owner', async () => {
    // Test: Actor is admin (not owner)
    // Test: Throws FORBIDDEN
  });

  test('transaction wraps soft delete + permission cascade', async () => {
    // Test: Simulate permission deletion failure
    // Test: Verify group is not soft deleted (rollback)
  });

  test('sets deletedAt timestamp', async () => {
    // Test: Delete group
    // Test: Verify deletedAt IS NOT NULL
  });

  test('deletes all library_permissions where subjectType = group AND subjectId = groupId', async () => {
    // Test: Share 3 files with group
    // Test: Delete group
    // Test: Verify all 3 permission entries deleted
    // Test: Verify members lose file access immediately
  });

  test('invalidates cache for all members', async () => {
    // Test: Group has 5 members
    // Test: Delete group
    // Test: Verify cache invalidated for all 5 members
  });
});
```

### approveJoinRequest Tests

```typescript
describe('groupsService.approveJoinRequest', () => {
  test('approves join request when actor is admin', async () => {
    // Test: Actor is admin
    // Test: Membership status changed from 'pending' to 'active'
  });

  test('rejects when actor is not admin', async () => {
    // Test: Actor is regular member
    // Test: Throws FORBIDDEN
  });

  test('changes membership status from pending to active', async () => {
    // Test: Request exists with status = 'pending'
    // Test: Approve request
    // Test: Verify status = 'active'
  });

  test('increments group.memberCount', async () => {
    // Test: Group has memberCount = 5
    // Test: Approve join request
    // Test: memberCount = 6
  });

  test('rejects when membership is not in pending status', async () => {
    // Test: Membership status = 'active'
    // Test: Attempt to approve → throws error
  });
});
```

### searchPublicGroups Tests

```typescript
describe('groupsService.searchPublicGroups', () => {
  test('returns only public groups in actor tenant', async () => {
    // Test: Create 2 public groups in tenant A, 1 in tenant B
    // Test: Search from tenant A → returns 2 groups
  });

  test('filters by name/description ILIKE pattern', async () => {
    // Test: Create groups "Marketing", "Sales", "Market Research"
    // Test: Search "market" → returns "Marketing" and "Market Research"
  });

  test('excludes deleted groups', async () => {
    // Test: Create public group, soft delete it
    // Test: Search → does not return deleted group
  });

  test('paginates results correctly', async () => {
    // Test: Create 30 public groups
    // Test: Search with limit=10, offset=0 → returns first 10
    // Test: Search with limit=10, offset=10 → returns next 10
  });

  test('excludes groups from other tenants', async () => {
    // Test: Create public groups in tenant A and B
    // Test: Search from tenant A → only returns tenant A groups
  });
});
```

---

## Implementation Details

### File Location

Create new file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.ts`

### Dependencies to Import

```typescript
import { db } from '../db';
import { userGroups, groupMembers, libraryPermissions } from '@drizzle/schema';
import { eq, and, inArray, isNull, sql, ilike } from 'drizzle-orm';
import { redis } from '../_core/redis'; // Existing Redis client
import { TRPCError } from '@trpc/server';
import type { LibraryActor } from './libraryService';
```

### Core Functions (Signatures and Logic)

#### createUserGroup

**Purpose:** Create a new group with the actor as owner and initial admin member.

**Transaction Boundary:** Wrap group insert + initial membership insert atomically.

**Validation:**
- Unique group name per tenant (enforced by partial unique index)
- User hasn't exceeded 50 groups limit
- Name max length 128 chars
- Description max length 512 chars

**Steps:**
1. Count user's existing groups (WHERE ownerId = actor.userId AND deletedAt IS NULL)
2. If count >= 50, throw TRPCError FORBIDDEN "Maximum 50 groups per user"
3. Begin transaction
4. Insert into user_groups (tenantId, name, description, ownerId, settings, memberCount=0)
5. Insert into group_members (groupId, userId=ownerId, role='admin', status='active', joinedAt=NOW())
6. Update user_groups SET memberCount = 1 WHERE id = groupId
7. Commit transaction
8. Return created group object

**Cache Invalidation:** Invalidate `user:{actor.userId}:groups:{actor.tenantId}`

---

#### getUserGroups

**Purpose:** Get all groups a user is a member of, with caching.

**Caching Strategy:**
- Key: `user:{userId}:groups:{tenantId}`
- Value: JSON array of group objects
- TTL: 60 seconds (1 minute)

**Steps:**
1. Try Redis GET on cache key
2. If cache hit, return parsed JSON
3. If cache miss:
   - Query database:
     ```sql
     SELECT user_groups.*, group_members.role
     FROM group_members
     LEFT JOIN user_groups ON user_groups.id = group_members.groupId
     WHERE group_members.userId = :userId
       AND group_members.status = 'active'
       AND user_groups.tenantId = :tenantId
       AND user_groups.deletedAt IS NULL
     ```
4. Store in Redis with SETEX (key, 60, JSON.stringify(groups))
5. Return groups

**Return Format:**
```typescript
[
  { id: 1, name: "Marketing Team", role: "admin", memberCount: 5, ... },
  { id: 2, name: "Sales Team", role: "member", memberCount: 12, ... }
]
```

---

#### addGroupMember

**Purpose:** Add a user to a group with specified role.

**Authorization:** Actor must be group admin or owner.

**Validation:**
- Group exists and deletedAt IS NULL
- Actor is member with role='admin' OR actor is owner
- Target user exists and tenantId matches group.tenantId (cross-tenant isolation)
- Group hasn't exceeded 100 members limit
- User is not already a member (status='active')

**Transaction Boundary:** Wrap membership insert + memberCount increment atomically.

**Steps:**
1. Verify actor permissions (check group_members WHERE groupId=X AND userId=actor.userId AND role='admin')
2. Verify target user tenantId matches (check users WHERE id=targetUserId AND tenantId=group.tenantId)
3. Count existing members (WHERE groupId=X AND status='active')
4. If count >= 100, throw TRPCError FORBIDDEN "Maximum 100 members per group"
5. Begin transaction
6. Insert into group_members (groupId, userId, role, addedBy=actor.userId, status='active', joinedAt=NOW())
7. Update user_groups SET memberCount = memberCount + 1 WHERE id = groupId
8. Commit transaction
9. Invalidate cache ONLY for added user: `user:{targetUserId}:groups:{tenantId}`
10. Return success

**Cache Invalidation:** Invalidate ONLY added user's cache (not all members).

---

#### removeGroupMember

**Purpose:** Remove a user from a group (or allow voluntary leave).

**Authorization:**
- Actor is group admin OR
- Actor is the user being removed (self-removal)

**Special Rule:** Prevent owner from removing themselves (must delete group or transfer ownership).

**Transaction Boundary:** Wrap membership update + memberCount decrement atomically.

**Steps:**
1. Verify actor permissions (admin) OR userId === actor.userId
2. Check if userId is group owner (if yes, throw error "Owner cannot leave group")
3. Begin transaction
4. Update group_members SET status='removed', removedAt=NOW() WHERE groupId=X AND userId=Y
5. Update user_groups SET memberCount = memberCount - 1 WHERE id = groupId
6. Commit transaction
7. Invalidate cache ONLY for removed user: `user:{targetUserId}:groups:{tenantId}`
8. Return success

**Cache Invalidation:** Invalidate ONLY removed user's cache (other members' group lists unchanged).

---

#### deleteUserGroup

**Purpose:** Soft delete a group and cascade delete all file permissions.

**Authorization:** Actor must be group owner.

**CRITICAL:** Permission cascade ensures members lose file access immediately (interview Q1).

**Transaction Boundary:** Wrap soft delete + permission cascade atomically.

**Steps:**
1. Verify actor is group owner (check user_groups WHERE id=groupId AND ownerId=actor.userId)
2. Get all member IDs for cache invalidation
3. Begin transaction
4. Update user_groups SET deletedAt=NOW() WHERE id = groupId
5. **DELETE FROM library_permissions WHERE subjectType='group' AND subjectId=groupId**
6. Commit transaction
7. Invalidate cache for ALL members (all lost a group):
   ```typescript
   for (const memberId of memberIds) {
     await redis.del(`user:${memberId}:groups:${tenantId}`);
   }
   ```
8. Return success

**Cache Invalidation:** Invalidate ALL members' caches (all lost a group).

---

#### approveJoinRequest

**Purpose:** Approve a pending join request.

**Authorization:** Actor must be group admin.

**Steps:**
1. Verify actor is admin
2. Verify membership exists with status='pending'
3. Begin transaction
4. Update group_members SET status='active' WHERE groupId=X AND userId=Y
5. Update user_groups SET memberCount = memberCount + 1 WHERE id = groupId
6. Commit transaction
7. Invalidate cache for approved user
8. Return success

---

#### rejectJoinRequest

**Purpose:** Reject a pending join request.

**Authorization:** Actor must be group admin.

**Steps:**
1. Verify actor is admin
2. Delete from group_members WHERE groupId=X AND userId=Y AND status='pending'
3. Return success

---

#### searchPublicGroups

**Purpose:** Search public groups in the actor's tenant.

**Steps:**
1. Query:
   ```sql
   SELECT * FROM user_groups
   WHERE tenantId = :tenantId
     AND (settings->>'visibility') = 'public'
     AND deletedAt IS NULL
     AND (name ILIKE :pattern OR description ILIKE :pattern)
   ORDER BY memberCount DESC
   LIMIT :limit OFFSET :offset
   ```
2. Return paginated results

---

## Error Handling Patterns

Follow existing error handling patterns from `libraryService.ts`:

```typescript
// Example: Duplicate group name
if (existingGroup) {
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'A group with this name already exists in your workspace',
  });
}

// Example: Authorization failure
if (!isAdmin) {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only group admins can add members',
  });
}

// Example: Validation failure
if (memberCount >= 100) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Group has reached maximum capacity (100 members)',
  });
}
```

---

## Caching Implementation

Use existing Redis client from `apps/web/server/_core/redis.ts`.

**Cache Key Format:**
```
user:{userId}:groups:{tenantId}
```

**Cache Value:**
```json
[
  { "id": 1, "name": "Marketing Team", "role": "admin", "memberCount": 5 },
  { "id": 2, "name": "Sales Team", "role": "member", "memberCount": 12 }
]
```

**Invalidation Logic (Simplified):**
- **createUserGroup:** Invalidate owner's cache (they gained a group)
- **addGroupMember:** Invalidate ONLY added user's cache (they gained a group)
- **removeGroupMember:** Invalidate ONLY removed user's cache (they lost a group)
- **deleteUserGroup:** Invalidate ALL members' caches (all lost a group)
- **leave:** Invalidate user's cache

**Rationale:** The cached value is user-specific (user's groups), not group-specific (group's members). Only invalidate when a user's group membership changes.

---

## Type Definitions

Add to file or import from schema:

```typescript
export interface CreateGroupInput {
  name: string;
  description?: string;
  visibility: 'private' | 'public';
  joinPolicy: 'invite_only' | 'request_to_join' | 'open';
}

export interface AddMemberInput {
  groupId: number;
  userId: number;
  role: 'member' | 'admin';
}

export interface GroupWithRole {
  id: number;
  name: string;
  description?: string;
  ownerId: number;
  memberCount: number;
  settings: {
    visibility: 'private' | 'public';
    joinPolicy: 'invite_only' | 'request_to_join' | 'open';
  };
  role: 'admin' | 'member'; // User's role in this group
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Background Context

**Why separate service layer?**
- Follows existing codebase pattern (see `libraryService.ts`, `skillExecutor.ts`)
- Keeps business logic isolated from tRPC routers
- Makes testing easier (mock database, not HTTP)
- Allows reuse from multiple routers or background jobs

**Why minimal caching?**
- Interview Q7: Permission changes must take effect immediately
- Only cache group memberships (changes infrequently)
- Never cache effective permission levels (changes frequently)
- 1-minute TTL balances performance and freshness

**Why optimized cache invalidation?**
- Original approach: Invalidate all members when any membership changes
- Problem: Adding 1 member to 100-person group invalidates 100 caches unnecessarily
- Solution: Only invalidate affected user's cache (they gained/lost a group)
- Exception: Group deletion invalidates all (all members lost a group)

---

## Implementation Checklist

- [ ] Create `apps/web/server/services/groupsService.test.ts`
- [ ] Write all test stubs (run with `pnpm test` to verify they fail)
- [ ] Create `apps/web/server/services/groupsService.ts`
- [ ] Implement `createUserGroup` with transaction
- [ ] Implement `getUserGroups` with Redis caching
- [ ] Implement `addGroupMember` with cross-tenant validation
- [ ] Implement `removeGroupMember` with owner protection
- [ ] Implement `deleteUserGroup` with permission cascade
- [ ] Implement `approveJoinRequest`
- [ ] Implement `rejectJoinRequest`
- [ ] Implement `searchPublicGroups`
- [ ] Run tests and verify all pass
- [ ] Add error handling for all edge cases
- [ ] Add input validation (max lengths, enums)
- [ ] Verify transaction rollback works (test with simulated failures)
- [ ] Verify cache invalidation logic (test with multiple users)

---

## Dependencies on Other Sections

**Requires (must be completed first):**
- section-01-database-schema: `user_groups` and `group_members` tables must exist

**Blocks (cannot start until this is done):**
- section-04-groups-router: Router calls these service functions
- section-07-group-management-ui: UI calls router which calls service
- section-10-caching-optimization: Optimizations extend this caching logic
- section-11-security-tests: Integration tests verify service behavior

---

## File Paths Reference

**New files to create:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/groupsService.test.ts`

**Existing files to reference (for patterns):**
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.ts` (similar service layer)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/libraryService.test.ts` (test patterns)
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/redis.ts` (Redis client)
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (table definitions)

---

**End of Section 02**