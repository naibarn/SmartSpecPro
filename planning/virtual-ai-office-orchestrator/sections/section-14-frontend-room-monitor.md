Now I have enough context. Let me produce the section content.

# Section 14: Frontend Room Monitor

## Overview

This section implements three major frontend components for the Virtual AI Office Orchestrator:

1. **Team Room View** -- multi-party message display with agent avatars, system bubbles, recipient indicators, and turn type badges
2. **Live Run Monitor** -- split-panel view during active runs with agent roster, activity timeline, run controls, and budget tracking
3. **Orchestrator Dashboard** -- overview page showing active runs, agent utilization, pending approvals, cost breakdown, and system status
4. **Right Panel Extensions** -- new panel modes (participants, activity, approvals, summary) for team rooms

All components live under `apps/web/client/src/components/orchestrator/` and integrate with tRPC routers from section 10, SSE streaming from section 11, and the sidebar shell from section 12.

---

## Dependencies

| Dependency | Section | What It Provides |
|---|---|---|
| Room/Run Engine | section-05 | `team_runs`, `team_room_messages`, `team_rooms` schema and engine |
| Monitoring Service | section-07 | `agent_activity_events`, `run_snapshots`, `orchestrator_notifications` |
| tRPC Routers | section-10 | `teamRoom`, `teamRun`, `monitoring`, `notification` routers |
| SSE Streaming | section-11 | `/api/runs/:runId/stream`, `/api/teams/:teamId/stream` endpoints, `useRunStream` hook |
| Frontend Shell & Sidebar | section-12 | `ActiveThreadRef`, sidebar sections, route model, `ChatShell` layout |

---

## Tests First

All tests use **Vitest + React Testing Library + Happy DOM**. Test files go in `__tests__/` subdirectories adjacent to the component they test.

### 5.3 Team Room View Tests

**File:** `apps/web/client/src/components/orchestrator/__tests__/TeamRoomView.test.tsx`

```typescript
/**
 * TeamRoomView test suite.
 *
 * Verifies:
 * - Messages render with correct agent avatar and color
 * - System messages render with distinct style
 * - Recipient indicator shows @agent_name for directed messages
 * - Turn type badges display correctly for each type
 */

describe("TeamRoomView", () => {
  it("renders agent messages with correct avatar and color based on assistantId", () => {
    // Render TeamRoomView with mock messages from two different agents.
    // Assert each message bubble has the agent's avatar and a unique color class.
  });

  it("renders system messages with distinct style", () => {
    // Render a message with senderType="system".
    // Assert it has the system message CSS class (e.g., bg-muted border-l-4).
    // Assert it does NOT render an agent avatar.
  });

  it("shows recipient indicator @agent_name for directed messages", () => {
    // Render a message with recipientType="assistant" and recipientAssistantId set.
    // Assert the "@AgentName" badge is visible in the message header.
  });

  it("shows @all indicator for broadcast messages", () => {
    // Render a message with recipientType="all".
    // Assert "@all" badge or no specific recipient shown.
  });

  it("displays correct turn type badge for each type", () => {
    // Render messages with turnType: discussion, handoff, review, decision, summary.
    // Assert each has the corresponding Badge text and variant.
  });

  it("shows run status bar when a run is active", () => {
    // Render TeamRoomView with an active run (status=running).
    // Assert the run status bar is visible at the top.
  });

  it("scrolls to bottom on new messages", () => {
    // Render with messages, add a new message via rerender.
    // Assert scrollIntoView was called on the bottom sentinel.
  });
});
```

### 5.4 Live Run Monitor Tests

**File:** `apps/web/client/src/components/orchestrator/__tests__/LiveRunMonitor.test.tsx`

