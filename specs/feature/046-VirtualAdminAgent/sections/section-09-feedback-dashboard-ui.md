Now I have all the context. Let me produce the section content.

# Section 09 -- Feedback Dashboard UI

## Overview

This section implements the **frontend UI** for the feedback system: the `AdminFeedbackHub` page for administrators to manage tickets, a `FeedbackButton` with submit modal for end users, a `TicketDetailView` component for viewing individual tickets with activity timelines, and a `FeedbackStatsWidget` for aggregate metrics.

All data is consumed from the tRPC `feedback` router endpoints built in section-07 (the backend). This section creates no backend code -- it is purely a React frontend implementation.

**Depends on:** section-07-feedback-backend (provides the `feedback.*` tRPC procedures: `submit`, `myTickets`, `getTicket`, `adminList`, `adminUpdate`, `adminRespond`, `adminMergeDuplicate`, `adminResolve`, `stats`).

**Parallelizable with:** section-08-guardian-dashboard-ui (independent UI page, no shared components).

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/pages/AdminFeedbackHub.tsx` | Admin feedback management page with ticket list, filters, and detail view |
| `apps/web/client/src/components/feedback/FeedbackButton.tsx` | Floating button (bottom-right) visible to all authenticated users |
| `apps/web/client/src/components/feedback/FeedbackSubmitModal.tsx` | Modal dialog for submitting new feedback tickets |
| `apps/web/client/src/components/feedback/TicketDetailView.tsx` | Ticket detail panel with comments, activity timeline, and admin actions |
| `apps/web/client/src/components/feedback/FeedbackStatsWidget.tsx` | Stats card showing ticket counts by type/status, response time, resolution rate |
| `apps/web/client/src/components/feedback/__tests__/FeedbackButton.test.tsx` | Tests for the floating button and submit modal |
| `apps/web/client/src/components/feedback/__tests__/AdminFeedbackHub.test.tsx` | Tests for the admin feedback hub page |
| `apps/web/client/src/components/feedback/__tests__/TicketDetailView.test.tsx` | Tests for the ticket detail view |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Add lazy import for `AdminFeedbackHub`, add route `<Route path="/admin/feedback">` wrapped in `<RequireAdmin>` |
| `apps/web/client/src/App.tsx` | Import `FeedbackButton` and render it inside the authenticated app layout (after `<GlobalAlerts />` or similar global position) |

---

## Tests (Write First)

### FeedbackButton.test.tsx

File: `apps/web/client/src/components/feedback/__tests__/FeedbackButton.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock tRPC
vi.mock("@/lib/trpc", () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: vi.fn(() => ({
          mutateAsync: vi.fn().mockResolvedValue({ ticketId: 1 }),
          isPending: false,
        })),
      },
    },
  },
}));

// Mock auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, role: "user", tenantId: "t1" },
  })),
}));

describe("FeedbackButton", () => {
  it("renders floating button for authenticated users");
  it("does not render when user is not authenticated");
  it("opens FeedbackSubmitModal on click");
  it("closes modal on cancel");
  it("submits ticket with title, description, and type");
  it("shows success toast after submission");
  it("disables submit button while mutation is pending");
  it("validates required fields (title min 3 chars, description min 10 chars)");
  it("auto-captures current URL in contextJson");
});
```

### AdminFeedbackHub.test.tsx

File: `apps/web/client/src/components/feedback/__tests__/AdminFeedbackHub.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    feedback: {
      adminList: { useQuery: vi.fn() },
      stats: { useQuery: vi.fn() },
      adminUpdate: { useMutation: vi.fn() },
      adminRespond: { useMutation: vi.fn() },
      adminResolve: { useMutation: vi.fn() },
      adminMergeDuplicate: { useMutation: vi.fn() },
    },
    useUtils: vi.fn(() => ({
      feedback: { adminList: { invalidate: vi.fn() } },
    })),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, role: "admin", tenantId: "t1" },
  })),
}));

