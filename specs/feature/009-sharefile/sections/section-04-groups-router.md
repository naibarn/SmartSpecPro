Now I'll generate the section content for section-04-groups-router. Let me extract the relevant information from the context files.

# Section 04: Groups Router

## Overview

This section implements the Groups tRPC router with all endpoints for group management operations. The router serves as the API layer between the frontend and the Groups Service, providing type-safe, validated endpoints with proper authentication, authorization, audit logging, and error handling.

## Dependencies

**Must be completed first:**
- section-01-database-schema (tables exist)
- section-02-groups-service (service layer functions available)

**Blocks:**
- section-07-group-management-ui (UI needs these endpoints)
- section-11-security-tests (security tests validate these endpoints)

## Files to Create/Modify

**New Files:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/groups.ts` (main router)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/groups.test.ts` (router integration tests)

**Modified Files:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` (register new router)

## Background Context

### tRPC Pattern in SmartSpecPro

The codebase uses tRPC 11 for type-safe API endpoints with the following patterns:
- Routers defined using `router()` and `procedure()` builders
- Input validation via Zod schemas
- Context contains authenticated user info (`ctx.user`, `ctx.tenantId`)
- Error handling via `TRPCError` with standard HTTP codes
- Audit logging for all mutations via existing audit logger

### Authentication & Authorization

All procedures must:
1. Check authentication via middleware (already in place)
2. Validate tenant isolation (user can only access their tenant's data)
3. Check specific permissions (owner, admin, member) where applicable
4. Return appropriate `TRPCError` codes for violations

### Existing Service Layer

The Groups Service (section-02) provides these functions:
- `createUserGroup(input, actor)`
- `getUserGroups(userId, tenantId)`
- `addGroupMember(groupId, userId, role, actor)`
- `removeGroupMember(groupId, userId, actor)`
- `deleteUserGroup(groupId, actor)`
- `approveJoinRequest(groupId, userId, actor)`
- `rejectJoinRequest(groupId, userId, actor)`
- `searchPublicGroups(query, tenantId, limit, offset)`

The router wraps these functions with input validation and error handling.

## Implementation Details

### Router Structure

The groups router defines these procedures:

**Queries (read operations):**
- `list` — List user's groups (scopes: my_groups, member_of, all)
- `get` — Get single group with members
- `listTenantUsers` — Search users for adding to group
- `searchPublic` — Search public groups

**Mutations (write operations):**
- `create` — Create new group
- `update` — Update group metadata
- `delete` — Soft delete group + cascade permission deletion
- `addMember` — Add user to group
- `removeMember` — Remove user from group
- `leave` — Voluntary leave group (interview Q9)
- `updateMemberRole` — Change member role (admin ↔ member)
- `join` — Join open group (interview Q6)
- `requestJoin` — Request to join group (interview Q6)
- `approveMember` — Approve join request (interview Q6)
- `rejectMember` — Reject join request (interview Q6)

### Input Validation Schemas

All inputs use Zod schemas with these constraints:
- `name`: string, min 1 char, max 128 chars
- `description`: string, max 512 chars, optional
- `visibility`: enum("private", "public")
- `joinPolicy`: enum("invite_only", "request_to_join", "open")
- `role`: enum("admin", "member")
- `groupId`: number, positive integer
- `userId`: number, positive integer

### Error Handling Strategy

Map service layer errors to appropriate TRPCError codes:
- `UNAUTHORIZED` (401) — Not logged in (middleware handles this)
- `FORBIDDEN` (403) — Not group admin, not member, etc.
- `NOT_FOUND` (404) — Group doesn't exist
- `CONFLICT` (409) — Duplicate group name, already a member
- `BAD_REQUEST` (400) — Validation errors, limits exceeded

### Audit Logging

All mutations must log via existing audit logger:
```typescript
auditLogger.log({
  eventType: "groups_mutation",
  endpoint: "groups.create",
  tenantId: ctx.tenantId,
  userId: ctx.user.id,
  metadata: { groupId, action: "create" }
});
```

## Tests First (TDD Approach)

### Test File: `apps/web/server/routers/groups.test.ts`

**Test Structure:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appRouter } from './routers';
// Import test utilities for creating tRPC caller with mock context
```

