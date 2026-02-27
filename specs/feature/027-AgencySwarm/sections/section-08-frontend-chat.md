Now I have all the context needed. Let me produce the section content.

# Section 08 -- Frontend Chat: AgencyChat Page, AgencyBrowser Page, Hooks, Menu, and Routing

## Implementation Status: COMPLETE

### Files Created/Modified
- `apps/web/client/src/hooks/useAgencyStream.ts` (CREATED)
- `apps/web/client/src/hooks/useAgencyQuery.ts` (CREATED)
- `apps/web/client/src/components/agency/AgencyActivityPanel.tsx` (CREATED)
- `apps/web/client/src/pages/AgencyChat.tsx` (CREATED)
- `apps/web/client/src/pages/AgencyBrowser.tsx` (CREATED)
- `apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts` (CREATED, 6 tests)
- `apps/web/client/src/pages/__tests__/AgencyChat.test.tsx` (CREATED, 6 tests)
- `apps/web/client/src/App.tsx` (MODIFIED - lazy imports + routes)
- `packages/shared/src/constants/menu.ts` (MODIFIED - agencies menu item)

### Deviations from Plan
1. **Feature flag gating**: Instead of a separate tRPC `getFeatureFlags` query, relies on server-side enforcement — `agency.list` and `agency.getById` throw `NOT_FOUND` when flag is disabled. Frontend redirects to `/dashboard` on tRPC error.
2. **ScrollArea replaced with plain div**: The `ScrollArea` component doesn't forward refs to the viewport, so auto-scroll was broken. Replaced with a simple `div` with `overflow-y-auto`.
3. **useAgencyStream ref pattern for callbacks**: Options callbacks (`onRunFinished`, `onError`) stored in refs to avoid stale closures in the async stream processing loop.
4. **Run counter for message IDs**: Stream message IDs include a run counter (`stream-{runId}-{agent}`) to prevent React key collisions when the same agent responds multiple times.
5. **Agent switch resets streaming buffer**: `streamingMsgRef` is reset on `agent_switch` events to prevent content from previous agent bleeding into next agent's message.
6. **Token content captured in local variable**: `streamingMsgRef.current` captured into `currentContent` before passing to `setMessages` to prevent stale reads after `run_finished` resets the ref.
7. **Cleanup on unmount**: Added `useEffect` cleanup that calls `disconnect()` to abort pending fetch streams.
8. **`useMenuItems.ts` not modified**: Icon mapping was not needed; existing menu system handles it.

### Test Results
- 12/12 tests passing (6 hook + 6 component)

## Overview

This section implements the frontend React layer for agency chat interactions. It covers:

1. **AgencyChat page** -- split-view layout with main conversation thread and collapsible agent activity panel
2. **AgencyBrowser page** -- list/gallery view for browsing and selecting agencies
3. **useAgencyStream hook** -- SSE consumption via `fetch()` + `ReadableStream` (POST-based, not EventSource)
4. **useAgencyQuery hook** -- tRPC query hooks wrapping the agency router
5. **Menu integration** -- adding the "Agencies" menu item gated by `AGENCY_SWARM_ENABLED` feature flag
6. **Routing** -- lazy-loaded routes at `/agencies`, `/agencies/:id`, `/agencies/:id/edit`, `/agencies/templates`

## Dependencies

