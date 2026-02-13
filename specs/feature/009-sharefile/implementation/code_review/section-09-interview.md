# Code Review Interview: Section 09 - Trash UI

## User Decisions

### ISSUE 1: Empty Trash N parallel mutations (HIGH) → FIX at client
- Decision: Sequential delete with `isEmptyingTrash` state, disable UI during batch
- Use `Promise.allSettled` to handle partial failures gracefully

### ISSUE 2: Global disable on Restore/Delete (HIGH) → FIX per-item
- Decision: Track pending items with `Set<number>` for per-item loading state

### ISSUE 3: Missing "Deleted by" display (HIGH) → AUTO-FIX (partial)
- Backend returns `deletedBy: number | null` without username
- Show "Deleted by you" when deletedBy matches current user, omit otherwise

### ISSUE 6: Dangling separator when daysUntilPurge < 7 (MEDIUM) → AUTO-FIX
- Move separator inside conditional so it doesn't render alone

## Deferred (accepted for now)

### ISSUE 4: No pagination → ACCEPT for MVP
### ISSUE 7: listInput computed with my_library for trash → ACCEPT (low risk)
### ISSUES 8-13 (LOW): File type icons, thumbnails, focus management, hardcoded retention, interaction tests → Deferred

## Applied Fixes
1. Sequential empty trash with `isEmptyingTrash` state + `Promise.allSettled`
2. Per-item pending state using `Set<number>` for restore and delete
3. "Deleted by you" display when applicable
4. Fix dangling separator for items with < 7 daysUntilPurge