```typescript
/**
 * LiveRunMonitor test suite.
 *
 * Verifies:
 * - Agent roster shows correct status indicator per agent
 * - Activity timeline renders events in chronological order
 * - Pause/Stop/Intervene buttons call correct tRPC mutation
 * - Budget progress bar updates on new cost events
 */

describe("LiveRunMonitor", () => {
  it("renders agent roster with correct status indicator per agent", () => {
    // Provide mock agent statuses: idle, active, thinking, error.
    // Assert each agent row shows the corresponding status dot color.
  });

  it("renders activity timeline events in chronological order", () => {
    // Provide events with different createdAt timestamps.
    // Assert the rendered order matches chronological (oldest first).
  });

  it("calls teamRun.pause on Pause button click", async () => {
    // Render with an active run.
    // Click the Pause button.
    // Assert the teamRun.pause mutation was called with the correct runId.
  });

  it("calls teamRun.stop on Stop button click", async () => {
    // Render with an active run.
    // Click the Stop button.
    // Assert the teamRun.stop mutation was called.
  });

  it("calls teamRun.intervene on Intervene button click", async () => {
    // Render with an active run and an intervention input.
    // Type a message and click Intervene.
    // Assert teamRun.intervene was called with the message.
  });

  it("renders budget progress bar with correct percentage", () => {
    // Provide budgetSnapshot with used=50, max=200.
    // Assert progress bar is at 25%.
  });

  it("updates budget progress on new SSE cost events", () => {
    // Simulate an SSE event that updates cost.
    // Assert progress bar percentage increases.
  });

  it("shows duration indicator with elapsed time", () => {
    // Provide a run with startedAt in the past.
    // Assert the duration indicator shows a non-zero time.
  });
});
```

### 5.5 Orchestrator Dashboard Tests

**File:** `apps/web/client/src/components/orchestrator/__tests__/OrchestratorDashboard.test.tsx`

```typescript
/**
 * OrchestratorDashboard test suite.
 *
 * Verifies:
 * - Active runs list renders with team name and status
 * - Pending approvals section shows items with aging
 * - Cost overview displays per-team breakdown
 * - System status indicator reflects resource state
 */

describe("OrchestratorDashboard", () => {
  it("renders active runs with team name and status badge", () => {
    // Provide mock active runs data.
    // Assert each run row shows team name, status badge, and elapsed time.
  });

  it("shows pending approvals with aging indicator", () => {
    // Provide approval items with createdAt timestamps.
    // Assert each shows time-ago text (e.g., "5m ago").
  });

  it("displays cost breakdown per team", () => {
    // Provide cost data grouped by team.
    // Assert the cost card renders correct amounts.
  });

  it("shows system status indicator based on resource state", () => {
    // Provide system_resource_state with status=degraded.
    // Assert a warning indicator is displayed.
  });

  it("navigates to run detail on run row click", async () => {
    // Click a run row.
    // Assert navigation to /chat?thread=team_room:roomId.
  });
});
```

### Right Panel Extension Tests

**File:** `apps/web/client/src/components/orchestrator/__tests__/RightPanelExtensions.test.tsx`

```typescript
/**
 * Right panel extension tests.
 *
 * Verifies panel modes: participants, activity, approvals, summary.
 */

describe("RightPanelExtensions", () => {
  it("participants panel shows assistant identity and status", () => {
    // Render ParticipantsPanel with mock participants.
    // Assert each shows displayName, roleTitle, and status indicator.
  });

  it("activity panel renders event stream in human-readable form", () => {
    // Render ActivityPanel with mock events.
    // Assert each event shows a human-readable summary line.
  });

  it("approvals panel shows pending checkpoints with approve/reject", () => {
    // Render ApprovalsPanel with pending approval items.
    // Assert approve and reject buttons are visible for each item.
  });

  it("summary panel shows latest run summary", () => {
    // Render SummaryPanel with a completed run summary.
    // Assert objective, decisions, and next steps are displayed.
  });
});
```

---

## Implementation Details

### Directory Structure