- **Section 07 (SSE Streaming):** The SSE stream proxy at `POST /api/v1/agency/stream` must be implemented. This section's `useAgencyStream` hook consumes that endpoint.
- **Section 06 (Node.js Integration):** The tRPC `agencyRouter` must be registered and available. This section's `useAgencyQuery` hook calls those procedures.

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/web/client/src/pages/AgencyChat.tsx` | Create | Split-view chat page |
| `apps/web/client/src/pages/AgencyBrowser.tsx` | Create | Agency list/gallery page |
| `apps/web/client/src/components/agency/AgencyActivityPanel.tsx` | Create | Collapsible right panel showing agent-to-agent activity |
| `apps/web/client/src/hooks/useAgencyStream.ts` | Create | SSE stream consumption hook |
| `apps/web/client/src/hooks/useAgencyQuery.ts` | Create | tRPC query convenience hooks |
| `apps/web/client/src/App.tsx` | Modify | Add lazy imports and Route entries |
| `packages/shared/src/constants/menu.ts` | Modify | Add agencies menu item |
| `apps/web/client/src/hooks/useMenuItems.ts` | Modify | Add icon mapping if needed |
| `apps/web/client/src/pages/__tests__/AgencyChat.test.tsx` | Create | Component tests |
| `apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts` | Create | Hook tests |

---

## Tests (Write First)

### AgencyChat Component Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/AgencyChat.test.tsx`

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock tRPC
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      getById: { useQuery: (...args: any[]) => mockUseQuery(...args) },
      listConversations: { useQuery: (...args: any[]) => mockUseQuery(...args) },
      createConversation: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      sendMessage: { useMutation: (...args: any[]) => mockUseMutation(...args) },
    },
    useUtils: () => ({ agency: { listConversations: { invalidate: vi.fn() } } }),
  },
}));

// Mock useAgencyStream
const mockStreamConnect = vi.fn();
vi.mock("@/hooks/useAgencyStream", () => ({
  useAgencyStream: () => ({
    messages: [],
    activeAgent: null,
    isStreaming: false,
    error: null,
    creditsUsed: 0,
    activityEvents: [],
    connect: mockStreamConnect,
    disconnect: vi.fn(),
  }),
}));

// Mock wouter
vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "agency-1" }],
  useLocation: () => ["/agencies/agency-1", vi.fn()],
}));

describe("AgencyChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders main conversation thread with user and agent messages", async () => {
    // Provide mock messages from the stream hook, render AgencyChat,
    // assert that both user-sent and agent-response message bubbles appear.
  });

  it("renders agent name badge on each response", async () => {
    // Provide mock messages with agentName field, verify Badge renders
    // with the agent's name next to each assistant message.
  });

  it("activity panel toggles open/closed", async () => {
    // Render AgencyChat, find the toggle button, click it,
    // verify the activity panel DOM element toggles visibility.
  });

  it("activity panel shows agent-to-agent messages", async () => {
    // Provide activityEvents from the stream hook that include
    // agent_switch and inter-agent messages, verify they render
    // in the activity panel.
  });

  it("SSE events update UI in real-time (token -> text display)", async () => {
    // Simulate the stream hook returning partial tokens,
    // verify the streaming text accumulates on screen.
  });

  it("agent_switch event updates current agent indicator", async () => {
    // Provide an activeAgent value from the stream hook,
    // verify the UI shows the current agent name/badge.
  });

  it("run_finished event shows credit usage", async () => {
    // Set creditsUsed in the stream hook state, verify the credit
    // indicator displays the value.
  });

  it("run_error event shows error message", async () => {
    // Set error in the stream hook state, verify an error alert
    // or message renders.
  });
});
```

### useAgencyStream Hook Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts`

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useAgencyStream", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects to stream endpoint with correct headers", async () => {
    // Mock fetch to return a ReadableStream response.
    // Call hook's connect(), verify fetch was called with:
    //   POST /api/v1/agency/stream
    //   Content-Type: application/json
    //   credentials: include
  });

  it("parses SSE events correctly (event type + JSON data)", async () => {
    // Create a mock ReadableStream that yields SSE-formatted data:
    //   "event: token\ndata: {\"token\":\"hello\"}\n\n"
    // Verify the hook state updates with the parsed event.
  });

  it("handles keepalive comments without state change", async () => {
    // Stream a keepalive comment line ": keepalive\n\n"
    // Verify no state changes (messages, activeAgent unchanged).
  });

  it("handles connection drop with error state", async () => {
    // Mock fetch to reject or stream to error mid-read.
    // Verify hook sets error state.
  });

  it("accumulates token deltas into full message", async () => {
    // Stream multiple token events with partial content.
    // Verify the hook accumulates them into a single message string.
  });

  it("tracks active agent via agent_switch events", async () => {
    // Stream an agent_switch event with agentName.
    // Verify hook's activeAgent state updates.
  });
});
```

---

## Implementation Details

### 1. useAgencyStream Hook

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useAgencyStream.ts`

