I have enough context now. Let me generate the section content.

# Section 08 -- Guardian Dashboard UI

## Overview

This section covers the **AdminSystemGuardian** page and all its child components: incident timeline, sensor status grid, approval action cards, guardian settings panel, and dashboard stats. It is a frontend-only section that consumes the tRPC endpoints created in earlier sections and the SSE stream from section-05.

**Dependencies (must be completed first):**
- Section 01 (schema and shared types in `apps/web/shared/virtualAdmin/types.ts`)
- Section 04 (actuators and approval tRPC endpoints in `apps/web/server/routers/virtualAdmin.ts`)
- Section 05 (SSE streaming endpoint at `GET /api/virtual-admin/events` and `SystemHealthBanner` component)

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/pages/AdminSystemGuardian.tsx` | Main guardian dashboard page |
| `apps/web/client/src/components/guardian/IncidentTimeline.tsx` | Scrollable incident list with status indicators |
| `apps/web/client/src/components/guardian/SensorStatusGrid.tsx` | Grid of sensor health cards |
| `apps/web/client/src/components/guardian/ApprovalActionCard.tsx` | Pending approval with approve/reject buttons |
| `apps/web/client/src/components/guardian/GuardianSettingsPanel.tsx` | Per-tenant guardian configuration panel |
| `apps/web/client/src/components/guardian/GuardianChat.tsx` | Inline chat interface with System Guardian |
| `apps/web/client/src/hooks/useGuardianEvents.ts` | SSE hook that invalidates TanStack Query caches |
| `apps/web/client/src/components/guardian/__tests__/SensorStatusGrid.test.tsx` | Tests for sensor grid |
| `apps/web/client/src/components/guardian/__tests__/IncidentTimeline.test.tsx` | Tests for incident timeline |
| `apps/web/client/src/components/guardian/__tests__/ApprovalActionCard.test.tsx` | Tests for approval cards |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Add `<Route path="/admin/guardian">` pointing to `AdminSystemGuardian` |

---

## Tests (Write First)

All test files live under `apps/web/client/src/components/guardian/__tests__/`. They use Vitest with `@testing-library/react`. The tRPC client should be mocked per the existing pattern in the codebase (mock `trpc` import).

### SensorStatusGrid.test.tsx

```typescript
// apps/web/client/src/components/guardian/__tests__/SensorStatusGrid.test.tsx
import { describe, it, expect } from "vitest";

describe("SensorStatusGrid", () => {
  it("renders all sensors with health indicators");
  it("shows green for healthy, yellow for degraded, red for critical");
  it("shows gray/unknown for sensors with status 'unknown'");
  it("displays sensor name, last check time, and summary message");
  it("updates on SSE event (query invalidation triggers re-render)");
  it("renders loading skeleton while data is fetching");
});
```

**Test approach:** Mock `trpc.virtualAdmin.getSensorStatuses.useQuery` to return an array of `SensorReading` objects with varying statuses. Assert that the correct color indicators and text appear. For the SSE update test, verify the component re-renders when query data changes (no need to test the SSE transport itself -- that belongs to section 05).

### IncidentTimeline.test.tsx

```typescript
// apps/web/client/src/components/guardian/__tests__/IncidentTimeline.test.tsx
import { describe, it, expect } from "vitest";

describe("IncidentTimeline", () => {
  it("renders incidents sorted by createdAt descending (newest first)");
  it("displays severity badge with correct color per severity level");
  it("shows incident title, sensor ID, and timestamp");
  it("shows 'resolved' indicator for resolved incidents");
  it("links to incident detail or expands inline on click");
  it("renders empty state when no incidents exist");
  it("supports pagination or infinite scroll for large lists");
});
```

**Test approach:** Mock `trpc.virtualAdmin.listIncidents.useQuery` with fixture data containing incidents of various severities and statuses. Assert badge colors: info=blue, warning=yellow, error=orange, critical=red. Assert sort order by checking DOM element ordering.

### ApprovalActionCard.test.tsx

```typescript
// apps/web/client/src/components/guardian/__tests__/ApprovalActionCard.test.tsx
import { describe, it, expect } from "vitest";

