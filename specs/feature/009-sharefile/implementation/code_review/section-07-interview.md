# Section 07: Code Review Interview

## Auto-Fixed Issues

### ISSUE 1: SQL Wildcard Injection (HIGH) - AUTO-FIXED
- Escaped `%` and `_` in `searchTenantUsers` search pattern to prevent wildcard-based user enumeration.

### ISSUE 3: getGroupMembers lacks membership check (HIGH) - AUTO-FIXED
- Added active membership verification before returning group members. Non-members now get FORBIDDEN error.

### ISSUE 5: GroupDetailPanel missing auth check (MEDIUM) - AUTO-FIXED
- Added `isAuthenticated` check with redirect to `/login`.

### ISSUE 6: trpcUtils ordering in GroupDiscovery (MEDIUM) - AUTO-FIXED
- Moved `trpc.useUtils()` call before mutation declarations.

### ISSUE 7: Settings cast null guard (MEDIUM) - AUTO-FIXED
- Added fallback defaults for `group.settings` before type cast.

### ISSUE 18: NaN groupId handling (LOW) - AUTO-FIXED
- Added early return with error message for invalid group IDs.

## User Decisions

### ISSUE 2: searchTenantUsers authorization (HIGH)
- **Decision:** Leave as-is (any authenticated tenant user can search)
- **Rationale:** Consistent with existing `follows.searchUsers` endpoint pattern. Tenant-scoped user search is acceptable for this application.

## Deferred to Later Sections

### ISSUE 4: Test stubs (HIGH)
- All component tests are `.todo()` stubs. Will be implemented in section-11-security-tests when jsdom environment is configured.

### ISSUE 8-11: Sort/debounce/pagination (MEDIUM)
- Client-side sort and missing debounce are acceptable MVP limitations. Server-side sort parameter and debounce can be added in optimization section.

### ISSUE 12-17: Low severity items
- Aria labels, Radix RadioGroup, export consistency, duplicated badge, row-level pending state, member removal confirmation - all deferred as non-blocking for MVP.
