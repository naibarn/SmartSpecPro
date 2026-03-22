<!-- IMPLEMENTATION STATUS: COMPLETE -->

# Section 10 — SSE Streaming Frontend

## Overview

This section implements the frontend SSE streaming UI for agency runs. It extends the existing `useAgencyStream` hook to handle new event types defined in section 09, adds automatic reconnection with replay, polling fallback, a cancel button, and creates the `AgencyChatStream.tsx` component for rich streaming display (character-by-character text, tool status spinners, agent switch animations, guardrail notifications, and approval prompts).

**Key dependencies:**
- Section 09 (SSE Streaming Backend) provides the SSE endpoint (`POST /api/agency/:agencyId/stream`), the cancel endpoint (`POST /api/agency/:agencyId/cancel`), the shared event type definitions (`apps/web/shared/agencyStreamEvents.ts`), and Redis-backed replay.

### What This Section Blocks

No other sections depend directly on this section. It is a leaf in the dependency graph.

## Implementation Notes

### Actual Files Modified/Created

| File | Action | Notes |
|------|--------|-------|
| `apps/web/client/src/hooks/useAgencyStream.ts` | MODIFIED | Added 10 new event types, toolCalls/guardrailEvents/pendingApproval/isPollingFallback state, cancel method, reconnection with Last-Event-ID, exponential backoff, polling fallback flag |
| `apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts` | MODIFIED | Added 11 new tests (19 total) covering all new event types, cancel, reconnection, polling fallback, backward compat |
| `apps/web/client/src/components/agency/AgencyChatStream.tsx` | CREATED | Renders messages, tool call spinners, agent switch badges, guardrail alerts, approval cards, cancel dropdown, polling banner |
| `apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx` | CREATED | 9 component render tests |
| `apps/web/client/src/pages/AgencyChat.tsx` | MODIFIED | Imported and wired AgencyChatStream to replace inline message rendering |

### Deviations from Plan

1. **Polling fallback**: The hook sets `isPollingFallback=true` and `isStreaming=false` as a flag for the consumer, rather than implementing internal tRPC polling. This keeps the hook pure (no tRPC dependency) — the consumer page should implement the polling loop when this flag is set.
2. **scrollRef**: `AgencyChatStream` renders inline content (no internal scroll container). The existing scroll container in `AgencyChat.tsx` manages scrolling.
3. **Framer Motion agent switch**: Used simple Badge components instead of Framer Motion AnimatePresence to avoid adding a new dependency for a minor animation.
4. **Approval submission**: Wired as a no-op TODO pending section 12 implementation.

### Test Summary
- Hook tests: 19 (all passing)
- Component tests: 9 (all passing)
- Total: 28 tests

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/src/hooks/useAgencyStream.ts` | **MODIFY** | Add new event type handling (text_delta, tool_start, tool_progress, tool_end, guardrail_trigger, approval_required, run_complete), reconnection with replay, polling fallback, cancel support |
| `apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts` | **MODIFY** | Add tests for new event types, reconnection, fallback, cancel |
| `apps/web/client/src/components/agency/AgencyChatStream.tsx` | **CREATE** | Streaming UI component: text animation, tool spinners, agent switch, cancel button, guardrail alerts, approval cards |
| `apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx` | **CREATE** | Component render tests |
| `apps/web/client/src/pages/AgencyChat.tsx` | **MODIFY** | Wire `AgencyChatStream` into the existing chat page layout |

---

## Shared Event Types (from Section 09)

This section consumes the shared event type definitions from `apps/web/shared/agencyStreamEvents.ts` (created in section 09). The key types used by the frontend:

```
AgencyStreamEvent       — discriminated union on `event` field
AgencyStreamEventType   — string literal union of event names
parseAgencyStreamEvent  — safe JSON parse with type narrowing
```

Event names the frontend must handle:
- `meta` -- initial event with runId, agencyId
- `text_delta` -- incremental text from an agent (replaces current `token` event)
- `tool_start` -- tool execution begins
- `tool_progress` -- tool execution progress update
- `tool_end` -- tool execution completes
- `agent_switch` -- handoff between agents
- `guardrail_trigger` -- guardrail blocked or warned
- `approval_required` -- human approval requested
- `run_complete` -- run finished with usage stats (replaces current `run_finished`)
- `error` -- error event (replaces current `run_error`)

**Backward compatibility:** The hook must continue handling the legacy event names (`token`, `run_finished`, `run_error`, `run_started`, `tool_call`, `tool_result`, `browser_session`, `preview_ready`) for agencies running without the new emitter. Map legacy names to new handlers internally.

---

## Tests (TDD)

### Vitest: `apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts`

Extend the existing test file. Write these tests FIRST.

```
Test: handles text_delta events and accumulates content per agent
  - Emit: meta -> agent_switch -> text_delta("Hel") -> text_delta("lo") -> run_complete
  - Assert: assistant message content is "Hello", agentName set correctly