```
apps/web/client/src/components/orchestrator/
├── TeamRoomView.tsx
├── TeamRoomMessageBubble.tsx
├── TeamRoomStatusBar.tsx
├── TeamRoomInput.tsx
├── LiveRunMonitor.tsx
├── AgentRoster.tsx
├── ActivityTimeline.tsx
├── RunControls.tsx
├── BudgetProgressBar.tsx
├── OrchestratorDashboard.tsx
├── panels/
│   ├── ParticipantsPanel.tsx
│   ├── ActivityPanel.tsx
│   ├── ApprovalsPanel.tsx
│   └── SummaryPanel.tsx
├── hooks/
│   ├── useRunStream.ts          (may already exist from section-11)
│   ├── useRunTimer.ts
│   └── useAgentColors.ts
└── __tests__/
    ├── TeamRoomView.test.tsx
    ├── LiveRunMonitor.test.tsx
    ├── OrchestratorDashboard.test.tsx
    └── RightPanelExtensions.test.tsx
```

### 5.3 Team Room View

**File:** `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`

The team room view replaces the standard ChatView message list when the active thread is `kind: "team_room"`. It is mounted by the ChatShell (section 12) based on `ActiveThreadRef.kind`.

**Component hierarchy:**

- `TeamRoomView` -- top-level container, fetches messages and manages scroll
  - `TeamRoomStatusBar` -- shown at top when a run is active (status, elapsed time, active agent)
  - `ScrollArea` containing message list:
    - `TeamRoomMessageBubble` (one per message)
  - `TeamRoomInput` -- message input at bottom (send to team, send to specific agent)

**TeamRoomMessageBubble props and rendering logic:**

- Receives a `team_room_message` record (from `teamRoom.listMessages` tRPC query)
- **Agent messages** (`senderType="assistant"`): Render with colored avatar on left side. Avatar shows agent initials or persona image. Color is deterministic from `senderAssistantId` (use a hash-to-hue function). Display `displayName` and `roleTitle` in the header.
- **User messages** (`senderType="user"`): Render on right side with user avatar, similar to existing ChatView pattern.
- **System messages** (`senderType="system"`): Full-width, muted background, left border accent. No avatar. Italic text style.
- **Recipient indicator**: If `recipientType="assistant"`, show `@{recipientDisplayName}` badge in the header. If `recipientType="all"`, omit or show subtle "@all". If `recipientType="subgroup"`, show multiple `@name` badges.
- **Turn type badge**: Render a small `Badge` component with the `turnType` value. Use distinct colors: discussion (default/neutral), handoff (blue), review (amber), decision (green), execution_update (purple), summary (emerald).
- **Content rendering**: Use `SafeMarkdown` (existing component) to render message content. If `artifactRefsJson` is present, render artifact links below the content.
- **Token usage**: If `tokenUsageJson` is present, render a subtle token count in the message footer (similar to `MessageCostBadge` pattern).

**Data fetching:**

- `teamRoom.listMessages` tRPC query with `roomId` and optional `viewMode` filter
- SSE stream for real-time updates: subscribe to `/api/runs/:runId/stream` (if a run is active) or poll `teamRoom.listMessages` with refetch interval
- On receiving `assistant_message_final` SSE event, append the new message to the local list and scroll to bottom

**Agent color assignment (`useAgentColors` hook):**

- Takes an array of assistant profile IDs
- Returns a `Map<string, { bg: string; text: string; border: string }>` of Tailwind color classes
- Colors are assigned from a predefined palette of 10 distinct hues, cycling if more than 10 agents
- Deterministic: same assistantId always gets the same color within a session

**TeamRoomInput component:**

- Similar to existing ChatView input (Textarea + Send button)
- Additional dropdown to select recipient: "All Team" (default), or a specific agent from the participant list
- When a run is active, shows a warning that messages will be processed as orchestrator interventions
- Calls `teamRoom.sendMessage` mutation on submit

### 5.4 Live Run Monitor

**File:** `apps/web/client/src/components/orchestrator/LiveRunMonitor.tsx`

Displayed as a split-panel overlay or integrated view when a run is active in a team room. Can be toggled from the `TeamRoomStatusBar`.

