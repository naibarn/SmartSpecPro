# Code Review Interview Transcript - Section 04

## User Decisions

### Issue #1: `join` procedure fabricates fake admin actor
**Question:** Should we add a dedicated `joinOpenGroup()` function to groupsService?
**User Decision:** Add joinOpenGroup() to service
**Action:** Create `joinOpenGroup(groupId, actor)` in groupsService that handles open group self-joins properly

### Issue #4: Zero audit logging on mutations
**Question:** Should we add audit logging now or defer?
**User Decision:** Add basic audit logging
**Action:** Add console-based audit log calls to each mutation

### Issues #5/#6/#7: Raw DB access in router for update, updateMemberRole, requestJoin
**Question:** Should we add proper service functions or keep raw DB access?
**User Decision:** Add service functions
**Action:** Create `updateUserGroup()`, `updateGroupMemberRole()`, `requestJoinGroup()` in groupsService

## Auto-Fixes to Apply

### Issue #2: Add status filter to updateMemberRole
**Severity:** CRITICAL
**Fix:** Add `eq(groupMembers.status, "active")` to WHERE clause (will be in new service function)

### Issue #3: Add owner protection in updateMemberRole
**Severity:** CRITICAL
**Fix:** Check that target user is not the group owner (will be in new service function)

### Issue #9: Simplify error handling
**Severity:** HIGH
**Fix:** Since service layer throws TRPCError, remove dead string-matching code

### Issue #12: Move dynamic imports to top-level
**Severity:** MEDIUM
**Fix:** Replace dynamic `import()` calls with static top-level imports

### Issue #15: Add URL validation to iconUrl
**Severity:** LOW
**Fix:** Add `.url()` or use existing URL validation pattern

## Deferred Items

### Issue #8: `get` fetches all groups
**Decision:** Defer to section-10 caching optimization

### Issue #10: Missing `listTenantUsers`
**Decision:** Frontend can use existing `follows.searchUsers` endpoint

### Issue #11: `leave` error code mismatch
**Decision:** BAD_REQUEST vs FORBIDDEN is cosmetic at this stage

### Issue #13: JavaScript Date vs SQL NOW
**Decision:** Consistent with rest of codebase

### Issue #14: Test stubs
**Decision:** Full tests deferred to section-11-security-tests

### Issue #16: Empty query string
**Decision:** Match-all behavior is acceptable

## Summary of Changes

**Service Layer Additions (groupsService.ts):**
1. `joinOpenGroup(groupId, actor)` - self-join for open groups
2. `updateUserGroup(groupId, input, actor)` - update group metadata
3. `updateGroupMemberRole(groupId, userId, role, actor)` - change member role
4. `requestJoinGroup(groupId, actor)` - create pending membership

**Router Fixes (groups.ts):**
1. Use new service functions instead of raw DB access
2. Add audit logging to all mutations
3. Move dynamic imports to top-level
4. Simplify error handling
5. Add URL validation to iconUrl