This hook manages SSE consumption for agency runs. Unlike the existing `useSSEWorkflowStream` (which uses `EventSource` for GET-based SSE), this hook uses `fetch()` + `ReadableStream` because the agency stream endpoint is POST-based (it needs to send the message body).

**SSE event types to handle:**

| Event | Data Shape | State Update |
|-------|-----------|--------------|
| `run_started` | `{ runId, agencyId }` | Set `isStreaming: true`, store `runId` |
| `agent_switch` | `{ agentName, reason }` | Update `activeAgent` |
| `token` | `{ token, agentName }` | Append to current streaming message text |
| `tool_call` | `{ toolName, agentName, status }` | Add to `activityEvents` |
| `tool_result` | `{ toolName, result, duration }` | Update corresponding activity event |
| `run_finished` | `{ creditsUsed, runId }` | Set `isStreaming: false`, set `creditsUsed` |
| `run_error` | `{ error, runId }` | Set `isStreaming: false`, set `error` |

**Key design decisions:**

- Uses `fetch()` with `method: "POST"`, `credentials: "include"`, and JSON body containing `{ agencyId, conversationId, message }`.
- Reads the response body as a `ReadableStream` via `response.body.getReader()`.
- Parses the raw byte stream into SSE events by splitting on `\n\n` boundaries and extracting `event:` and `data:` lines.
- Keepalive comments (lines starting with `:`) are silently ignored.
- On connection error or stream abort, sets `error` state and calls an optional `onError` callback.
- The `disconnect` function aborts the fetch via `AbortController`.

**Stub signature:**

```typescript
export interface AgencyStreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  isStreaming?: boolean;
  creditsUsed?: number;
}

export interface AgencyActivityEvent {
  type: "agent_switch" | "tool_call" | "tool_result" | "handoff";
  agentName: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface UseAgencyStreamOptions {
  onRunFinished?: (creditsUsed: number) => void;
  onError?: (error: string) => void;
}

export interface UseAgencyStreamReturn {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  connect: (params: { agencyId: string; conversationId: string; message: string }) => void;
  disconnect: () => void;
}

export function useAgencyStream(options?: UseAgencyStreamOptions): UseAgencyStreamReturn {
  /**
   * Manages SSE connection to POST /api/v1/agency/stream.
   * Parses streaming events and accumulates state for the AgencyChat UI.
   */
}
```

### 2. useAgencyQuery Hook

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useAgencyQuery.ts`

Thin convenience wrapper around tRPC agency router procedures. Provides typed access to agency queries and mutations with standard TanStack Query options.

```typescript
import { trpc } from "@/lib/trpc";

/**
 * Convenience hooks for agency tRPC queries.
 * Wraps trpc.agency.* procedures with common patterns.
 */

export function useAgencyList(tenantId?: string) {
  /** Calls trpc.agency.list with tenant filtering. */
}

export function useAgencyById(agencyId: string | undefined) {
  /** Calls trpc.agency.getById, enabled only when agencyId is truthy. */
}

export function useAgencyConversations(agencyId: string | undefined) {
  /** Calls trpc.agency.listConversations for a specific agency. */
}

export function useCreateAgency() {
  /** Returns trpc.agency.create mutation with cache invalidation. */
}

export function useSendAgencyMessage() {
  /** Returns trpc.agency.sendMessage mutation. */
}
```

### 3. AgencyChat Page

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyChat.tsx`

This is the primary user-facing chat interface for interacting with an agency. It uses a split-view layout inspired by the existing Chat page but adapted for multi-agent interactions.

**Layout structure:**

```
+------------------------------------------+
|  Agency Header (name, status, agents)    |
+------------------------------------------+
|                          |               |
|   Main Conversation     | Agent Activity |
|   Thread (2/3)          | Panel (1/3)    |
|                          |   (collapsible)|
|   - User messages       | - Agent-to-    |
|   - Agent responses     |   agent msgs   |
|     with name badges    | - Tool calls   |
|   - Streaming tokens    | - Handoffs     |
|   - Credit indicator    | - Timeline     |
|                          |               |
+------------------------------------------+
|  Message Input Bar                        |
+------------------------------------------+
```