**Critical Test Cases:**

#### groups.list
- [ ] returns user's owned groups when scope = 'my_groups'
- [ ] returns user's memberships when scope = 'member_of'
- [ ] returns all user's groups when scope = 'all'
- [ ] rejects unauthenticated requests

#### groups.get
- [ ] returns group with members for valid groupId
- [ ] rejects when user is not a member
- [ ] rejects when group doesn't exist
- [ ] includes pending join requests for admins

#### groups.create
- [ ] creates group with valid input
- [ ] rejects duplicate group name in tenant
- [ ] rejects when user exceeds 50 groups limit

#### groups.addMember
- [ ] adds member when actor is admin
- [ ] rejects when actor is not admin
- [ ] rejects cross-tenant member addition

#### groups.removeMember
- [ ] removes member when actor is admin
- [ ] allows self-removal

#### groups.leave
- [ ] allows member to leave group
- [ ] prevents owner from leaving

#### groups.delete
- [ ] deletes group when actor is owner
- [ ] rejects when actor is not owner
- [ ] cascades to library_permissions deletion

#### groups.searchPublic
- [ ] returns public groups in actor's tenant
- [ ] excludes private groups
- [ ] excludes deleted groups

#### groups.join
- [ ] joins open group immediately
- [ ] rejects join for invite-only groups

#### Router Registration
- [ ] groupsRouter is registered in appRouter
- [ ] groups.* endpoints are accessible via tRPC client

### Test Stub Example

```typescript
describe('groups.list', () => {
  it('returns user's owned groups when scope = my_groups', async () => {
    // TODO: Setup test database with user and owned groups
    // TODO: Create tRPC caller with authenticated context
    // TODO: Call groups.list({ scope: "my_groups" })
    // TODO: Assert returned groups are only those owned by user
  });

  it('rejects unauthenticated requests', async () => {
    // TODO: Create tRPC caller with null user context
    // TODO: Expect groups.list to throw UNAUTHORIZED error
  });
});
```

## Implementation Stubs

### Main Router File: `apps/web/server/routers/groups.ts`

**Stub Structure:**
```typescript
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as groupsService from '../services/groupsService';

// Input validation schemas
const createGroupSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  visibility: z.enum(['private', 'public']),
  joinPolicy: z.enum(['invite_only', 'request_to_join', 'open']).optional(),
});

export const groupsRouter = router({
  list: protectedProcedure
    .input(z.object({
      scope: z.enum(['my_groups', 'member_of', 'all']).default('all'),
    }))
    .query(async ({ ctx, input }) => {
      // TODO: Call groupsService.getUserGroups()
      // TODO: Filter by scope (owner vs member)
      // TODO: Return group list
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      // TODO: Validate user is group member
      // TODO: Fetch group with members
      // TODO: If admin, include pending join requests
    }),

  create: protectedProcedure
    .input(createGroupSchema)
    .mutation(async ({ ctx, input }) => {
      // TODO: Call groupsService.createUserGroup()
      // TODO: Log mutation via audit logger
      // TODO: Return created group
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Call groupsService.deleteUserGroup()
      // TODO: Log mutation via audit logger
      // TODO: Return success status
    }),

  addMember: protectedProcedure
    .input(z.object({
      groupId: z.number().positive(),
      userId: z.number().positive(),
      role: z.enum(['admin', 'member']).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Call groupsService.addGroupMember()
      // TODO: Log mutation via audit logger
      // TODO: Return success status
    }),

  removeMember: protectedProcedure
    .input(z.object({
      groupId: z.number().positive(),
      userId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Call groupsService.removeGroupMember()
      // TODO: Log mutation via audit logger
      // TODO: Return success status
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Call groupsService.removeGroupMember(groupId, ctx.user.id, ctx.user)
      // TODO: Log mutation via audit logger
      // TODO: Return success status
    }),

  // Additional procedures: update, updateMemberRole, searchPublic, join, 
  // requestJoin, approveMember, rejectMember...
});
```

