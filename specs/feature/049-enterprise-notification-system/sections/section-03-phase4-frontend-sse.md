# Section 03: Phase 4 Frontend — SSE Reconnection, Occurrence Badge, Group Expansion

**Section ID**: `section-03-phase4-frontend-sse`
**Depends on**: section-01-phase4-schema-migration (schema columns), section-02-phase4-dedup-service (dedup logic + getGroupOccurrences endpoint)
**Blocks**: nothing
**Parallelizable**: Yes (with section-02 complete)

---

## Overview

This section adds three frontend capabilities for Phase 4 deduplication support:

1. **Occurrence badge** (xN) on grouped notifications in GlobalNotificationBell dropdown and Notifications page
2. **Group expansion UI** on the Notifications page that calls the `getGroupOccurrences` tRPC endpoint to show individual occurrences
3. **SSE reconnection with exponential backoff** replacing the current close-on-error behavior in GlobalNotificationBell

All changes are additive to existing rendering logic. The occurrence badge renders only when `occurrenceCount > 1` on a notification item. SSE reconnection is a standalone fix independent of dedup.

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/components/GlobalAlerts.tsx` | Modify | Add occurrence badge in bell dropdown items; replace SSE onerror with exponential backoff reconnection |
| `apps/web/client/src/pages/Notifications.tsx` | Modify | Add occurrence badge in list items; add expandable group section; show group timing in detail panel |
| `apps/web/client/src/lib/useSSEReconnect.ts` | Create | Reusable SSE hook with exponential backoff logic |
| `apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts` | Create | Tests for SSE reconnection hook |
| `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx` | Create | Tests for occurrence badge rendering |
| `apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx` | Create | Tests for group expansion UI |

---

## Tests (TDD)

### Test File: `apps/web/client/src/lib/__tests__/useSSEReconnect.test.ts`

Tests for the `useSSEReconnect` hook:

- **SSE reconnection attempts exponential backoff (1s, 2s, 4s...)**: Simulate EventSource onerror events. After each error, verify the hook schedules a reconnection with the correct delay (1000ms, 2000ms, 4000ms, 8000ms, 16000ms). Use `vi.useFakeTimers()` to control timing.
- **SSE resets attempt counter on successful connection**: After reconnecting successfully (EventSource emits `open` or `connected` event), verify the attempt counter resets to 0 so the next failure starts from 1s delay again.
- **SSE falls back to polling after MAX_RECONNECT attempts (5)**: After 5 consecutive errors, verify the hook stops attempting reconnection and does NOT create a new EventSource. The existing 30s polling via `refetchInterval` is the implicit fallback.
- **SSE cleanup closes EventSource on unmount**: Verify that the returned cleanup function closes the EventSource and clears any pending reconnection timers.
- **SSE does not reconnect while a reconnection is pending**: If an error occurs while a reconnection timer is already scheduled, the hook should not schedule a second timer.

### Test File: `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx`

Tests for occurrence badge in the bell dropdown:

- **GlobalNotificationBell renders occurrence badge (xN) when occurrenceCount > 1**: Mock `trpc.scheduledMessages.getNotifications` to return a notification with `occurrenceCount: 5`. Render GlobalNotificationBell, open dropdown. Assert that a `"x5"` badge is visible adjacent to the notification content.
- **GlobalNotificationBell does NOT render occurrence badge when occurrenceCount is 1**: Same setup but `occurrenceCount: 1`. Assert no `"x1"` badge is rendered.
- **GlobalNotificationBell shows "Latest:" prefix for grouped notification content**: Mock a notification with `occurrenceCount: 3` and `content: "Job failed"`. Assert the rendered content shows `"Latest: Job failed"`.

### Test File: `apps/web/client/src/pages/__tests__/Notifications.groupExpansion.test.tsx`

Tests for group expansion on the Notifications page:

- **GroupExpansion component calls getGroupOccurrences and renders sub-items**: Mock `trpc.scheduledMessages.getGroupOccurrences` to return 3 occurrences. Render a notification with `occurrenceCount: 3`, click the "Expand group" button. Assert that the endpoint was called with the correct `notificationId` and that 3 sub-items are rendered with their `content` and `occurredAt` timestamps.
- **Occurrence badge (xN) renders in notification list item when occurrenceCount > 1**: Mock `trpc.scheduledMessages.getNotificationHistory` with a notification having `occurrenceCount: 7`. Assert that `"x7"` badge is visible in the list.
- **Detail panel shows firstOccurredAt, lastOccurredAt, occurrenceCount for grouped notifications**: Select a notification with `occurrenceCount: 4`, `firstOccurredAt: "2026-03-20T10:00:00Z"`, `lastOccurredAt: "2026-03-20T11:30:00Z"`. Assert the detail panel renders all three values.
- **Group expansion shows empty state when no occurrences exist**: Mock `getGroupOccurrences` to return an empty array. Click "Expand group". Assert "No individual occurrences recorded" or similar message appears.
- **Group expansion collapse toggles visibility**: Click "Expand group" to expand, then click again to collapse. Assert sub-items are hidden after collapse.

---

## Implementation Details

### 1. SSE Reconnection Hook: `apps/web/client/src/lib/useSSEReconnect.ts`

Create a reusable custom hook that encapsulates EventSource lifecycle with exponential backoff reconnection.

**Interface**:

```typescript
interface UseSSEReconnectOptions {
  url: string;
  /** Called when a message of the given event type arrives */
  onMessage: () => void;
  /** Event type to listen for (default: "notification") */
  eventType?: string;
  /** Whether the hook is active (default: true) */
  enabled?: boolean;
}
```

**Constants** (exported for testing):

- `MAX_RECONNECT_ATTEMPTS = 5`
- `BASE_DELAY_MS = 1000`
- `MAX_DELAY_MS = 30000`

**Behavior**:

1. On mount (when `enabled`), create `new EventSource(url, { withCredentials: true })`
2. Listen for the specified `eventType` and call `onMessage`
3. On the `open` event, reset the attempt counter to 0
4. On `onerror`:
   - Close the current EventSource
   - If `attempts < MAX_RECONNECT_ATTEMPTS`, schedule a reconnection after `min(BASE_DELAY_MS * 2^attempts, MAX_DELAY_MS)` milliseconds
   - Increment attempts
   - If `attempts >= MAX_RECONNECT_ATTEMPTS`, stop reconnecting (log a warning via `console.warn`)
5. On cleanup (unmount or `enabled` becoming false), close EventSource and clear any pending reconnection timeout via `clearTimeout`

**Internal state** managed via `useRef`:

- `esRef: React.MutableRefObject<EventSource | null>`
- `attemptsRef: React.MutableRefObject<number>`
- `reconnectTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>`

Do NOT use `useState` for attempts — it would cause unnecessary re-renders and the value is only needed inside the effect.

### 2. GlobalAlerts.tsx Changes

**Replace SSE block** (lines ~648-668) with the `useSSEReconnect` hook:

```typescript
// Before (current):
useEffect(() => {
  let es: EventSource | null = null;
  try {
    es = new EventSource("/api/notifications/stream", { withCredentials: true });
    // ...
    es.onerror = () => { es?.close(); };
  } catch { }
  return () => { es?.close(); };
}, [showDropdown, utils]);

