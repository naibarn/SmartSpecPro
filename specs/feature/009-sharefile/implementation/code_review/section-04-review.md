## Section 04: Groups Router - Code Review

### CRITICAL Issues

#### 1. SECURITY: `join` procedure fabricates a fake admin actor to bypass authorization
The `join` procedure calls `addGroupMember` with a synthetic actor impersonating the group owner:
```typescript
await addGroupMember(
  { groupId: input.groupId, userId: ctx.user.id, role: "member" },
  { userId: group.ownerId, tenantId, role: "admin" },
);
```
This circumvents the authorization model. If `addGroupMember` ever adds audit logging with `actor.userId`, it will record the wrong user. It also sets `addedBy` to `group.ownerId` in the database, which is false.

#### 2. SECURITY: `updateMemberRole` has no status filter -- can promote removed/pending members
The WHERE clause has no `eq(groupMembers.status, "active")` filter. A caller can change the role of a "removed" or "pending" member.

#### 3. SECURITY: `updateMemberRole` allows changing the owner's role
No check preventing an admin from changing the owner's membership role, creating inconsistent state.

#### 4. MISSING: Zero audit logging on ALL mutations
The plan explicitly requires "All mutations log to audit logger." The groups router has zero audit log calls across all 10 mutations.

### HIGH Issues

#### 5. `update` procedure bypasses the service layer with raw DB access
Directly imports `getDb`, `userGroups`, and drizzle-orm operators. No cache invalidation, uses JavaScript `new Date()` instead of PostgreSQL NOW(), loses type safety with `Record<string, unknown>`.

#### 6. `updateMemberRole` also bypasses the service layer with raw DB access
Same problem as #5. No cache invalidation after changing a member's role.

#### 7. `requestJoin` bypasses the service layer entirely
Directly inserts into `groupMembers` table. Doesn't set `addedBy`, doesn't check active membership, doesn't check MAX_GROUP_MEMBERS limit, no cache invalidation.

#### 8. `get` procedure fetches ALL user's groups just to find one
Calls `getUserGroups(actor)` which fetches every group, then `.find()`. Also doesn't include pending join requests for admins as the plan requires.

#### 9. Error mapping relies on fragile string matching
The service layer already throws `TRPCError` instances, so the `if (error instanceof TRPCError) throw error;` line re-throws them directly. The string-matching blocks after that are largely dead code.

### MEDIUM Issues

#### 10. Missing `listTenantUsers` procedure from the plan
The plan specifies a `listTenantUsers` query for searching users to add to groups.

#### 11. `leave` error handling catches "owner" string but service throws BAD_REQUEST
The `TRPCError` check runs first, so service's BAD_REQUEST is re-thrown directly, not converted to FORBIDDEN.

#### 12. Dynamic imports inside request handlers
Multiple procedures use `import()` for getDb, schema, and drizzle-orm inside handlers. Inconsistent with codebase pattern of top-level static imports.

#### 13. `update` uses `new Date()` instead of PostgreSQL NOW()
Plan explicitly states: "Ensure all timestamps use PostgreSQL's NOW() function."

#### 14. Tests are 100% stubs
53 `it.todo()` stubs with zero implementations.

### LOW Issues

#### 15. `iconUrl` validation allows any string up to 512 chars
No URL format validation. Consider `.url()` or regex pattern.

#### 16. `searchPublic` query parameter allows empty string
No `.min(1)`, so empty string passes and results in match-all behavior.

### Summary

The implementation has the right shape with 14 procedures matching the plan. However, serious architectural issues: three procedures bypass the service layer, `join` fabricates a fake actor, zero audit logging, and tests are entirely stubs. Error handling is present but largely dead code since the service layer already throws `TRPCError`.