describe("ApprovalActionCard", () => {
  it("renders pending approval with incident context and action type");
  it("shows expiresAt countdown for pending approvals");
  it("approve button calls decideApproval mutation with status 'approved'");
  it("reject button opens comment dialog before calling mutation");
  it("reject dialog requires non-empty comment before submit");
  it("disabled state when approval is already decided (approved/rejected/expired)");
  it("shows decision result after approve/reject (success toast or error)");
  it("shows 'expired' badge when approval TTL has passed");
});
```

**Test approach:** Mock `trpc.virtualAdmin.decideApproval.useMutation`. Render with a pending approval fixture. Simulate button clicks via `fireEvent.click`. For the reject flow, verify the dialog appears, fill in the comment textarea, submit, and assert the mutation was called with `{ id, status: "rejected", comment }`.

---

## Implementation Details

### Technology and UI Conventions

All components follow existing project patterns:
- **Routing**: Wouter -- `<Route path="/admin/guardian">` in `App.tsx`
- **Data fetching**: `trpc.virtualAdmin.*` hooks via TanStack Query
- **UI primitives**: Radix UI components from `@/components/ui/*` (Card, Badge, Button, Tabs, Dialog, Table, Progress)
- **Icons**: `lucide-react` (Shield, Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Settings, RefreshCw)
- **Styling**: TailwindCSS 4 utility classes
- **Toasts**: `sonner` via `toast.success()` / `toast.error()`
- **Auth**: `useAuth()` from `@/_core/hooks/useAuth` -- check `user.role === "admin"` or `"domain_admin"`

### useGuardianEvents Hook

**File**: `apps/web/client/src/hooks/useGuardianEvents.ts`

This hook connects to the SSE endpoint created in section 05 (`GET /api/virtual-admin/events`) and invalidates relevant TanStack Query caches when events arrive.

```typescript
/**
 * useGuardianEvents - SSE hook for real-time guardian updates.
 *
 * Connects to /api/virtual-admin/events. On each event:
 * - "incident" → invalidate virtualAdmin.listIncidents
 * - "approval" → invalidate virtualAdmin.listApprovals
 * - "sensor"   → invalidate virtualAdmin.getSensorStatuses
 * - "feedback"  → invalidate feedback.adminList
 *
 * Returns { connected: boolean } for UI status indicator.
 * Auto-reconnects on disconnect with exponential backoff.
 * Cleans up EventSource on unmount.
 */