// After:
useSSEReconnect({
  url: "/api/notifications/stream",
  onMessage: () => {
    utils.scheduledMessages.getNotificationCount.invalidate();
    if (showDropdown) {
      utils.scheduledMessages.getNotifications.invalidate();
    }
  },
  eventType: "notification",
  enabled: true,
});
```

Note: The `onMessage` callback references `showDropdown` and `utils`, so wrap it in `useCallback` with those dependencies to avoid stale closures. The hook should accept the callback as a ref or use the latest value pattern internally.

**Add occurrence badge** to each notification item in the dropdown list (around line ~827-850 where `notifications.map((n: any) => ...)` renders). After the notification content text, conditionally render:

```tsx
{(n.occurrenceCount ?? 1) > 1 && (
  <span style={{
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "4px",
    background: "rgba(99, 102, 241, 0.15)",
    color: "#818cf8",
    fontWeight: 600,
    flexShrink: 0,
    marginLeft: "4px",
  }}>
    x{n.occurrenceCount}
  </span>
)}
```

**Add "Latest:" prefix** for grouped notification content display: When `occurrenceCount > 1`, prefix the displayed content with `"Latest: "` so the user understands this is the most recent event in a group.

### 3. Notifications.tsx Changes

**Occurrence badge in list items** (around line ~224-265 where each notification renders). Add the same occurrence badge span after the priority badge in the header row of each list item. Use the same styling as GlobalAlerts for consistency.

**Expandable group section**: Below the content line of each list item, when `(n.occurrenceCount ?? 1) > 1`, render an "Expand group (xN)" button. When clicked:

1. Toggle a local state `expandedGroupId` (one group expanded at a time for simplicity)
2. Call `trpc.scheduledMessages.getGroupOccurrences.useQuery({ notificationId: n.id, limit: 10 }, { enabled: expandedGroupId === n.id })` to fetch occurrences
3. Render occurrences as indented sub-items below the parent notification:
   - Each sub-item shows: `content`, `occurredAt` formatted as locale string
   - Styled with left border (`borderLeft: "2px solid var(--border, #444)"`) and left padding to indicate hierarchy
   - If metadata present, show a condensed view (error message or source)

**Detail panel group info**: When the selected notification has `occurrenceCount > 1`, add a "Group Info" section in the detail panel (between the content and resource sections) showing:
- `occurrenceCount` (e.g., "4 occurrences")
- `firstOccurredAt` formatted
- `lastOccurredAt` formatted
- A link/button to expand the group if not already expanded

**State management for expansion**: Add to the component:

```typescript
const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

