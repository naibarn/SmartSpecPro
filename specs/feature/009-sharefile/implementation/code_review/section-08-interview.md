# Code Review Interview: Section 08

## Decisions

### ISSUE 1: Multi-source permission display (HIGH) -> DEFER
Backend `getLibraryItemShares` doesn't return `sources` field. Needs backend schema changes. Deferred to section-10 (caching & optimization).

### ISSUE 2: Remove share confirmation (HIGH) -> AUTO-FIX
Adding confirmation step before removing shares. Using window.confirm for MVP simplicity.

### ISSUE 3: Authorization check (HIGH) -> AUTO-FIX
Adding permission check - hide management controls when user lacks delete/owner permission. Will pass user's effective permission from the getItemShares response or getItem query.

### ISSUE 4: Tests use SSR (HIGH) -> ACCEPT
Known project limitation (vitest node environment). Interactive tests planned for section-11.

### ISSUE 5: itemId:0 query key (MEDIUM) -> LET GO
The `enabled` flag prevents the query from firing. Low risk.

### ISSUE 6: No optimistic updates (MEDIUM) -> DEFER
Acceptable for MVP. Can be added later.

### ISSUE 7: No error state UI (MEDIUM) -> AUTO-FIX
Adding error state display and disabling controls on error.

### ISSUE 8: Unused itemId prop (MEDIUM) -> AUTO-FIX
Remove unused prop from ShareButton.

### ISSUE 9: Loading state for groups (MEDIUM) -> AUTO-FIX
Add loading indicator for groups dropdown.

### ISSUE 10: role="status" (LOW) -> AUTO-FIX
Change to simple aria-label without role.

### ISSUE 11-13: Minor (LOW) -> ACCEPT
Acceptable deviations.

## Applied Fixes
- Fix 2: Add confirmation dialog for remove share
- Fix 3: Add canManageShares prop to conditionally show controls
- Fix 7: Show error state when shares fail to load
- Fix 8: Remove unused itemId from ShareButton interface
- Fix 9: Add loading spinner for groups dropdown
- Fix 10: Remove role="status" from PermissionBadge