**Layout (split-panel):**

```
┌──────────────────────────────────────────────────┐
│  Left (240px)  │  Center (flex)   │              │
│  AgentRoster   │  ActivityTimeline│              │
│                │                  │              │
│                │                  │              │
├────────────────┴──────────────────┤              │
│  Bottom Bar: RunControls          │  Right Panel │
│  [Pause] [Stop] [Intervene]       │  (existing)  │
│  Budget: ████████░░ 65%  │ 12:34  │              │
└───────────────────────────────────┴──────────────┘
```

**AgentRoster component** (`AgentRoster.tsx`):

- Lists all participant assistants for the current run
- Each row shows: avatar (colored), displayName, roleTitle, status dot
- Status dot colors: idle (gray), active (green pulse), thinking (amber pulse), error (red), muted (gray strikethrough)
- Data from `monitoring.getAgentStatuses` tRPC query, refreshed by SSE `agent_status_changed` events
- Clicking an agent could filter the activity timeline to that agent only

**ActivityTimeline component** (`ActivityTimeline.tsx`):

- Vertically scrolling timeline of `agent_activity_events`
- Each event rendered as a compact card: timestamp, agent avatar (small), event summary text, optional detail expand
- Events color-coded by `eventCategory`: status_change (blue), communication (gray), tool_use (purple), memory_op (emerald), error (red)
- Data from `monitoring.getActivityTimeline` tRPC query (paginated with cursor)
- New events appended in real-time from SSE stream
- Filter controls: by agent, by event category, by visibility level

**RunControls component** (`RunControls.tsx`):

- Three primary action buttons:
  - **Pause** (visible when status=running): Calls `teamRun.pause` mutation. Icon: `Pause`
  - **Resume** (visible when status=paused): Calls `teamRun.resume` mutation. Icon: `Play`
  - **Stop** (visible when status=running or paused): Calls `teamRun.stop` mutation with confirmation dialog. Icon: `Square`
- **Intervene** input: Text input + send button that calls `teamRun.intervene` with the message. This injects an orchestrator message into the run.
- **Mute/Unmute agent**: Available from agent roster context menu, calls `teamRun.muteAgent` / `teamRun.unmuteAgent`

**BudgetProgressBar component** (`BudgetProgressBar.tsx`):

- Shows `used / max` credits from `team_runs.budgetSnapshotJson`
- Progress bar with color thresholds: green (<50%), amber (50-80%), red (>80%)
- Updated by SSE events containing cost data
- Tooltip shows per-agent cost breakdown on hover

**useRunTimer hook** (`hooks/useRunTimer.ts`):

- Takes `startedAt` timestamp from the run
- Returns formatted elapsed time string (e.g., "12:34" or "1:02:15")
- Updates every second via `setInterval`
- Stops when run status is not "running"

### 5.5 Orchestrator Dashboard

**File:** `apps/web/client/src/components/orchestrator/OrchestratorDashboard.tsx`

A new page or tab accessible from the sidebar. Provides a bird's-eye view of all orchestration activity.

**Route:** `/orchestrator` or rendered as a dashboard tab within the chat shell when `ActiveThreadRef` is `{ kind: "dashboard" }`.

**Sections:**

1. **Active Runs** -- Card list from `monitoring.getActiveRuns` query. Each card shows: team name, room title, status badge, active agent name, elapsed time, budget usage mini-bar. Clicking navigates to `/chat?thread=team_room:{roomId}`.

2. **Agent Utilization** -- Summary stats: total active agents, idle agents, errored agents. Optional small bar chart. Data from `monitoring.getAgentStatuses` aggregated across all active runs.

3. **Pending Approvals** -- List from `teamRun.listPendingApprovals` or filtered `automationHandoff.list`. Each item shows: description, requesting agent, time since creation (aging), approve/reject buttons inline.

4. **Recent Completions** -- Last 10 completed runs from `teamRun.listByRoom` filtered by status=completed. Shows: team name, objective summary (truncated), duration, total cost, outcome (success/stopped/failed).

