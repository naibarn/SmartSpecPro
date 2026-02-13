# Code Review: Section 09 - Trash UI

## HIGH Severity

### ISSUE 1: Empty Trash uses N parallel mutations causing race conditions
- **File:** TrashPanel.tsx, `handleEmptyTrash`
- `Promise.all(items.map(item => deleteMutation.mutateAsync({ itemId: item.id })))` fires N independent mutation calls through a single `useMutation` hook. React Query tracks only a single pending state per hook instance. If one request fails mid-batch, partial deletions occur with no indication of which items failed.
- **Fix:** Use separate mutation instances, handle partial failures explicitly, and disable UI during batch operation.

### ISSUE 2: Restore/Delete buttons share single mutation instance - global disable
- **File:** TrashPanel.tsx, restore/delete buttons
- `disabled={restoreMutation.isPending}` disables ALL restore buttons when any single restore is in progress. Same for delete. No indication of which item is being processed.
- **Fix:** Track per-item pending state or use local loading state per item row.

### ISSUE 3: Missing 'Deleted by' user name display - plan requirement not implemented
- **File:** TrashPanel.tsx
- Plan requires showing "Deleted by You" / "Deleted by John Doe" per item. Backend returns `deletedBy: number | null`. Implementation ignores `deletedBy` field entirely.
- **Fix:** Resolve `deletedBy` user ID. At minimum show "Deleted by you" when `deletedBy === currentUserId`.

## MEDIUM Severity

### ISSUE 4: No pagination - only first 50 items shown
- Query hardcoded to `{ limit: 50, offset: 0 }` with no pagination controls. `total` from response is unused.

### ISSUE 5: handleEmptyTrash does not disable UI during batch operation
- User can click individual buttons or Empty Trash again while batch is running.
- **Fix:** Add `isEmptyingTrash` state flag, disable all buttons while batch runs.

### ISSUE 6: Dangling separator when daysUntilPurge < 7
- `{item.daysUntilPurge >= 7 ? ... : null}` renders "Deleted 87 days ago · " with trailing dot and nothing after.
- **Fix:** Conditionally render separator with the days-left text, or always show days-left.

### ISSUE 7: DocumentManagement.tsx computes listInput with 'my_library' for trash tab
- `listScope` maps trash to `my_library`. Query is disabled but fragile coupling exists.

## LOW Severity

### ISSUE 8: No file type icon rendering
- Plan layout shows document type icons. Implementation shows no file type indicator.

### ISSUE 9: thumbnailUrl field fetched but never used

### ISSUE 10: No focus management after restore/delete actions
- After item disappears, focus goes nowhere. Disorienting for keyboard/screen-reader users.

### ISSUE 11: Hardcoded 90-day retention period string
- "permanently deleted after 90 days" is hardcoded. Backend uses `TRASH_PURGE_DAYS` constant.

### ISSUE 12: Tests only verify SSR - no interaction tests
- All tests use `renderToStaticMarkup`. Known limitation due to jsdom configuration.

### ISSUE 13: Plan specifies `.test.tsx` but implementation uses `.test.ts`
- Consistent with other component tests in project (all use `.test.ts`).