Test: handles tool_start / tool_end events as activity events
  - Emit: tool_start({ toolCallId: "tc1", toolName: "web-search" }) -> tool_end({ toolCallId: "tc1", status: "success" })
  - Assert: activityEvents contains both events with correct types
  - Assert: toolCalls state tracks in-progress and completed tools

Test: handles tool_progress events and updates tool status
  - Emit: tool_start -> tool_progress({ toolCallId: "tc1", status: "searching", message: "Querying..." }) -> tool_end
  - Assert: toolCalls state reflects progress update between start and end

Test: handles guardrail_trigger events
  - Emit: guardrail_trigger({ type: "input", guardrailName: "pii_detection", action: "blocked" })
  - Assert: guardrailEvents state contains the event
  - Assert: onGuardrailTrigger callback invoked

Test: handles approval_required events
  - Emit: approval_required({ approvalKey: "uuid-1", step: "publish", summary: "Publish article?", agentName: "Writer" })
  - Assert: pendingApproval state contains the approval request
  - Assert: isStreaming remains true (waiting for approval)

Test: cancel calls cancel endpoint with correct mode
  - Call cancel("immediate") while streaming
  - Assert: fetch called with POST /api/agency/:agencyId/cancel body { runId, mode: "immediate" }
  - Assert: local abort controller signaled

Test: reconnection replays from Last-Event-ID
  - First connection: receive events with id 1,2,3 then connection drops
  - Assert: second fetch call includes "Last-Event-ID": "3" header
  - Assert: fallback does not trigger on first reconnect

Test: falls back to polling after 3 failed SSE connections in 60s
  - Simulate 3 connection failures within 60s
  - Assert: isPollingFallback becomes true
  - Assert: hook calls tRPC agency.getRun periodically instead of SSE

Test: run_complete event maps correctly (new event name)
  - Emit: run_complete({ runId: "r1", usage: { tokens: 500, cost: 0.01 } })
  - Assert: creditsUsed set to 0.01
  - Assert: isStreaming becomes false
  - Assert: onRunFinished callback invoked

Test: backward compatible with legacy token events
  - Emit: token({ token: "Hello", agentName: "Agent1" })
  - Assert: message content accumulated as before (no regression)

Test: disconnect cleans up and cancels in-flight request
  - Call disconnect()
  - Assert: abort controller signaled
  - Assert: isStreaming false, reconnect timer cleared
```

### Vitest: `apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx`

```
Test: renders streaming text with typing indicator when isStreaming
  - Provide messages with one assistant message where isStreaming=true
  - Assert: blinking cursor element visible after message text

Test: renders tool status spinner for in-progress tool calls
  - Provide toolCalls with one entry status="running"
  - Assert: Loader2 spinner icon rendered with tool name label

Test: renders completed tool call with success icon
  - Provide toolCalls with one entry status="success"
  - Assert: check icon rendered, no spinner

Test: renders agent switch badge with animation
  - Provide agent switch event in activityEvents
  - Assert: badge with new agent name rendered

Test: renders cancel button when isStreaming and onCancel provided
  - Provide isStreaming=true, onCancel callback
  - Assert: cancel button visible
  - Fire click event
  - Assert: onCancel called