5. **Cost Overview** -- Aggregate cost by team and by time period. Data from `monitoring.getCostBreakdown`. Rendered as a simple table or card grid.

6. **System Status** -- Reads from `system_resource_state` (via a tRPC query or dedicated endpoint). Shows provider health indicators (healthy/degraded/down) with colored dots.

### 5.6 Right Panel Extensions

**File:** `apps/web/client/src/components/orchestrator/panels/`

These are new panel modes added to the existing right panel system in the chat shell. The right panel already supports modes like memory, skills, artifacts, etc. These extensions add team-room-specific modes.

**ParticipantsPanel** (`ParticipantsPanel.tsx`):
- Lists all `team_room_participants` for the current room
- For each assistant: avatar, displayName, roleTitle, specialtyTags, status (from monitoring), isLead badge, isMuted indicator
- For each user: avatar, name, role (orchestrator/observer)
- Data from `teamRoom.get` (includes participants) plus `monitoring.getAgentStatuses`

**ActivityPanel** (`ActivityPanel.tsx`):
- Compact version of the ActivityTimeline for the right panel
- Shows recent events in human-readable form (e.g., "Agent A handed off to Agent B", "Agent C wrote a memory note")
- Auto-refreshes from SSE or polling

**ApprovalsPanel** (`ApprovalsPanel.tsx`):
- Lists pending `automation_handoffs` and any human-in-the-loop checkpoints for the current run
- Each item: description, requesting agent, destination type, approve/reject buttons
- Calls `automationHandoff.approve` or `automationHandoff.reject` mutations

**SummaryPanel** (`SummaryPanel.tsx`):
- Shows the latest run summary (from `team_runs.summaryArtifactId` or `teamRoom.getSummary`)
- Structured display: objective, key decisions (bullet list), key findings, artifacts produced, open questions, next steps
- If no summary exists yet and run is active, show "Summary will be generated when the run completes"

**Freshness indicator (from spec §14E.5):**
- After displaying a summary, query `isSummaryFresh(runId)` from summaryService
- If stale (new messages exist since generatedAt): show amber badge "Summary may be outdated — new activity since {generatedAt}"
- If fresh: show green badge "Up to date"
- If run is still active and no summary exists: show "Summary will be generated when the run completes"
- Add a "Regenerate Summary" button that calls `summaryService.generateSummary` with method="system" for quick refresh

### Integration with Section 12 (Chat Shell)

The chat shell from section 12 uses `ActiveThreadRef` to decide which view to render in the main content area:

- `kind: "chat"` renders existing `ChatView`
- `kind: "team_room"` renders `TeamRoomView` (this section)
- `kind: "agency_conversation"` renders existing agency conversation view

The right panel mode selector (section 12) is extended with the new modes:

```typescript
// Added to the panel mode type in the shell
type PanelMode =
  | "memory"
  | "skills"
  | "artifacts"
  | "schedule"
  | "canvas"
  // New team room modes (this section):
  | "participants"
  | "activity"
  | "approvals"
  | "summary";
```

When the active thread is `kind: "team_room"`, the right panel mode selector shows the team-specific modes. The existing modes remain available.

### SSE Integration Pattern

The components in this section consume SSE events from section 11. The pattern follows the existing `useSSEWorkflowStream` hook at `apps/web/client/src/hooks/useSSEWorkflowStream.ts`:

**`useRunStream` hook** (provided by section 11, consumed here):
- Connects to `/api/runs/:runId/stream`
- Parses SSE events and dispatches them to registered callbacks
- Handles reconnection with `Last-Event-ID`
- Components register event handlers:

```typescript
// Conceptual usage in TeamRoomView
const { isConnected } = useRunStream(runId, {
  onAssistantMessageFinal: (msg) => appendMessage(msg),
  onAgentStatusChanged: (status) => updateAgentStatus(status),
  onRunCompleted: () => refetchRunStatus(),
  onBudgetThreshold: (data) => updateBudgetBar(data),
});
```

