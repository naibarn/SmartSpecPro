# Code Review: Section 08 - File Sharing UI

## HIGH Severity

### ISSUE 1: Multi-source permission display missing (Interview Q12)
Plan requires showing multiple rows when users have both direct and group permissions. Backend `getLibraryItemShares` doesn't return `sources` field. This needs backend changes and is deferred to section-10 optimization.

### ISSUE 2: Remove share has no confirmation dialog
Plan requires confirmation before removing shares. Current implementation removes on single click.

### ISSUE 3: No authorization check for share management
Plan says only users with delete/owner permission can manage shares. Dialog shows controls unconditionally.

### ISSUE 4: Tests use SSR rendering (known limitation)
Test environment is `node` (not jsdom). Cannot test interactivity, debounce, or mutations. This is a project-wide limitation, not section-specific.

## MEDIUM Severity

### ISSUE 5: `itemId: 0` in query key could cause transient errors
ShareButton query uses `item?.id ?? 0` with `enabled: Boolean(item?.id)`.

### ISSUE 6: No optimistic updates for permission changes
Plan requires optimistic UI updates for permission dropdown.

### ISSUE 7: No error state UI for failed share loading
Plan requires error message when shares fail to load.

### ISSUE 8: `ShareButton` accepts unused `itemId` prop

### ISSUE 9: No loading state for groups dropdown

## LOW Severity

### ISSUE 10: Permission badge `role="status"` semantically incorrect for static labels
### ISSUE 11: Manual debounce instead of `useDebouncedValue` hook
### ISSUE 12: Test file naming `.test.ts` vs plan `.test.tsx`
### ISSUE 13: `itemTitle` prop addition not in original plan
