# Section 03 Code Review Interview

**Date**: 2026-03-21
**Review**: section-03-review.md

## Triage Summary

| Finding | Severity | Decision | Action |
|---------|----------|----------|--------|
| `actionUrl` bypass of `safeNavigate` in inline view | HIGH | Auto-fix | Applied `safeNavigate()` call |
| Missing `getGroupOccurrences` call assertion | HIGH | Auto-fix | Added assertion with expected args |
| Missing timestamp assertions in detail panel test | HIGH | Auto-fix | Added `First:` and `Last:` assertions |
| Double-schedule test doesn't test the guard | MEDIUM | Auto-fix | Simplified test to verify single reconnect after timer |
| Error message truncation in Notifications detail panel | MEDIUM | Auto-fix | Added 500-char truncation |
| `safeNavigate` duplication across files | MEDIUM | Let go | Out of scope for this section; can be refactored later |
| Missing `marginLeft: "4px"` on badge | LOW | Let go | Minor styling nit |
| `Notifications.tsx` listed as Modify vs Create | LOW | Let go | Informational only |
| Non-null assertion `expandedGroupId!` | LOW | Let go | `enabled` guard prevents query from firing |
| `selectedId` not cleared on page change | LOW | Let go | Pre-existing behavior, not introduced by this section |

## Auto-fixes Applied

1. **GlobalAlerts.tsx:928** — Replaced `setLocation((n as any).actionUrl)` with `safeNavigate((n as any).actionUrl, setLocation)` in the inline expanded view action button
2. **Notifications.groupExpansion.test.tsx** — Added `expect(mockGetGroupOccurrences).toHaveBeenCalledWith({ notificationId: 10, limit: 10 }, expect.any(Object))` assertion
3. **Notifications.groupExpansion.test.tsx** — Added `First:` and `Last:` timestamp assertions in the detail panel test
4. **useSSEReconnect.test.ts** — Simplified the "does not reconnect while a reconnection is pending" test to verify only one EventSource is created after a single timer advance
5. **Notifications.tsx:467** — Added 500-char truncation to error message in detail panel

## Verification

All 17 tests pass after fixes applied.