### tRPC Queries Used

These queries are defined in section 10. This section consumes them:

| Query / Mutation | Used By | Purpose |
|---|---|---|
| `teamRoom.listMessages` | TeamRoomView | Fetch room messages with view mode filter |
| `teamRoom.sendMessage` | TeamRoomInput | Send user message to room |
| `teamRoom.get` | ParticipantsPanel | Get room details + participants |
| `teamRun.get` | LiveRunMonitor, TeamRoomStatusBar | Get current run status |
| `teamRun.pause` | RunControls | Pause active run |
| `teamRun.resume` | RunControls | Resume paused run |
| `teamRun.stop` | RunControls | Stop run |
| `teamRun.intervene` | RunControls | Inject orchestrator message |
| `teamRun.muteAgent` | AgentRoster | Mute an agent |
| `teamRun.unmuteAgent` | AgentRoster | Unmute an agent |
| `monitoring.getAgentStatuses` | AgentRoster, OrchestratorDashboard | Get agent status indicators |
| `monitoring.getActivityTimeline` | ActivityTimeline, ActivityPanel | Paginated event list |
| `monitoring.getActiveRuns` | OrchestratorDashboard | All active runs for user |
| `monitoring.getCostBreakdown` | OrchestratorDashboard | Cost aggregation |
| `monitoring.getRunSummary` | SummaryPanel | Run summary data |
| `automationHandoff.approve` | ApprovalsPanel | Approve a handoff |
| `automationHandoff.reject` | ApprovalsPanel | Reject a handoff |

### Styling and UI Conventions

Follow existing project conventions:
- **UI primitives**: Import from `@/components/ui/` (Radix-based components from `@smartspec/ui`)
- **Icons**: Lucide React icons (`lucide-react`)
- **Styling**: TailwindCSS 4 utility classes
- **Animations**: Framer Motion for status transitions and timeline entry animations
- **Toasts**: Sonner for action confirmations (pause/stop/intervene)
- **Responsive**: Components should work in the chat shell layout which has a fixed sidebar width and flexible main area

### Agent Avatar Color Palette

The `useAgentColors` hook assigns colors from this palette:

```typescript
const AGENT_PALETTE = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300" },
  { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
];
```

Assignment is by hashing the `assistantId` string and taking `index % AGENT_PALETTE.length`.

### Turn Type Badge Colors

```typescript
const TURN_TYPE_VARIANTS: Record<string, string> = {
  discussion: "default",       // neutral gray
  handoff: "secondary",        // blue
  review: "outline",           // amber border
  decision: "success",         // green (custom variant or className override)
  execution_update: "purple",  // purple (custom)
  summary: "emerald",          // emerald (custom)
};
```

Use the `Badge` component with `variant` prop or `className` override for non-standard variants.

---

## Implementation Checklist

1. Create `apps/web/client/src/components/orchestrator/` directory structure
2. Implement `useAgentColors` hook
3. Implement `useRunTimer` hook
4. Implement `TeamRoomMessageBubble` component
5. Implement `TeamRoomStatusBar` component
6. Implement `TeamRoomInput` component
7. Implement `TeamRoomView` (composes the above)
8. Implement `AgentRoster` component
9. Implement `ActivityTimeline` component
10. Implement `RunControls` component
11. Implement `BudgetProgressBar` component
12. Implement `LiveRunMonitor` (composes roster + timeline + controls + budget)
13. Implement `OrchestratorDashboard` page
14. Implement right panel extensions: `ParticipantsPanel`, `ActivityPanel`, `ApprovalsPanel`, `SummaryPanel`
15. Integrate `TeamRoomView` into the chat shell's `ActiveThreadRef` dispatcher (section 12)
16. Register new right panel modes in the panel mode selector (section 12)
17. Add route for orchestrator dashboard
18. Write all test suites
19. Verify all components render correctly with mock data