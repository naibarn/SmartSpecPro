# Section 12 Code Review Interview

## Auto-Fixed Issues

### Fix 1: Escape LIKE wildcards in search input (#1)
Added escaping for `%` and `_` characters in the search string before passing to `ilike()`. The fileType filter is also a constrained set so doesn't need escaping.

### Fix 2: Filter getRecentActivity by Drive-related service tags (#2)
Added WHERE filter for service tags matching `library.%`, `rag.%`, and `gdrive.%` so the Recent Activity list only shows relevant operations.

### Fix 3: Open FolderPicker from Indexing Mode card (#5)
Added "Manage" button to the Indexing Mode Card that calls `setFolderPickerOpen(true)`. The FolderPicker was mounted but never opened.

### Fix 4: Remove dead `onSyncNow` prop (#6)
Removed the unused `onSyncNow` prop from OverviewPanel. The sync mutation is handled directly inside the component.

### Fix 5: Reset FolderPicker state on reopen (#20)
Added `useEffect` to sync `initialSelectedFolders` prop back to state when the dialog opens.

### Fix 6: FolderPicker initialSelectedFolders name fallback (#13)
Changed to show folder ID as fallback name with a "(Folder ID)" suffix to make it clear it's not the actual name.

## Let-Go Issues (Accepted)

- #3 (correlated subquery): Performance is acceptable for pageSize=20. Optimization can come later.
- #4 (3 queries in overview): Round-trip cost is minimal. Combining would add complexity.
- #7 (Quick Actions row): Nice-to-have but the individual cards already have action buttons.
- #8 (Transaction History table): Credit Usage tab has breakdown + chart. Full transaction history exists on the Credits page already.
- #9 (storageUsedBytes): Minor missing field, no UI depends on it.
- #10 (admin-configured pricing): Static pricing table is sufficient for now. Can be data-driven later.
- #11 (test files): Tests are defined in the plan as pseudocode. Frontend component tests require complex mocking setup that isn't blocking.
- #12 (dark mode): The app currently uses light mode. Dark mode support is not a regression since it's not fully implemented elsewhere.
- #14 (native select): Functional and consistent enough. Can be upgraded to Radix Select later.
- #15 (native confirm): Works fine. AlertDialog upgrade is cosmetic.
- #16 (inline types): Acceptable for map callbacks. Extracting interfaces adds little value for internal components.
- #17 (removeFromIndex chunks): library_chunks cascade will handle deletion when hard-delete is needed. Soft-delete exclusion is handled by deletedAt filter.
- #18 (reindexFile triggers full sync): Acceptable for MVP. Single-file re-index endpoint can be added in a future iteration.
- #19 (query explosion): TanStack Query handles this well with deduplication. Depth limit is a nice-to-have.