**Key behaviors:**

- Reads `agencyId` from the URL via `useRoute` (wouter pattern: `/agencies/:id`).
- Loads agency metadata via `useAgencyById(agencyId)`.
- Loads conversation list via `useAgencyConversations(agencyId)`.
- Uses `useAgencyStream` to manage SSE streaming when the user sends a message.
- The message input bar triggers `stream.connect({ agencyId, conversationId, message })`.
- Streaming tokens from `useAgencyStream` are displayed incrementally in the main thread.
- The activity panel is toggled via a button (default: open on desktop, closed on mobile).
- When `run_finished` fires, the credit usage indicator updates.
- When `run_error` fires, an error alert is displayed with a retry option.
- Auth redirect: if user is not authenticated, redirect to `/login` (same pattern as existing Chat page).

**Component imports and patterns to follow (matching existing Chat.tsx):**

- `useAuth` from `@/_core/hooks/useAuth` or `@/contexts/AuthContext`
- `useLocation` / `useRoute` from `wouter`
- `trpc` from `@/lib/trpc`
- UI components from `@/components/ui/*` (Button, ScrollArea, Badge, Textarea)
- Icons from `lucide-react` (Users, Send, Loader2, PanelRightClose, Activity, etc.)
- `cn` from `@/lib/utils` for conditional class composition

**Agent name badge rendering:** Each assistant message in the main thread should display a `Badge` component with the agent's name. Use a color mapping function that assigns consistent colors based on agent name hash (similar to avatar color assignment patterns in the codebase).

### 4. AgencyActivityPanel Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencyActivityPanel.tsx`

The collapsible right panel that shows the internal workings of the agency run. Receives `activityEvents` and `activeAgent` from the parent `AgencyChat` page (which gets them from `useAgencyStream`).

**Renders:**

- **Agent-to-agent message bubbles** -- labeled with sender/receiver agent names, shown in a muted style to distinguish from user-facing messages.
- **Tool call indicators** -- tool name, status (pending/success/error), duration.
- **Handoff events** -- from-agent to to-agent with reason text.
- **Timeline visualization** -- vertical timeline with dots/lines showing the sequence of agent steps.
- **Expandable/collapsible per-step detail** -- each step can be expanded to show full content.
- **Active agent highlight** -- the currently active agent is visually highlighted.

**Props interface:**

```typescript
interface AgencyActivityPanelProps {
  activityEvents: AgencyActivityEvent[];
  activeAgent: string | null;
  isStreaming: boolean;
  onClose: () => void;
}
```

### 5. AgencyBrowser Page

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyBrowser.tsx`

A list/gallery view for browsing available agencies. This is the landing page for the `/agencies` route.

**Layout:**

- Header with "Agencies" title and "Create Agency" button.
- Filter/search bar for filtering by name, status, or template origin.
- Grid of agency cards, each showing:
  - Agency name and description
  - Agent count badge
  - Status badge (draft / published / archived)
  - Credit multiplier indicator (if > 1.0)
  - Last updated timestamp
  - Click navigates to `/agencies/:id` (AgencyChat)
  - Edit button navigates to `/agencies/:id/edit` (AgencyBuilder, section 09)

**Data fetching:** Uses `useAgencyList()` from the `useAgencyQuery` hook, which calls `trpc.agency.list`.

**Feature flag gating:** The entire page should check `AGENCY_SWARM_ENABLED` via the system settings query (similar to how other feature-flagged pages work). If disabled, show a "Feature not available" message or redirect to dashboard.

### 6. Menu Integration

**File to modify:** `/home/dev/projects/SmartSpecPro/packages/shared/src/constants/menu.ts`

Add the following entry to the `defaultMenuItems` array, positioned between workflows (3.5) and media history (4):

```typescript
{
  id: 'agencies',
  label: 'Agencies',
  labelTh: 'เอเจนซี่',
  icon: 'Users',
  path: '/agencies',
  platforms: ['web', 'desktop'],
  group: 'main',
  sortOrder: 3.7,
  requiresFeature: 'AGENCY_SWARM_ENABLED',
}
```

The `requiresFeature` field is already supported by the menu system. The `Users` icon is already imported in `useMenuItems.ts` icon map, so no additional icon mapping is needed.

### 7. Routing

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`

