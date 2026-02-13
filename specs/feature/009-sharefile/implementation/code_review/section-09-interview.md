# Code Review Interview: Section 09

## Decisions

### ISSUE 1: Empty Trash parallel deletes (HIGH) -> DEFER
No batch `emptyTrash` endpoint exists. Adding a new backend endpoint is out of scope for this UI section. The current approach works for MVP. Can be optimized in section-10 (caching & optimization).

### ISSUE 2: Shared mutation isPending state (HIGH) -> ACCEPT
Known limitation of the SSR-first component. Per-item pending tracking requires more complex state. Backend is fast enough that UX impact is minimal. Can enhance later.

### ISSUE 3: Missing "Deleted by" display (HIGH) -> DEFER
The `listTrash` backend response includes `deletedBy` as a number (userId), not a username. Displaying "Deleted by [name]" requires either populating the name server-side or an additional user lookup query. This is a future enhancement for a more complete trash experience.

### ISSUE 4: No pagination (MEDIUM) -> ACCEPT
50-item limit is acceptable for MVP. Most users won't have 50+ items in trash.

### ISSUE 5: Dangling separator for < 7 days items (MEDIUM) -> AUTO-FIX
Fix the subtitle to not render separator when daysUntilPurge < 7.

### ISSUE 6: handleEmptyTrash dialog on partial failure (MEDIUM) -> AUTO-FIX
Close dialog in finally block and use Promise.allSettled.

### ISSUE 7: AlertDialogAction async timing (MEDIUM) -> ACCEPT
Radix AlertDialogAction has built-in close behavior, but the `onOpenChange` handler on the outer AlertDialog handles cleanup. The closure captures the id correctly. Low risk.

### ISSUE 8: Test file extension .ts vs .tsx (MEDIUM) -> ACCEPT
All section-08 tests also use .test.ts with SSR approach. This is the established pattern.

### ISSUE 9: XSS via item.title in aria-label (MEDIUM) -> ACCEPT
React escapes attribute values. File names are user-controlled but sanitized by the upload flow. Length truncation for aria-labels is a nice-to-have, not a security fix.

### ISSUE 10-15: Minor issues (LOW) -> ACCEPT
Acceptable deviations for MVP. formatDeleteInfo edge case (issue 15) is cosmetic.

## Applied Fixes
- Fix 5: Fix dangling separator for items with < 7 days remaining
- Fix 6: Close empty trash dialog in finally block