```

Implementation uses the browser `EventSource` API. Parse `event.data` as JSON, read the `type` field, and call `trpc.useUtils().virtualAdmin.listIncidents.invalidate()` (etc.) accordingly. The hook should only activate when the user is an admin.

### AdminSystemGuardian Page

**File**: `apps/web/client/src/pages/AdminSystemGuardian.tsx`

Layout follows the same pattern as `AdminQueueDashboard.tsx` and `AdminSystemHealth.tsx`:
- Auth guard at top (redirect if not admin)
- Header with title "System Guardian", refresh button, and SSE connection indicator
- Tab-based layout with four tabs: **Dashboard**, **Incidents**, **Approvals**, **Settings**

**Dashboard tab** (default):
- Top row: 4 stat cards (total incidents today, open incidents, pending approvals, sensor health %)
- Use `trpc.virtualAdmin.getDashboardStats.useQuery()` for aggregate numbers
- Middle: `SensorStatusGrid` component
- Bottom: Recent incidents (last 10) via `IncidentTimeline` with `limit: 10`

**Incidents tab:**
- Full `IncidentTimeline` component with pagination
- Filter controls: severity dropdown, status dropdown, date range
- Uses `trpc.virtualAdmin.listIncidents.useQuery({ severity, status, limit, offset })`

**Approvals tab:**
- List of `ApprovalActionCard` components
- Filter: pending / decided / expired tabs
- Uses `trpc.virtualAdmin.listApprovals.useQuery({ status })`

**Settings tab:**
- `GuardianSettingsPanel` component

The page calls `useGuardianEvents()` at the top level so all child components benefit from real-time cache invalidation.

**Auto-refresh**: In addition to SSE-driven invalidation, queries use `refetchInterval: 30000` (30s) as a fallback in case SSE disconnects.

### SensorStatusGrid Component

**File**: `apps/web/client/src/components/guardian/SensorStatusGrid.tsx`

Displays a responsive CSS grid of sensor health cards (3 columns on desktop, 2 on tablet, 1 on mobile).

Each sensor card contains:
- Status dot: green (`healthy`), yellow (`degraded`), red (`critical`), gray (`unknown`)
- Sensor name (human-readable, e.g., "Queue Health", "Celery Workers")
- Status text as a Badge component
- Key metric value (e.g., "Queue depth: 42", "Balance: 85 credits")
- Last check timestamp in relative format ("2 min ago")

Data source: `trpc.virtualAdmin.getSensorStatuses.useQuery()` returns `SensorReading[]`.

Color mapping:
```
healthy  → bg-green-500 / text-green-700 / border-green-200
degraded → bg-yellow-500 / text-yellow-700 / border-yellow-200
critical → bg-red-500 / text-red-700 / border-red-200
unknown  → bg-gray-400 / text-gray-600 / border-gray-200
```

### IncidentTimeline Component

**File**: `apps/web/client/src/components/guardian/IncidentTimeline.tsx`

Props:
```typescript
interface IncidentTimelineProps {
  limit?: number;       // max items to show (default: 50)
  severity?: string;    // filter by severity
  status?: string;      // filter by status
  showFilters?: boolean; // show filter controls (default: false)
}
```

Renders a vertical timeline using Tailwind. Each incident row shows:
- Severity indicator (colored left border or dot)
- Title and message preview
- Sensor ID badge and rule ID
- Status badge (open / acknowledged / resolved / expired)
- Timestamp and relative time
- Action taken (if any) in small muted text
- Expand/collapse for full metrics JSON

Uses `trpc.virtualAdmin.listIncidents.useQuery({ severity, status, limit, offset })`. Supports cursor-based or offset pagination with a "Load more" button at the bottom.

### ApprovalActionCard Component

**File**: `apps/web/client/src/components/guardian/ApprovalActionCard.tsx`

Props:
```typescript
interface ApprovalActionCardProps {
  approval: {
    id: number;
    incidentId: number;
    actionType: string;
    actionParamsJson: Record<string, unknown>;
    status: "pending" | "approved" | "rejected" | "expired" | "execution_failed";
    requestedAt: string;
    expiresAt: string;
    decidedBy?: number;
    decisionComment?: string;
  };
}
```

Card layout:
- Header: action type as human-readable label (e.g., "Pause Queue", "Restart Celery Worker")
- Body: incident context summary, action parameters, risk level indicator
- Countdown timer showing time until expiration (updates every second via `setInterval`)
- Footer buttons: "Approve" (green) and "Reject" (red outline) -- only visible when `status === "pending"`
- For decided approvals: show decision, decider name, and comment (read-only)

**Reject flow**: Clicking "Reject" opens a Radix `Dialog` with a `Textarea` for the admin to provide a reason. The "Confirm Reject" button is disabled until the textarea is non-empty. On submit, calls `trpc.virtualAdmin.decideApproval.useMutation()` with `{ id, status: "rejected", comment }`.

**Approve flow**: Clicking "Approve" directly calls the mutation with `{ id, status: "approved" }`. Show a loading spinner on the button during mutation. On success, show `toast.success("Action approved and executing...")`. On error (e.g., CONFLICT if another admin already decided), show `toast.error(...)`.

**Concurrent protection**: If the mutation returns a CONFLICT error (HTTP 409 or tRPC error code), display a message: "Another admin has already made a decision on this approval." and invalidate the approvals query to refresh.

### GuardianSettingsPanel Component

**File**: `apps/web/client/src/components/guardian/GuardianSettingsPanel.tsx`

Allows admins to configure per-tenant guardian settings. Uses existing `system_settings` table via a dedicated tRPC endpoint.

Settings displayed:
- **Notifications enabled** (toggle) -- `VIRTUAL_ADMIN_NOTIFICATIONS`
- **Auto-fix enabled** (toggle with warning) -- `VIRTUAL_ADMIN_AUTO_FIX`
- **LLM analysis enabled** (toggle) -- `VIRTUAL_ADMIN_LLM_ANALYSIS`
- **Credit soft limit** (number input) -- `VIRTUAL_ADMIN_CREDIT_SOFT_LIMIT`
- **Credit hard limit** (number input) -- `VIRTUAL_ADMIN_CREDIT_HARD_LIMIT`
- **Sensor configuration overrides** -- table of sensors with enabled toggle and interval input

Data source: `trpc.virtualAdmin.getSettings.useQuery()` and `trpc.virtualAdmin.updateSettings.useMutation()`.

Validation: credit hard limit must be less than soft limit. Interval must be >= 10000ms (10 seconds minimum).

### GuardianChat Component

**File**: `apps/web/client/src/components/guardian/GuardianChat.tsx`

A lightweight inline chat panel that reuses the existing chat infrastructure. This component is embedded in the Guardian dashboard (not a separate page).

Behavior:
- On mount, call `trpc.virtualAdmin.getOrCreateGuardianConversation.useQuery()` to get the conversation ID
- Display message history from the conversation
- Input bar at the bottom for sending messages
- Messages sent via `trpc.chat.sendMessage.useMutation()` with the guardian conversation ID
- Guardian responses arrive via the conversation system (polled or SSE)

This component provides quick access to the chat commands documented in section 06 (status, incidents, retry, approve, etc.) without leaving the dashboard.

### Route Registration

**File to modify**: `apps/web/client/src/App.tsx`

Add a new route in the admin section (near the other admin routes around line 230-260):

```typescript
<Route path="/admin/guardian">
  <AdminSystemGuardian />
