# Section 12 Code Review Interview

## Triage Summary

| Finding | Severity | Decision |
|---------|----------|----------|
| `triggerConflict` dead code / no wiring | HIGH | Auto-fixed — Replaced internal conflictDetected state with parent-controlled `hasConflict` prop + `onSaveForce`/`onReloadContent` callbacks |
| Overwrite clears conflict too early | HIGH | Auto-fixed — Conflict state now controlled by parent; surface just calls `onSaveForce` |
| Conditional render vs open prop | MEDIUM | Kept conditional render pattern for i18n provider safety |
| Hardcoded "Conflict detected" string | MEDIUM | Kept for now — all other status strings are also hardcoded; will i18n all in section 13 or later |
| Escape test doesn't exercise Radix guard | MEDIUM | Let go — Testing Radix internals in unit tests is fragile |
| documentTitle never passed | MEDIUM | Auto-fixed — Added to props interface and forwarded |
| Plain Button vs AlertDialogAction | LOW | Let go — Both work correctly |
| Duplicate message/description keys | LOW | Auto-fixed — Removed orphan `editor.conflict.message` |
| Out-of-scope files in diff | LOW | Not relevant — Prior working tree changes, not in this commit |

## Architecture Change

Changed from internal conflict state management to parent-controlled:
- Removed internal `conflictDetected` state from UnifiedDocumentSurface
- Added `hasConflict`, `onSaveForce`, `onReloadContent`, `documentTitle` to props
- Parent (DocumentManagement.tsx) controls when conflict dialog appears
- Surface calls `onSaveForce(md)` for overwrite, `onReloadContent()` for reload
- This is cleaner: the save handler lives in the parent, so conflict detection belongs there

## Verification

All 21 tests pass (6 ConflictResolutionDialog + 15 UnifiedDocumentSurface).