describe("AdminFeedbackHub", () => {
  // List view
  it("renders ticket list table with columns: ID, type, title, priority, status, submitter, date");
  it("renders filter controls for type, status, priority");
  it("applies filters and refetches ticket list");
  it("shows loading spinner while fetching");
  it("shows empty state when no tickets exist");
  it("paginates with cursor-based navigation");

  // Ticket selection
  it("opens TicketDetailView when a ticket row is clicked");
  it("closes detail view when back button is clicked");

  // Stats widget
  it("renders FeedbackStatsWidget with aggregate counts");
  it("displays average response time and resolution rate");

  // Admin actions from list (bulk)
  it("shows priority badge with correct color per priority level");
  it("shows status badge with correct color per status");
  it("shows ticket type icon (bug, feature, question, observation)");
});
```

### TicketDetailView.test.tsx

File: `apps/web/client/src/components/feedback/__tests__/TicketDetailView.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    feedback: {
      getTicket: { useQuery: vi.fn() },
      adminRespond: { useMutation: vi.fn() },
      adminUpdate: { useMutation: vi.fn() },
      adminResolve: { useMutation: vi.fn() },
      adminMergeDuplicate: { useMutation: vi.fn() },
    },
    useUtils: vi.fn(() => ({
      feedback: { getTicket: { invalidate: vi.fn() } },
    })),
  },
}));