Test: renders guardrail alert when guardrail_trigger event received
  - Provide guardrailEvents with a "blocked" action
  - Assert: alert banner with guardrail name and action visible

Test: renders approval card when approval is pending
  - Provide pendingApproval with summary and agentName
  - Assert: approval card with Approve/Reject buttons visible

Test: renders polling fallback notice when isPollingFallback
  - Provide isPollingFallback=true
  - Assert: info banner indicating polling mode visible

Test: does not render cancel button when not streaming
  - Provide isStreaming=false
  - Assert: cancel button not in DOM
```

---

## Implementation Guidance

### 1. Extend `useAgencyStream` Hook (`apps/web/client/src/hooks/useAgencyStream.ts`)

The existing hook already handles POST-based SSE via raw `fetch` + `ReadableStream`. Extend it with these changes:

**New state fields to add:**

```typescript
// Add to UseAgencyStreamReturn interface:
toolCalls: ToolCallState[];          // active/completed tool call tracking
guardrailEvents: GuardrailEvent[];   // guardrail trigger events
pendingApproval: ApprovalRequest | null; // current pending approval
isPollingFallback: boolean;          // true when SSE failed, polling active
cancel: (mode: "immediate" | "after_turn") => void;  // cancel method
```

**New interfaces:**

```typescript
interface ToolCallState {
  toolCallId: string;
  toolName: string;
  agentName: string;
  status: "running" | "success" | "error";
  progressMessage?: string;
  result?: string;
  startedAt: number;
  endedAt?: number;
}

interface GuardrailEvent {
  type: "input" | "output";
  guardrailName: string;
  action: string;  // "blocked" | "warned" | "redacted"
  timestamp: number;
}

interface ApprovalRequest {
  approvalKey: string;
  step: string;
  summary: string;
  agentName: string;
  timestamp: number;
}
```

**New options callbacks:**

```typescript
// Add to UseAgencyStreamOptions:
onGuardrailTrigger?: (event: GuardrailEvent) => void;
onApprovalRequired?: (request: ApprovalRequest) => void;
```

**Event handling changes in `handleSSEEvent`:**

Extend the switch statement to handle the new event types alongside legacy events. Mapping:

| New Event | Legacy Event | Handler Changes |
|-----------|-------------|-----------------|
| `text_delta` | `token` | Same accumulation logic; `delta` field maps to `token` field |
| `tool_start` | `tool_call` | Create `ToolCallState` entry with status `"running"` |
| `tool_progress` | (none) | Update matching `ToolCallState` with `progressMessage` |
| `tool_end` | `tool_result` | Update matching `ToolCallState` with status and result |
| `agent_switch` | `agent_switch` | Same logic (already handled) |
| `guardrail_trigger` | (none) | Append to `guardrailEvents`, invoke callback |
| `approval_required` | (none) | Set `pendingApproval` state, invoke callback |
| `run_complete` | `run_finished` | Same logic; map `usage.cost` to `creditsUsed` |
| `error` | `run_error` / `error` | Same error handling (already handled) |
| `meta` | `run_started` | Store `runId` in a ref for cancel and reconnect |

Keep legacy event names as fallthrough cases so existing agencies work.

**Reconnection logic:**

Add automatic reconnection when the SSE stream drops unexpectedly (not via user disconnect or abort):

```
- Store last received event ID in a ref (lastEventIdRef)
- On connection drop (non-abort error): 
  - Increment failCountRef
  - If failCount < 3 within 60s: reconnect after exponential backoff (1s, 2s, 4s)
  - Include "Last-Event-ID" header in the reconnect fetch request
  - On successful reconnect, reset failCount