Add lazy imports near the top of the file (alongside other lazy imports):

```typescript
const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
```

Note: `AgencyBuilder` and `AgencyTemplates` routes are added in section 09 and section 12 respectively. This section only adds the chat and browser routes.

Add routes inside the `<Switch>` block, grouped near the workflows routes:

```typescript
<Route path="/agencies" component={AgencyBrowser} />
<Route path="/agencies/:id" component={AgencyChat} />
```

The `/agencies/:id/edit` route for the builder and `/agencies/templates` for templates will be added by their respective sections (09 and 12).

---

## SSE Parsing Implementation Notes

The `useAgencyStream` hook must parse raw SSE from a POST response body. The standard `EventSource` API only supports GET requests, so a custom parser is required.

**SSE format the hook must parse:**

```
event: run_started
data: {"runId":"abc-123","agencyId":"agency-1"}

event: agent_switch
data: {"agentName":"Researcher","reason":"delegation"}

event: token
data: {"token":"Hello","agentName":"Researcher"}

event: token
data: {"token":" world","agentName":"Researcher"}

: keepalive

event: run_finished
data: {"creditsUsed":0.45,"runId":"abc-123"}

```

**Parsing algorithm:**

1. Read chunks from `ReadableStream` via `reader.read()`.
2. Decode bytes to string via `TextDecoder`.
3. Buffer partial data between reads.
4. Split on `\n\n` to identify complete events.
5. For each complete event block:
   - Skip lines starting with `:` (comments/keepalive).
   - Extract `event:` line for event type.
   - Extract `data:` line(s), concatenate if multi-line.
   - Parse `data` as JSON.
   - Dispatch to appropriate state update based on event type.

This pattern is well-established in the frontend ecosystem for consuming POST-based SSE. The existing `useSSEWorkflowStream` hook in the codebase demonstrates similar concepts but uses `EventSource` (GET-only); the agency hook adapts the same state management patterns to `fetch()`.

---

## Feature Flag Considerations

The `AGENCY_SWARM_ENABLED` feature flag gates visibility at multiple levels:

1. **Menu level:** The `requiresFeature` field on the menu item hides it from the sidebar when the flag is disabled.
2. **Route level:** The `AgencyBrowser` and `AgencyChat` pages should check the flag on mount and redirect to `/dashboard` if disabled. Query the flag via `trpc.systemSettings.get` or a dedicated feature flag hook.
3. **API level:** The tRPC router and SSE proxy (from sections 06 and 07) also check the flag server-side, returning 404 if disabled.

This layered approach ensures that even if a user navigates directly to `/agencies` via URL, the feature is properly gated.

---

## Styling and UI Conventions

Follow the established patterns from the existing codebase:

- **Tailwind CSS 4** utility classes for all styling.
- **Radix UI** primitives from `@smartspec/ui` for interactive components (Button, Badge, ScrollArea, Tooltip, etc.).
- **`cn()` utility** from `@/lib/utils` for conditional class merging.
- **Lucide React** icons.
- **Responsive design:** The split-view panel should collapse on mobile (< 1024px width). Use `useIsMobile` hook or Tailwind responsive prefixes.
- **Loading states:** Show `Loader2` spinner with `animate-spin` while data loads.
- **Error states:** Display error messages using the existing toast system (`sonner`) or inline error banners.
- **Dark mode:** All components should work with the existing dark mode theming (Tailwind `dark:` variants).

---

## Connection to Subsequent Sections

- **Section 09 (Frontend Builder):** Will add the `AgencyBuilder` page and the `/agencies/:id/edit` route. The `AgencyBrowser` page created here will link to the edit route.
- **Section 12 (Templates Rollout):** Will add the `AgencyTemplates` page and `/agencies/templates` route. The `AgencyBrowser` page will include a "Templates" link/button that navigates there.