### Router Registration: `apps/web/server/routers.ts`

**Modify existing file:**
```typescript
import { groupsRouter } from './routers/groups';

export const appRouter = router({
  library: libraryRouter,
  groups: groupsRouter, // NEW
  // ... other routers
});

export type AppRouter = typeof appRouter;
```

## Error Handling Patterns

### Service Error → TRPCError Mapping

```typescript
try {
  await groupsService.createUserGroup(input, actor);
} catch (error) {
  if (error.code === 'DUPLICATE_GROUP_NAME') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A group with this name already exists',
    });
  }
  if (error.code === 'GROUP_LIMIT_EXCEEDED') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You have reached the maximum of 50 groups',
    });
  }
  throw error; // Re-throw unexpected errors
}
```

## Validation Examples

### Cross-Tenant Isolation Check

```typescript
// In addMember procedure
const targetUser = await db.query.users.findFirst({
  where: eq(users.id, input.userId),
});

if (!targetUser || targetUser.tenantId !== ctx.tenantId) {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Cannot add user from different tenant',
  });
}
```

### Permission Check

```typescript
// In delete procedure
const group = await db.query.userGroups.findFirst({
  where: eq(userGroups.id, input.groupId),
});

if (group.ownerId !== ctx.user.id) {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only group owner can delete group',
  });
}
```

## Integration with Frontend

The frontend will consume these endpoints via tRPC client:

```typescript
// Example usage in GroupManagement.tsx
const { data: groups } = trpc.groups.list.useQuery({ scope: 'my_groups' });
const createGroup = trpc.groups.create.useMutation();

// Example usage in GroupDetailPanel.tsx
const { data: group } = trpc.groups.get.useQuery({ id: groupId });
const removeMember = trpc.groups.removeMember.useMutation();
```

## Performance Considerations

- **Pagination:** List endpoints should support `limit` and `offset` for large result sets (20-50 items per page)
- **Caching:** Group membership caching is handled in the service layer (section-10)
- **N+1 Queries:** Use Drizzle's join capabilities to fetch related data in single queries

## Security Checklist

Before marking this section complete, verify:
- [ ] All procedures validate tenant isolation
- [ ] All procedures check user authentication (via protectedProcedure)
- [ ] Admin-only operations check role correctly
- [ ] Owner-only operations check ownership correctly
- [ ] All mutations have audit logging
- [ ] Input validation covers all edge cases (empty strings, negative numbers, etc.)
- [ ] Error messages don't leak sensitive information

## Acceptance Criteria

This section is complete when:
1. All 14 procedures are implemented with proper input validation
2. All test cases pass (100% for this router)
3. Router is registered in appRouter and accessible via tRPC client
4. All mutations log to audit logger
5. Error handling maps service errors to appropriate TRPCError codes
6. Cross-tenant isolation is enforced in all procedures
7. TypeScript types are correctly inferred (no `any` types)

## Known Issues & Future Enhancements

**Limitations:**
- No bulk operations (e.g., add multiple members at once)
- No group templates (pre-defined group types)
- No transfer ownership endpoint (owner remains owner forever in MVP)

**Post-MVP:**
- Add `transferOwnership` mutation
- Add bulk member operations
- Add group activity log endpoint

## Additional Notes

- Follow existing router patterns in `apps/web/server/routers/library.ts` and `apps/web/server/routers/chat.ts` for consistency
- Use Drizzle ORM patterns consistent with existing codebase
- Ensure all timestamps use PostgreSQL's NOW() function (not JavaScript Date)
- Test with realistic data: 50+ groups, 100+ members per group

---

**End of Section 04**