- If failCount >= 3 within 60s: switch to polling fallback
```

**Polling fallback:**

When `isPollingFallback` is true, set up an interval (every 3 seconds) that calls the existing `agency.getRun` tRPC procedure to fetch the current run state. Map the response to the same message/activity state. Clear the interval when the run completes or the component unmounts.

The polling fallback should be stored as an `intervalRef` and cleaned up in the `disconnect` function and unmount effect.

**Cancel implementation:**

```typescript
const cancel = useCallback(
  async (mode: "immediate" | "after_turn") => {
    // 1. Signal abort controller for immediate local disconnect
    if (mode === "immediate") {
      abortRef.current?.abort();
    }
    // 2. Call cancel endpoint
    const runId = runIdRef.current;
    if (!runId || !currentAgencyIdRef.current) return;
    try {
      await fetch(
        `/api/agency/${currentAgencyIdRef.current}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ runId, mode }),
        }
      );
    } catch {
      // Best-effort cancel
    }
  },
  [],
);
```

**Storing runId:** Add a `runIdRef` that captures the `runId` from the `meta` event (or from the initial response body if the proxy returns it). Also add `currentAgencyIdRef` to capture the agencyId for cancel calls.

### 2. Create `AgencyChatStream.tsx` (`apps/web/client/src/components/agency/AgencyChatStream.tsx`)

A React component that renders the streaming agency chat UI. It receives props from the `useAgencyStream` hook state and renders the chat message list with rich streaming indicators.

**Props interface:**

```typescript
interface AgencyChatStreamProps {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  toolCalls: ToolCallState[];
  guardrailEvents: GuardrailEvent[];
  pendingApproval: ApprovalRequest | null;
  isPollingFallback: boolean;
  onCancel?: (mode: "immediate" | "after_turn") => void;
  onApprovalSubmit?: (approvalKey: string, approved: boolean, feedback?: string) => void;
  /** Agent name to color class mapping function */
  getAgentColor?: (name: string) => string;
  scrollRef?: React.RefObject<HTMLDivElement>;
}
```

**Component structure (high-level, not full implementation):**

```
AgencyChatStream
  |-- PollingFallbackBanner (shown when isPollingFallback)
  |-- MessageList (scrollable container)
  |   |-- For each message:
  |   |   |-- UserMessageBubble (role=user)
  |   |   |-- AssistantMessageBubble (role=assistant)
  |   |       |-- AgentBadge (agent name with color)
  |   |       |-- SafeMarkdown content
  |   |       |-- TypingCursor (if isStreaming on this message)
  |-- ToolCallStatusList (inline between messages, during streaming)
  |   |-- ToolCallItem (spinner when running, check when success, X when error)
  |       |-- Tool name + progressMessage
  |-- AgentSwitchBadge (animated transition badge when agent changes)
  |-- GuardrailAlertBanner (shown when guardrail triggers)
  |-- ApprovalCard (shown when pendingApproval is set)
  |   |-- Summary text
  |   |-- Approve / Reject buttons
  |   |-- Optional feedback textarea (for rejection)
  |-- CancelButton (shown when isStreaming)
  |   |-- Dropdown: "Cancel Now" (immediate) / "Cancel After Turn" (after_turn)
  |-- CreditUsageBadge (shown after run_complete)
```

**UI details:**

- **TypingCursor**: A blinking `|` element (CSS `@keyframes blink`) appended after the last character of a streaming message. Use Tailwind `animate-pulse` or a custom animation.

- **ToolCallStatusList**: Rendered inline in the message flow when tool calls are active. Each `ToolCallItem` shows:
  - `Loader2` icon (from lucide-react) with `animate-spin` when `status === "running"`
  - `CheckCircle` icon when `status === "success"`
  - `XCircle` icon when `status === "error"`
  - Tool name in bold, progress message in muted text

- **AgentSwitchBadge**: When an `agent_switch` event occurs, render a small badge between messages with Framer Motion `AnimatePresence` + `motion.div` for fade-in animation. Shows "Agent Name took over" text.

- **GuardrailAlertBanner**: A `bg-amber-50 border-amber-200` banner (for "warned") or `bg-red-50 border-red-200` (for "blocked"). Shows guardrail name and action.

- **ApprovalCard**: A card with `border-blue-200 bg-blue-50` styling. Contains:
  - Agent name badge
  - Summary text
  - Two buttons: "Approve" (primary) and "Reject" (destructive variant)
  - When "Reject" is clicked, expand a textarea for optional feedback
  - Calls `onApprovalSubmit(approvalKey, approved, feedback)` which triggers the tRPC `agency.submitApproval` procedure (from section 12)

- **CancelButton**: Use the existing `Button` component with `variant="outline"` and a `Popover` or `DropdownMenu` offering two options:
  - "Cancel Now" -- calls `onCancel("immediate")`
  - "Cancel After Turn" -- calls `onCancel("after_turn")`

- **PollingFallbackBanner**: A small info banner at the top: "Live streaming unavailable. Using polling updates." with a "Retry SSE" link that resets polling fallback state.

### 3. Wire Into `AgencyChat.tsx` (`apps/web/client/src/pages/AgencyChat.tsx`)

Modify the existing page to use `AgencyChatStream` for rendering messages instead of the inline JSX currently used for message display. This is a refactor of the render section.

Key changes:

- Import `AgencyChatStream` from `@/components/agency/AgencyChatStream`
- Pass all `stream.*` state properties as props to `AgencyChatStream`
- Wire `onCancel` to `stream.cancel`
- Wire `onApprovalSubmit` to call the existing `trpc.agency.submitApproval.useMutation()` (created in section 12; for now, define a no-op callback with a TODO comment)
- Keep existing `scrollRef`, `getAgentColor`, and auto-scroll logic
- Preserve the existing `ModelPicker`, `AgencyActivityPanel`, `BrowserSessionSummaryCard`, and `AgencyPreviewCard` integrations alongside the new streaming component

### 4. Package Dependency

The hook uses raw `fetch` + `ReadableStream` for SSE parsing (existing pattern in the hook). The plan mentions `@microsoft/fetch-event-source` as an alternative. The existing implementation already works without it. Keep the raw `fetch` approach for consistency but consider these enhancements from `fetch-event-source`:

- If the team decides to switch, install: `pnpm add @microsoft/fetch-event-source` in `apps/web`
- The library handles retry, Last-Event-ID, and POST natively
- Switching is optional; the raw approach with manual reconnection logic described above is sufficient

For this section, continue with the **raw fetch approach** (matching existing codebase) plus the manual reconnection/replay logic added above.

---

## Integration Points

### With Section 09 (SSE Streaming Backend)

- Consumes SSE events from `POST /api/agency/:agencyId/stream`
- Sends cancel via `POST /api/agency/:agencyId/cancel`
- Uses `Last-Event-ID` header for reconnection replay
- Imports types from `apps/web/shared/agencyStreamEvents.ts`

### With Section 12 (Topology & Human Approval)

- The `approval_required` event triggers the `ApprovalCard` UI
- The `onApprovalSubmit` callback calls `agency.submitApproval` tRPC procedure (defined in section 12)
- Until section 12 is implemented, the approval UI renders but submission is a no-op with a TODO

### With Section 16 (Tool Progress & Standalone API)

- The `tool_progress` event is already handled by the hook (see `ToolCallState.progressMessage`)
- No additional changes needed when section 16 adds progress events to builtin tools

### With Existing Code

- `AgencyChat.tsx` currently uses `useAgencyStream` with the current event set -- all existing functionality is preserved
- The `AgencyActivityPanel` component continues to receive `activityEvents` from the hook (now enriched with new event types)
- Legacy event names (`token`, `run_finished`, etc.) remain supported for backward compatibility

---

## Security Considerations

- The cancel endpoint requires authentication (credentials: "include" sends JWT cookie)
- `runId` is stored in a ref, never exposed in URL params
- Approval keys (`approvalKey`) are passed through only to the backend submission endpoint, never logged or stored in localStorage
- The polling fallback uses authenticated tRPC calls (same auth as existing `agency.getRun`)

---

## Error Handling

- HTTP errors from the SSE endpoint (401, 402, 403, 404, 500) are caught and displayed as `error` state before streaming starts
- Mid-stream connection drops trigger reconnection (up to 3 times in 60s)
- After 3 failures, polling fallback activates with an info banner
- Cancel failures are silent (best-effort) -- the user sees the stream end naturally
- Invalid JSON in SSE data fields is silently skipped (existing behavior in `handleSSEEvent`)
- Approval submission errors are shown via `toast.error` from sonner