# Section 03 Review — Phase 4 Frontend: SSE Reconnection, Occurrence Badge, Group Expansion

**Reviewed**: 2026-03-21
**Reviewer**: SmartSpecPro Reviewer Agent (CMD-8)
**Diff**: `section-03-diff.md`
**Plan**: `section-03-phase4-frontend-sse.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `GlobalAlerts.tsx` ~317 | `actionUrl` passed directly to `setLocation()` in inline expanded view, bypassing `safeNavigate` | Replace `setLocation((n as any).actionUrl)` with `safeNavigate((n as any).actionUrl, setLocation)` |
| HIGH | `Notifications.groupExpansion.test.tsx`:1577 | Test never asserts `getGroupOccurrences` was called with `{ notificationId: 10, limit: 10 }` — plan explicitly requires this assertion | Add `expect(mockGetGroupOccurrences).toHaveBeenCalledWith({ notificationId: 10, limit: 10 }, expect.any(Object))` |
| HIGH | `Notifications.groupExpansion.test.tsx`:1591 | Detail panel test only asserts `7 occurrences` — plan requires asserting `firstOccurredAt` and `lastOccurredAt` are rendered | Add assertions for `"First: 3/20/2026"` (or locale equivalent) and `"Last: 3/20/2026"` using the values in `mockNotifications` |
| MEDIUM | `useSSEReconnect.test.ts`:800 | "Does not reconnect while a reconnection is pending" test is structurally wrong — it advances the timer to full completion after each error, so it tests sequential reconnection, not the double-schedule guard | Rewrite: trigger error 1, then trigger error 2 BEFORE advancing the timer, then advance timer once, assert only one new EventSource was created (count +1, not +2) |
| MEDIUM | `Notifications.tsx`:1408 | `selected.metadata.errorDetails.errorMessage` rendered without length cap in detail panel | Add same truncation as GlobalAlerts bell panel: `{msg.length > 500 ? msg.slice(0, 500) + "..." : msg}` |
| MEDIUM | `GlobalAlerts.tsx` / `Notifications.tsx` | `safeNavigate` is duplicated across both files with a subtle difference (GlobalAlerts includes `console.warn`, Notifications silently drops it) | Extract `safeNavigate` to `@/lib/navigation.ts` and import it in both files; include the `console.warn` in both |
| LOW | `GlobalAlerts.tsx`:241-252 | Occurrence badge is missing `marginLeft: "4px"` that the plan specifies | Add `marginLeft: "4px"` to the badge style object |
| LOW | `Notifications.tsx` | Plan says `Action: Modify` but diff shows `new file mode 100644` — file did not exist before; this is correct given `git status` shows `??`, but the section dependency map should note this | No code change needed; update section index to reflect this was a page creation, not a modification |
| LOW | `Notifications.tsx`:1017-1019 | `expandedGroupId!` non-null assertion used even though `enabled: expandedGroupId !== null` guards the query — TypeScript will not complain but future readers may miss the invariant | Replace `expandedGroupId!` with `expandedGroupId ?? 0` for self-documenting intent; the `enabled` guard prevents the query from firing regardless |
| LOW | `Notifications.tsx`:1024 | `selected` is derived from `items` (current page), so selecting a notification then switching pages silently loses the selection without clearing `selectedId` | On page change (`setPage`), also call `setSelectedId(null)` |

---

### Detailed Finding Notes

#### HIGH-1: `safeNavigate` not applied to inline expanded action URL

In `GlobalNotificationBell`, when a notification is in the expanded inline view (not the detail panel), the structured `actionUrl` button calls:

```typescript
onClick={(e) => {
  e.stopPropagation();
  setShowDropdown(false);
  setLocation((n as any).actionUrl);  // <-- no sanitization
}}
```

The `NotificationDetailPanel` component correctly uses `safeNavigate(n.actionUrl, onNavigate)`. The inline expanded path in the list bypasses this. If `actionUrl` contains `javascript:evil()`, Wouter's `setLocation` will set the location to that string, which depending on the router implementation may or may not execute it, but the intent of the `safeNavigate` guard is to catch this. Since `actionUrl` is server-supplied and the section-02 review confirmed the server-side SSE payload does NOT sanitize `actionUrl` before publishing to Redis (that was a HIGH finding in section-02), this path is a live XSS vector until both fixes are in place.

Fix: change to `safeNavigate((n as any).actionUrl, setLocation)` after the `e.stopPropagation()` call.

#### HIGH-2 and HIGH-3: Incomplete test assertions for group expansion

The plan at line 59 states: "Assert that the endpoint was called with the correct `notificationId` and that 3 sub-items are rendered." Only the second half is tested. Similarly, the plan at line 61 lists `firstOccurredAt` and `lastOccurredAt` as required detail panel assertions — the test only checks `occurrenceCount`.

These are not defensive-coding nits; they are the primary security/correctness guarantee for the `getGroupOccurrences` ownership boundary. Without asserting the `notificationId` argument, a regression that always passes `0` or `undefined` to the endpoint would not be caught by this test suite.

#### MEDIUM-1: "No double-schedule" test does not test the guard

Current test (lines 800-823):
```
error 1 → advance timer fully → reconnect fires (count+1)
error 2 → advance timer fully → reconnect fires (count+2)
assert count = countAfterFirst + 2
```

This tests sequential reconnection, which is the normal case. The guard `if (reconnectTimerRef.current !== null) return;` on line 913 of `useSSEReconnect.ts` is not exercised by this test at all. The plan requires the test to verify "if an error occurs while a reconnection timer is already scheduled, the hook should not schedule a second timer."

Correct test structure:
```
error 1 → (timer is now pending, do NOT advance)
error 2 → (second error while timer pending)
advance timer fully
assert count = initial + 1  (only one reconnect fired)
```

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| SSE uses `withCredentials: true` | PASS | `useSSEReconnect` hardcodes `{ withCredentials: true }` |
| `onMessage` stale closure handled | PASS | `onMessageRef.current = onMessage` pattern used correctly |
| `MAX_RECONNECT_ATTEMPTS = 5` exported and tested | PASS | Constants exported; fallback test uses the export |
| `BASE_DELAY_MS`, `MAX_DELAY_MS` cap honored | PASS | `Math.min(BASE_DELAY_MS * Math.pow(2, n), MAX_DELAY_MS)` |
| Cleanup on unmount clears timer AND closes EventSource | PASS | Both `clearTimeout` and `es.close()` called in `cleanup` |
| `enabled=false` prevents EventSource creation | PASS | Tested at line 825 |
| Occurrence badge renders only when `occurrenceCount > 1` | PASS | `(n.occurrenceCount ?? 1) > 1` guard in both files |
| "Latest:" prefix for grouped content in bell | PASS | Ternary at diff line 262 |
| Detail panel shows `firstOccurredAt`, `lastOccurredAt`, `occurrenceCount` | PASS (impl) / FAIL (test) | Implementation correct; test does not verify timestamps |
| `getGroupOccurrences` query enabled only when group is expanded | PASS | `enabled: expandedGroupId !== null` |
| `safeNavigate` blocks `javascript:`, `data:`, `vbscript:`, `blob:` | PARTIAL | Applied in `NotificationDetailPanel` and `Notifications.tsx`; missing from inline expanded action URL in `GlobalNotificationBell` |
| Auth maintained on SSE reconnect | PASS | New `EventSource` calls also include `{ withCredentials: true }` |
| Fallback to polling described | PASS | `console.warn` + existing `refetchInterval` is the implicit fallback |
| `expandedGroupId` resets on expansion toggle | PASS | `setExpandedGroupId(expandedGroupId === n.id ? null : n.id)` |
| `occ.content` and `occ.metadata.source` rendered as text (no dangerouslySetInnerHTML) | PASS | Plain JSX text content throughout |
| `n.title`, `n.content` rendered as text | PASS | No dangerouslySetInnerHTML anywhere in the diff |

---

### Summary

The implementation is substantially correct and delivers all three planned capabilities: the `useSSEReconnect` hook is cleanly designed (refs for internal state, `onMessageRef` latest-value pattern, try/catch for unsupported environments), the occurrence badge renders consistently in both surfaces, and the group expansion query pattern is sound. Two issues require fixes before merge: the inline action URL in `GlobalNotificationBell` bypasses `safeNavigate` and is a live XSS vector given the section-02 SSE sanitization gap; and two test cases have missing assertions that were explicitly called out in the plan. The "no double-schedule" test also does not exercise the guard it claims to test and should be rewritten to verify the actual invariant.