const { data: groupOccurrences, isLoading: groupLoading } =
  trpc.scheduledMessages.getGroupOccurrences.useQuery(
    { notificationId: expandedGroupId!, limit: 10 },
    { enabled: expandedGroupId !== null }
  );
```

### 4. Data Shape Assumptions

The notification objects returned by `getNotifications` and `getNotificationHistory` will include the new columns added in section-01:

- `occurrenceCount: number` (default 1)
- `firstOccurredAt: string` (ISO timestamp)
- `lastOccurredAt: string` (ISO timestamp)
- `groupKey: string | null`

These are returned by the existing Drizzle `select()` calls which automatically include all columns from the `userNotifications` table. No router changes are needed to expose these fields.

The `getGroupOccurrences` endpoint (added in section-02) returns:

```typescript
Array<{
  id: number;
  content: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string; // ISO timestamp
}>
```

### 5. Fallback Behavior

- When `occurrenceCount` is missing or `undefined` on a notification object (e.g., older notifications created before the migration), treat it as `1` using `(n.occurrenceCount ?? 1)`. This ensures no visual change for pre-existing notifications.
- When `firstOccurredAt` or `lastOccurredAt` are missing, do not render the group info section in the detail panel.
- The SSE reconnection hook gracefully handles the case where `EventSource` is not available in the browser (e.g., SSR or very old browsers) with a try/catch guard.

---

## Dependencies on Other Sections

- **section-01-phase4-schema-migration**: Adds `occurrenceCount`, `firstOccurredAt`, `lastOccurredAt`, `groupKey` columns to `userNotifications` table and creates the `notificationOccurrences` table. Without these columns, the occurrence badge will always show default values and group expansion will have no data.
- **section-02-phase4-dedup-service**: Adds the `getGroupOccurrences` tRPC endpoint to the `scheduledMessages` router. Without this endpoint, the group expansion button will not be able to fetch occurrence sub-items.

---

## Security Considerations

- **SSE endpoint authentication**: No changes to the server-side SSE endpoint. The existing JWT auth via cookie (`withCredentials: true`) is maintained.
- **SSE connection cap (S4)**: The reconnection logic uses the same single EventSource pattern. The server-side cap of 5 connections per user prevents reconnection storms from consuming resources. The client-side cap of `MAX_RECONNECT_ATTEMPTS = 5` provides additional protection.
- **XSS prevention**: Occurrence count is rendered as a number, not user-supplied HTML. Content prefixed with "Latest:" is text content, not dangerouslySetInnerHTML.
- **Ownership check**: The `getGroupOccurrences` endpoint (section-02) enforces ownership. The frontend does not need additional authorization logic.

---

## Verification Steps

1. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run useSSEReconnect`
2. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run GlobalAlerts.notificationBell`
3. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run Notifications.groupExpansion`
4. TypeScript check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
5. Manual verification (after sections 01 and 02 are deployed):
   - Trigger a notification with `groupKey` that deduplicates (e.g., multiple media job failures)
   - Observe the `x5` badge in the bell dropdown
   - Navigate to `/notifications`, observe badge in list
   - Click "Expand group" and verify sub-items render
   - Kill SSE connection (e.g., disconnect network briefly) and verify reconnection occurs with increasing delay in browser dev tools Network tab