describe("TicketDetailView", () => {
  // Display
  it("renders ticket title, description, type, priority, and status");
  it("renders submitter info and creation timestamp");
  it("renders AI auto-summary when available");
  it("renders linked incident ID when relatedIncidentId is set");
  it("renders duplicate link when duplicateOf is set");

  // Comments / activity timeline
  it("renders comment list ordered by createdAt ascending");
  it("distinguishes public comments from internal notes visually");
  it("shows system_guardian auto-response comments with bot icon");

  // Admin actions
  it("reply form submits public comment via adminRespond mutation");
  it("internal note toggle sends isInternal=true");
  it("plan action opens planning fields (version, doc URL, branch)");
  it("resolve action opens resolution dialog with type selector");
  it("merge action opens duplicate search and calls adminMergeDuplicate");
  it("priority dropdown calls adminUpdate to change priority");
  it("status dropdown calls adminUpdate to change status");
  it("assignee dropdown calls adminUpdate to change assignedTo");
});
```

---

## Implementation Details

### 1. Route Registration in App.tsx

File: `apps/web/client/src/App.tsx`

Add two changes:

**Lazy import** (near the other `Admin*` lazy imports around line 43-109):
```typescript
const AdminFeedbackHub = lazy(() => import("./pages/AdminFeedbackHub"));
```

**Route** (inside the `<Switch>` block, near the other `/admin/*` routes around line 178-250):
```typescript
<Route path="/admin/feedback">
  <RequireAdmin><AdminFeedbackHub /></RequireAdmin>
</Route>
```

**FeedbackButton** -- Import and render the floating feedback button inside the main app layout so it appears on all authenticated pages. Place it after the `<GlobalAlerts />` component or at the end of the `Router` component, outside the `<Switch>`:
```typescript
import FeedbackButton from "@/components/feedback/FeedbackButton";
// ... inside Router(), after </Switch>:
<FeedbackButton />
```

The `FeedbackButton` component itself handles auth-gating (renders nothing when not authenticated).

### 2. AdminFeedbackHub Page

File: `apps/web/client/src/pages/AdminFeedbackHub.tsx`

This is the main admin page for managing feedback tickets. Follow the existing admin page patterns (see `AdminApprovals.tsx` and `AdminAuditLogs.tsx` for structure, imports, and styling conventions).

**Layout structure:**
- Page header with title "Feedback Hub" and an icon (e.g., `MessageSquare` from lucide-react)
- `FeedbackStatsWidget` rendered at the top as a row of stat cards
- Filter bar below stats: dropdowns for ticket type, status, priority, and a search input for title text search
- Main content area: either the ticket list table OR the `TicketDetailView` (toggled by state)

**State management:**
- `selectedTicketId: number | null` -- when set, show `TicketDetailView`; when null, show list
- Filter state: `type`, `status`, `priority` as controlled selects
- Pagination: cursor-based using the tRPC `adminList` response

**Data fetching:**
- `trpc.feedback.adminList.useQuery({ type, status, priority, cursor, limit: 20 })` for the ticket list
- `trpc.feedback.stats.useQuery()` for the stats widget
- Both queries should have `refetchInterval: 30_000` (30 seconds) for near-real-time updates

**Ticket list table columns:**
| Column | Content | Width |
|--------|---------|-------|
| ID | `#ticket.id` | narrow |
| Type | Badge with icon (Bug, Lightbulb, Eye, HelpCircle) | narrow |
| Title | Ticket title (truncated to ~60 chars) | wide |
| Priority | Colored badge (critical=red, high=orange, normal=blue, low=gray) | narrow |
| Status | Colored badge (new=blue, triaged=yellow, in_progress=purple, resolved=green, duplicate=gray, closed=gray) | narrow |
| Submitter | Username or "System Guardian" / "Virtual Agent" based on `submittedByType` | medium |
| Created | Relative time (e.g., "2h ago") using a date formatting utility | narrow |

**Clicking a row** sets `selectedTicketId` and transitions to the detail view. A back button in the detail view resets `selectedTicketId` to null.

**UI components to use** (from the existing project UI library):
- `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@/components/ui/table`
- `Badge` from `@/components/ui/badge`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Button` from `@/components/ui/button`
- `Input` from `@/components/ui/input`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`
- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`
- Lucide icons: `Bug`, `Lightbulb`, `Eye`, `HelpCircle`, `MessageSquare`, `ArrowLeft`, `Loader2`, `Filter`, `Search`, `CheckCircle`, `Clock`

### 3. FeedbackButton Component

File: `apps/web/client/src/components/feedback/FeedbackButton.tsx`

A floating action button positioned at the bottom-right of the viewport. Visible to all authenticated users (check via `useAuth()`).

**Behavior:**
- Renders as a round button with a `MessageSquarePlus` icon (lucide-react)
- Fixed position: `fixed bottom-6 right-6 z-50`
- On click: opens the `FeedbackSubmitModal`
- Uses `useState` for modal open/close
- Returns `null` when `user` is null (not authenticated)

**Styling:** Use Tailwind classes. The button should have a shadow, a brand-colored background (e.g., `bg-primary`), and a hover effect. Consider adding a small tooltip "Send Feedback" on hover using the existing `Tooltip` component.

### 4. FeedbackSubmitModal Component

File: `apps/web/client/src/components/feedback/FeedbackSubmitModal.tsx`

A dialog modal for submitting new feedback tickets.

**Props:**
```typescript
interface FeedbackSubmitModalProps {
  open: boolean;
  onClose: () => void;
}
```

**Form fields:**
- **Ticket Type** -- Select with options: Bug Report, Feature Request, Observation, Question. Maps to `ticketType` enum values.
- **Title** -- Text input, required, min 3 chars, max 255 chars.
- **Description** -- Textarea, required, min 10 chars, max 5000 chars.
- **Steps to Reproduce** -- Textarea, optional, shown only when type is "bug". Max 2000 chars.
- **Expected Behavior** -- Textarea, optional, shown only when type is "bug". Max 2000 chars.
- **Actual Behavior** -- Textarea, optional, shown only when type is "bug". Max 2000 chars.

**Form management:** Use React Hook Form with Zod resolver for validation. The Zod schema should match the server-side input schema from section-07.

**On submit:**
- Call `trpc.feedback.submit.useMutation()`
- Auto-include `contextJson: { pageUrl: window.location.href, userAgent: navigator.userAgent }`
- On success: show Sonner toast "Feedback submitted! We'll review it shortly.", close modal, reset form
- On error: show Sonner toast with error message

**UI:** Use `Dialog` / `DialogContent` from the UI library. Footer has Cancel and Submit buttons. Submit button shows `Loader2` spinner while pending.

### 5. TicketDetailView Component

File: `apps/web/client/src/components/feedback/TicketDetailView.tsx`

Displays a single ticket's full details with an activity timeline and admin action controls.

**Props:**
```typescript
interface TicketDetailViewProps {
  ticketId: number;
  onBack: () => void;
}
```

**Data fetching:** `trpc.feedback.getTicket.useQuery({ ticketId })` -- returns ticket with comments and attachments.

**Layout (top to bottom):**

1. **Header bar** -- Back button (ArrowLeft icon + "Back to list"), ticket ID badge, priority dropdown, status dropdown, assignee dropdown. All dropdowns call `trpc.feedback.adminUpdate.useMutation()` on change.

2. **Ticket info card** -- Title (h2), type badge, submitter info (name + type badge for human/virtual_agent/system_guardian), creation date, auto-summary (if available, shown in a highlighted callout box).

3. **Related items** -- Conditional section:
   - If `relatedIncidentId` is set: show a link "Linked to Incident #{id}" with a link to the guardian dashboard
   - If `duplicateOf` is set: show "Duplicate of Ticket #{id}" with a link to that ticket

4. **Detail fields** -- For bug tickets: show Steps to Reproduce, Expected Behavior, Actual Behavior in separate collapsible sections. For other types: show only the description.

5. **Planning section** (admin-only, collapsible) -- Editable fields: Planned Version, Planning Doc URL, Dev Branch. Each field auto-saves on blur via `adminUpdate` mutation.

6. **Activity timeline** -- Chronological list of comments. Each comment shows:
   - Author name and avatar/icon (use `Bot` icon for system_guardian, user avatar for humans)
   - Timestamp (relative)
   - Content (markdown or plain text)
   - Internal note indicator (yellow background + "Internal" badge for `isInternal: true` comments)

7. **Reply form** -- At the bottom of the timeline. A textarea with two buttons:
   - "Reply" (public) -- calls `adminRespond({ ticketId, content, isInternal: false })`
   - "Internal Note" -- calls `adminRespond({ ticketId, content, isInternal: true })`
   - Both invalidate the `getTicket` query on success

8. **Action buttons row** -- Below the reply form:
   - "Resolve" -- opens a dialog with resolution type selector (`fixed`, `wont_fix`, `duplicate`, `cannot_reproduce`, `planned`, `by_design`) and optional resolution notes textarea. Calls `adminResolve`.
   - "Merge as Duplicate" -- opens a dialog with a ticket ID input field. Calls `adminMergeDuplicate({ ticketId, duplicateOfId })`.
   - "Plan for Development" -- scrolls to / expands the planning section

### 6. FeedbackStatsWidget Component

File: `apps/web/client/src/components/feedback/FeedbackStatsWidget.tsx`

A row of stat cards displayed at the top of the AdminFeedbackHub page.

**Data source:** `trpc.feedback.stats.useQuery()`

**Cards (displayed as a horizontal grid, 4-5 columns):**

| Card | Value | Description |
|------|-------|-------------|
| Total Open | Count of tickets with status in [new, triaged, in_progress] | Blue accent |
| Bugs | Count of tickets with type = bug | Red accent |
| Feature Requests | Count of tickets with type = feature_request | Purple accent |
| Avg Response Time | Average hours from `createdAt` to `respondedAt` | Green accent |
| Resolution Rate | `(resolved count / total last 30 days) * 100` as percentage | Amber accent |

Each card uses the `Card` component with a stat number prominently displayed and a small label below. Use `Loader2` skeleton while loading.

### 7. Priority and Status Badge Helpers

Create shared badge rendering helpers used across multiple components:

```typescript
// Within the feedback components or a shared util
const PRIORITY_COLORS = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-700",
  triaged: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-purple-100 text-purple-700",
  deferred: "bg-gray-100 text-gray-600",
  resolved: "bg-green-100 text-green-700",
  duplicate: "bg-gray-100 text-gray-500",
  closed: "bg-gray-100 text-gray-400",
};

const TYPE_ICONS = {
  bug: Bug,           // lucide-react
  feature_request: Lightbulb,
  observation: Eye,
  question: HelpCircle,
};
```

These are used in both the `AdminFeedbackHub` table and the `TicketDetailView` header.

### 8. TanStack Query Invalidation

When admin mutations succeed (respond, update, resolve, merge), invalidate the relevant queries to keep the UI fresh:

- After `adminRespond` succeeds: invalidate `feedback.getTicket` for the current ticket
- After `adminUpdate` succeeds: invalidate `feedback.adminList` and `feedback.getTicket`
- After `adminResolve` succeeds: invalidate `feedback.adminList`, `feedback.getTicket`, and `feedback.stats`
- After `adminMergeDuplicate` succeeds: invalidate `feedback.adminList` and `feedback.getTicket`

Use `trpc.useUtils()` to access the invalidation functions, following the pattern used in `AdminApprovals.tsx`.

### 9. User-Facing Ticket List (Optional Enhancement)

While the primary scope is the admin hub, the `FeedbackButton` component could optionally include a "My Tickets" link that navigates to a simple user-facing list. This would use `trpc.feedback.myTickets.useQuery()`. For the initial implementation, this can be a simple list within a dialog or a separate lightweight page. The key requirement is that users can see their own ticket history and any responses from admins.

If implemented as a dialog (simpler approach): add a "View My Tickets" tab in the `FeedbackSubmitModal` that lists the user's tickets with status indicators.

---

## Dependency Summary

- **section-07-feedback-backend** must be complete: the `feedback` tRPC router must be registered and all procedures (`submit`, `myTickets`, `getTicket`, `adminList`, `adminUpdate`, `adminRespond`, `adminMergeDuplicate`, `adminResolve`, `stats`) must be functional
- **section-01-schema-system-user** must be complete: database tables and enums must exist
- Uses existing UI component library from `@/components/ui/*` (Card, Table, Badge, Button, Dialog, Select, Input, Textarea, Tabs, Tooltip)
- Uses existing `useAuth()` from `@/contexts/AuthContext` for authentication state
- Uses existing `trpc` client from `@/lib/trpc` for data fetching
- Uses `wouter` for routing (`useLocation`)
- Uses `sonner` for toast notifications
- Uses `react-hook-form` + `@hookform/resolvers/zod` for form validation
- Uses `lucide-react` for icons
- No new npm dependencies are required