</Route>
```

Import at the top of the file using lazy loading if the project uses it, or direct import matching the existing pattern.

### Shared Types Used

The following types from `apps/web/shared/virtualAdmin/types.ts` (created in section 01) are consumed by this section's components:

- `SensorReading` -- used by `SensorStatusGrid`
- `Incident` (from `virtual_admin_incidents` table shape) -- used by `IncidentTimeline`
- `Approval` (from `virtual_admin_approvals` table shape) -- used by `ApprovalActionCard`
- `IncidentSeverity`, `IncidentStatus`, `ApprovalStatus` -- enum types for filter dropdowns and badge rendering

### tRPC Endpoints Consumed

These endpoints are defined in section 04 (`apps/web/server/routers/virtualAdmin.ts`). This section only consumes them from the frontend:

| Endpoint | Used By |
|----------|---------|
| `virtualAdmin.getDashboardStats` | AdminSystemGuardian (dashboard tab stat cards) |
| `virtualAdmin.getSensorStatuses` | SensorStatusGrid |
| `virtualAdmin.listIncidents` | IncidentTimeline |
| `virtualAdmin.listApprovals` | AdminSystemGuardian (approvals tab) |
| `virtualAdmin.decideApproval` | ApprovalActionCard |
| `virtualAdmin.getSettings` | GuardianSettingsPanel |
| `virtualAdmin.updateSettings` | GuardianSettingsPanel |
| `virtualAdmin.getOrCreateGuardianConversation` | GuardianChat |

---

## Implementation Checklist

1. Create test files for `SensorStatusGrid`, `IncidentTimeline`, and `ApprovalActionCard` with the stubs above
2. Create `useGuardianEvents` hook (SSE connection + query invalidation)
3. Create `SensorStatusGrid` component
4. Create `IncidentTimeline` component
5. Create `ApprovalActionCard` component
6. Create `GuardianSettingsPanel` component
7. Create `GuardianChat` component (inline chat panel)
8. Create `AdminSystemGuardian` page (assembles all components with tab layout)
9. Add route in `App.tsx`
10. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run client/src/components/guardian/`
11. Run typecheck: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`