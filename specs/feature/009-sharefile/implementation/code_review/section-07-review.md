# Code Review: Section 07 - Group Management UI

## HIGH Severity

### ISSUE 1: SQL Wildcard Injection in searchTenantUsers
- **File:** groupsService.ts (searchTenantUsers)
- `%${query.trim()}%` does not escape SQL wildcards (`%`, `_`). Users can search `%` to list all tenant users.
- **Fix:** Escape wildcards before building search pattern.

### ISSUE 2: searchTenantUsers lacks group admin authorization
- **File:** groups.ts router (searchTenantUsers)
- Any authenticated user can search the full tenant user directory. Plan says this is for AddMemberDialog (admin-only).
- **Fix:** Make excludeGroupId required, verify caller is admin/owner of that group.

### ISSUE 3: getGroupMembers lacks membership check
- **File:** groupsService.ts (getGroupMembers)
- Only verifies group exists in tenant, not that caller is a member. Any auth user can list members (including emails) of any group in tenant.
- **Fix:** Add membership check after group retrieval.

### ISSUE 4: All tests are todo stubs
- **File:** All 5 test files
- Zero actual test implementations. Plan specifies 80%+ coverage.
- **Fix:** Tests are stubs pending jsdom environment config (section-11).

## MEDIUM Severity

### ISSUE 5: Routes not using protectedRoute wrapper
- **File:** App.tsx
- Plan specifies using `protectedRoute` wrapper, but routes are plain `<Route>`. GroupDetailPanel has no auth redirect at all.
- **Fix:** Add auth check to GroupDetailPanel.

### ISSUE 6: trpcUtils declared after usage in GroupDiscovery
- **File:** GroupDiscovery.tsx
- `const trpcUtils = trpc.useUtils()` called after mutations that reference it.
- **Fix:** Move to before mutation declarations.

### ISSUE 7: GroupDetailPanel settings cast without null guard
- **File:** GroupDetailPanel.tsx
- `group.settings as { visibility, joinPolicy }` could crash if settings is null.
- **Fix:** Add fallback defaults.

### ISSUE 8: Client-side sorting defeats server pagination
- **File:** GroupDiscovery.tsx
- "Recently Created" sort only re-sorts current page, not actual recent groups.
- **Note:** Acceptable MVP limitation, server sort can be added later.

### ISSUE 9-10: Missing debounce on search inputs
- **Files:** GroupDiscovery.tsx, GroupManagement.tsx (Public Groups tab)
- Search triggers API on every keystroke.
- **Fix:** Add debounce like AddMemberDialog.

### ISSUE 11: Pagination heuristic with exactly 20 results
- **File:** GroupDiscovery.tsx
- Next button shown when exactly 20 results, may lead to empty next page.
- **Note:** Minor UX issue, acceptable for MVP.

## LOW Severity

### ISSUE 12: Missing aria-label on search inputs
### ISSUE 13: Native radio buttons instead of Radix RadioGroup
### ISSUE 14: GroupDetailPanel uses default export (inconsistent)
### ISSUE 15: JoinPolicyBadge logic duplicated
### ISSUE 16: Approve/Reject disables all rows simultaneously
### ISSUE 17: Remove member has no confirmation dialog
### ISSUE 18: NaN groupId shows infinite loading
