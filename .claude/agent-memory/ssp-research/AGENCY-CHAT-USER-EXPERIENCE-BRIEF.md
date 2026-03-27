---
name: Agency Chat User Experience — Complete Feature Research
description: Comprehensive research of all user-facing UI flows, interactions, options, and behaviors in Agency Chat
type: project
---

# Agency Chat: Complete User Experience Research Brief

**Status**: RESEARCH COMPLETE
**Date**: 2026-03-23
**Research Scope**: UI flows, message types, input options, run options, sidebar controls, browser sessions, streaming behavior, preview generation

---

## Findings

Agency Chat is a real-time, conversational interface for testing and running multi-agent systems. Users send messages to an agency, and it routes the message through a team of agents who collaborate, hand off work, and produce outputs. The UI provides:

1. **Message streaming** with rich indicators (agent badges, typing cursors, tool calls, guardrails)
2. **Agent switching** badges showing when agents take over
3. **Tool call visualization** inline and in a sidebar activity panel
4. **Run options** (target agent, model override, additional instructions)
5. **Guardrail enforcement** with visual alerts (blocked or warned)
6. **Browser session integration** (create, resume, send instructions)
7. **Preview generation** (results committed to library or external targets)
8. **Activity panel** showing agent activity timeline
9. **Error handling** with retry capability
10. **Streaming fallback** to polling if SSE fails

---

## Current Architecture

### Frontend (React)

**Main page**: `apps/web/client/src/pages/AgencyChat.tsx` (977 lines)
- Routes: `/agencies/:id` (chat view for a specific agency)
- Loads agency metadata from `useAgencyById` hook
- Manages input state, run options, model overrides

**Key hooks & components**:
- `useAgencyStream()` — WebSocket/SSE stream handler with polling fallback
- `<AgencyChatStream>` — Message and event renderer
- `<AgencyActivityPanel>` — Sidebar showing agent/tool timeline
- `<ModelPicker>` — Model override dropdown
- `<BrowserSessionSummaryCard>` — Browser session UI (when active)
- `<BrowserSessionLaunchSuggestionCard>` — Prompt suggests opening browser
- `<AgencyPreviewCard>` — Generated content preview (images, videos, text, decks)

**Stream handling**: `apps/web/client/src/hooks/useAgencyStream.ts` (727 lines)
- SSE connection via `/api/v1/agency/stream` (POST)
- Event parsing: `run_started`, `agent_switch`, `text_delta`, `tool_start`, `tool_end`, `guardrail_trigger`, `approval_required`, `browser_session`, `preview_ready`, `run_complete`, `error`
- Fallback to polling via tRPC `agency.getRun` after 3 SSE failures in 60s window
- Manages run context (messages, active agent, activity events, tool calls, guardrails, pending approvals)
- Auto-reconnect with exponential backoff (1s → 2s → 4s)

**Backend (tRPC)**: `apps/web/server/routers/agency.ts` (2100+ lines)
- `agency.getById(agencyId)` — Load agency metadata + agents
- `agency.autoCreate(...)` — AI creator workflow (Celery task)
- `agency.autoCreateAnswer(...)` — Answer questions during auto-creation
- `agency.saveBuilder(...)` — Save agent/node/edge/tool configs
- `agency.getRunPreview(agencyId, runId)` — Fetch preview artifact + metadata
- `agency.commitPreview(...)` — Commit preview to library/external target
- `agency.submitApproval(...)` — User approves/rejects pending approval request
- Admin endpoints: `agency.adminToggleTenant`, `agency.adminKillRun`

**Backend (HTTP)**: Not in tRPC, raw HTTP endpoints
- `POST /api/v1/agency/stream` — SSE stream endpoint (Python bridge)
- `POST /api/agency/{agencyId}/cancel` — Cancel run immediately or after turn
- Feature flag check: `AGENCY_SWARM_ENABLED` (tenant-scoped, enforced server-side)

**Python backend**: `python-backend/app/api/agency_creator.py`
- `POST /api/v1/agency-creator/start` — Start discovery/interview phase
- `POST /api/v1/agency-creator/answer` — Answer interview questions
- `GET /api/v1/agency-creator/{task_id}` — Poll task status

**Python orchestrator**: `python-backend/app/services/agency_orchestrator.py` (600+ lines)
- `AgencyOrchestrator` — Graph walker for multi-node-type agencies
- `ExecutionContext` — Mutable state (input, results, knowledge, history, task_metadata, browser_sessions)
- Executes nodes in order: agent → supervisor (delegate to agency-swarm), router (branch), aggregator (merge), knowledge_base (retrieve), skill_call (execute), human_approval (wait), + conditionals/loops/transforms

---

## UI Layout & Components

### Header (Always Visible)

**Left side**:
- Back button (`<ChevronLeft>`) → navigate to `/agencies`
- Agency name (text, truncated)
- Agent count badge (`"3 agents"`)
- Active agent badge (when streaming): `"Active: AgentName"` with color-coded background
- Agency description (small gray text, when not streaming)

**Right side** (toolbar):
- Help button (`<HelpButton page="/agency">`)
- Browser Session button (if enabled via `agencyBrowserSessionUi` flag):
  - Label: `"Open Browser Session"` or `"Resume Browser Session"` (depends on artifact)
  - Icon: `<MonitorPlay>`
- Credits used (if > 0): `"3 credits"` with `<CreditCard>` icon
- Model selector (popover):
  - Button: `"Model"` or model name if override set
  - Popover content:
    - Label: `"Override Model"`
    - Help text: `"Use a different model for this conversation. Leave empty to use each agent's configured model."`
    - `<ModelPicker>` dropdown (all available models)
    - Reset button: `"Reset to agent defaults"` (if override active)
- Edit button → navigate to `/agencies/:id/edit`
- Panel toggle (show/hide activity sidebar on right)

### Main Content (Left Column)

#### Empty State (No Messages)

When `stream.messages.length === 0 && !stream.isStreaming`:

```
[Users icon in circle]

     Agency Name

   Agency description (if present)

         Team Members
[AgentName (entry)]  [Agent2]  [Agent3]

  Send a message to start the conversation
```

Agents display as color-coded pills with:
- Bot icon (`<Bot>`) or crown (`<Crown>`) if supervisor
- Name
- `"(entry)"` label if entry point

Color palette (deterministic hash):
- Blue, Green, Purple, Amber, Pink (rotated per agent name)

#### Browser Session Card (If Enabled & Active)

Shown when `agencyBrowserSessionEnabled && browserSessionArtifact`:

```
[Browser Session Summary Card Header]
  Primary action label (e.g., "Resume Browser Session")
  Last activity time

Quick Browser Instruction Section:
  Label: "QUICK BROWSER INSTRUCTION"
  Help: "Describe the outcome you want or the next browser step without leaving Agency Chat."

  [Skill Selector Dropdown]
    Placeholder: "Choose a browser skill"
    Options: BROWSER_SKILL_PRESETS
      - "Click, Find & Navigate"
      - "Compare & Decide"
      - "Explore & Discover"
      - "Research & Extract Info"
      - "Complete Forms"
      - ...

  [Textarea - min-h-[88px]]
    Placeholder: "Example: Find the right site, compare choices, and continue automatically."

  [Notification if present]
    "Instruction queued for this Browser Session."

  [Send Browser Instruction Button]
    Label: "Send Browser Instruction" (or "Queuing Instruction..." while busy)
    State: disabled if textarea empty or busy
```

**Skill selection logic**:
- If `browserCommandSkillSelectionMode === "auto"`: detect skill from draft text using `deriveBrowserSkillSelection()`
- If `"manual"`: user explicitly chose skill, preserve it until draft changes

**Browser command submit**:
- Creates `natural_language` command via `liveBrowser.sendCommand` mutation
- Sets `idempotencyKey` = `"agency-browser-cmd-${Date.now()}"`
- Text is wrapped with `buildBrowserInstruction({ goal, skillId })`
- Shows notice on success/error

#### Messages Area

**Scrolling**: Auto-scroll to bottom on new messages (ref to `scrollRef`)

**User message**:
```
                    [Blue pill, right-aligned]
                    User's text
```

**Assistant message**:
```
[Lighter pill, left-aligned]
[Badge: AgentName in color]
Agent's response (markdown, SafeMarkdown component)
[Typing cursor] ← if isStreaming
```

**Tool calls (inline)**:
- Shown inline after streaming assistant message
- Display: `"[Tool icon] ToolName — running"` with status indicator
- Updated as tool progresses (tool_start → tool_progress → tool_end)

**Tool calls (completed)**:
- Shown as separate section after all messages if `toolCalls.length > 0 && !isStreaming`
- Each tool shows: name, status, result (if success)

**Agent switch badges**:
```
      ← AgentName took over →
```
(centered, filtered from `activityEvents` where `type === "agent_switch"`)

**Guardrail alerts**:
```
[Shield icon] GuardrailName — blocked/warned
```
- Red for `action === "blocked"`
- Amber for `action === "warned"`

**Approval card** (if `pendingApproval`):
```
[ShieldCheck icon] Approval Required
Step Name
Summary text
[Approve Button] [Reject Button] [Provide Feedback Textarea]
```

**Browser session suggestion card**:
Shown when agency detect browser session launch needed:
- Suggestion message
- [Confirm Button] [Dismiss Button]

**Preview card**:
Shown when agency generates media/content:
- Preview type (image, video, text, deck)
- Content preview
- [Commit to Library Button] (if not already committed)
- [Dismiss Button]

**Error state**:
```
[Alert icon] Error
Error message text
[Retry Button]
```
- Shown when `stream.error` is set
- Retry uses last user message

**Polling fallback banner**:
```
[Info icon] Live streaming unavailable. Using polling updates.
[Retry SSE Button]
```

### Input Bar (Bottom)

**Creator fee warning** (if `agency.creatorFeeCredits > 0`):
```
[CreditCard icon] Creator fee: 5 credits per successful run
```

**Model override warning** (if `modelOverride` set):
```
[Settings icon] Using model override: ModelName
[Clear link]
```

**Run options panel** (if `recipientAgent || additionalInstructions || runOptionsOpen`):
```
┌─ Run Options ──────────────────────────────────────── [X close] ─┐
│                                                                   │
│ Target Agent (if multiple agents):                             │
│ [Dropdown: Auto (entry point) / AgentName1 / AgentName2]       │
│                                                                   │
│ Additional Instructions:                                        │
│ [Textarea - min-h-[32px], max-h-[80px]]                        │
│ Placeholder: "Per-run instruction override (optional)"          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Message input**:
```
[Settings icon - Run Options toggle] [Textarea - flexible height] [Send Button]
```

- Textarea:
  - Placeholder: `"Message ${agency.name}… (Enter to send, Shift+Enter for new line)"`
  - Min height: 44px (1 row)
  - Max height: 160px (auto-expand)
  - Disabled while `stream.isStreaming`
  - Trigger send on `Enter` key (not `Shift+Enter`)

- Send button:
  - Icon: `<Send>` or `<Loader2 animate-spin>` while streaming
  - Disabled if input empty or streaming

---

## Message Flow & Streaming

### Initial Connection

**User sends message**:
1. Click send or press Enter
2. `handleSend()` is called
3. If `agencyBrowserSessionEnabled`, detect if browser session should be suggested
4. Add user message to UI immediately
5. Call `stream.connect(params)`

**Connect parameters**:
```typescript
{
  agencyId: string;
  conversationId?: string;  // optional, for session grouping
  message: string;
  modelOverride?: string;   // from model picker
  recipientAgent?: string;  // from run options dropdown
  fileIds?: string[];       // attachments (not UI yet)
  additionalInstructions?: string;  // per-run override
}
```

### SSE Event Stream

**HTTP POST** to `/api/v1/agency/stream`:
```json
{
  "agencyId": "...",
  "conversationId": "optional",
  "message": "user message",
  "modelOverride": "gpt-4",
  "recipientAgent": "ResearchAgent",
  "additionalInstructions": "Focus on technical aspects"
}
```

**Server-sent events** (SSE format):
```
event: meta
id: event-1
data: {"runId": "run-123-abc", ...}

event: agent_switch
data: {"to": "AgentName", ...}

event: text_delta
data: {"delta": "partial text", "agentName": "AgentName"}

event: tool_start
data: {"toolCallId": "tc-1", "toolName": "web_search", "agentName": "Agent1"}

event: tool_progress
data: {"toolCallId": "tc-1", "message": "Searching for results..."}

event: tool_end
data: {"toolCallId": "tc-1", "status": "success", "result": "..."}

event: guardrail_trigger
data: {"guardrailName": "Profanity Filter", "action": "blocked", "type": "input"}

event: approval_required
data: {"approvalKey": "...", "step": "Publish to Twitter?", "summary": "...", "agentName": "Agent1"}

event: browser_session
data: {"sessionId": "...", "summary": {...}, "launchContext": {...}}

event: preview_ready
data: {"run_id": "...", "preview_artifact_ids": ["..."], "intent": "...", "summary": "..."}

event: run_complete
data: {"creditsUsed": 3}

event: error
data: {"message": "Agent execution failed: ..."}
```

**Event handling in `handleSSEEvent(type, rawData, runCounter)`**:

| Event | Handler | State Changes |
|-------|---------|---|
| `meta` / `run_started` | Extract `runId` | `setIsStreaming(true)` |
| `agent_switch` | Update active agent | Finalize previous message, add `agent_switch` activity |
| `text_delta` / `token` | Accumulate text | Upsert or create streaming message with `isStreaming: true` |
| `tool_start` | Add tool call | `setToolCalls` + activity |
| `tool_progress` | Update tool | Add progress message to tool call + activity |
| `tool_end` | Finish tool | Update tool status, result, endedAt + activity |
| `tool_call` | Log tool invocation | Add to `activityEvents` |
| `tool_result` | Log tool result | Add to `activityEvents` + duration |
| `guardrail_trigger` | Record guardrail | Add to `guardrailEvents` + activity |
| `approval_required` | Pause execution | Set `pendingApproval` + activity |
| `browser_session` | Store session | Call `onBrowserSession` callback |
| `preview_ready` | Fetch preview | Trigger `utils.agency.getRunPreview.fetch()` |
| `run_complete` / `run_finished` | End stream | Set credits, finalize messages, `setIsStreaming(false)` |
| `error` / `run_error` | Handle error | Set error message, `setIsStreaming(false)` |

### SSE Resilience

**Failure handling**:
- If SSE connection drops, attempt reconnect with exponential backoff:
  - 1st fail: wait 1s, reconnect
  - 2nd fail: wait 2s, reconnect
  - 3rd fail: wait 4s, reconnect
  - 3+ fails in 60s window: **switch to polling mode**

**Polling fallback** (`isPollingFallback: true`):
- Shows banner: `"Live streaming unavailable. Using polling updates."`
- Consumer (parent component) can poll via `tRPC.agency.getRun()`
- Not automatically triggered by stream hook (parent must handle)

**Reconnection with Last-Event-ID**:
- Tracks `lastEventIdRef.current` from SSE event IDs
- On reconnect, sends `Last-Event-ID` header to resume from last event
- Server should replay events after that ID

**Cancellation**:
- `stream.cancel("immediate")` → abort SSE fetch immediately
- `stream.cancel("after_turn")` → POST to `/api/agency/{agencyId}/cancel` with mode
- Server gracefully stops execution after current agent turn

---

## Run Options

### Target Agent

**Availability**: Only shown if `agency.agents.length > 1`

**Options**:
- `"Auto (entry point)"` — Routes to agent marked `isEntryPoint: true` (or first agent)
- Agent name for each agent in agency (dropdown item per agent)

**Effect**:
- Sends `recipientAgent: agentName` in stream request
- Python orchestrator routes initial message to that agent instead of entry point

### Additional Instructions

**Placeholder**: `"Per-run instruction override (optional)"`

**Effect**:
- Sends `additionalInstructions: text` in stream request
- Merged into agent's system prompt (prepended or injected per agent config)
- Useful for quick tweaks without editing agency

### Model Override

**Popover (not in run options panel)**:

**Label**: "Override Model"

**Help text**: `"Use a different model for this conversation. Leave empty to use each agent's configured model."`

**Effect**:
- Sends `modelOverride: modelId` in stream request
- Each agent uses this model instead of their configured model
- Visual badge in input bar shows current override

**Reset button**: `"Reset to agent defaults"`

---

## Activity Panel (Sidebar, Right)

**Visibility**:
- Toggle via button in header
- Defaults to open on screens >= 1024px
- Always hidden on mobile (lg:block)

**Content**:

```
[Activity icon] Agent Activity [Loading spinner if streaming] [Close button]

──────────────────────────────────────────

Active: [AgentName badge with color]

──────────────────────────────────────────

[ScrollArea]

Agent activity will appear here during a run.

[Activity Timeline]
├─ [ArrowRight icon - blue] Agent1 switched to active
├─ [Wrench icon - amber] Agent1 called web_search
├─ [Activity icon - green] Agent1 result from web_search (2.4s)
├─ [ArrowRight icon - blue] Agent2 switched to active
├─ [Wrench icon - amber] Agent2 called summarizer
└─ [Activity icon - green] Agent2 result from summarizer (1.2s)
```

**Activity types**:
- `agent_switch`: `"[AgentName] switched to active"`
- `tool_call`: `"[AgentName] called [ToolName]"`
- `tool_result`: `"[AgentName] result from [ToolName] ([duration]s)"`
- `handoff`: `"[AgentName] handed off"`
- `tool_start`, `tool_end`, `tool_progress`, `guardrail_trigger`, `approval_required`: shown in activity log

---

## Tool Visualization

### Inline Tool Calls

Shown **during streaming** (only after streaming message):
```
[After streaming assistant message]
  [Wrench icon] web_search — running
  [Wrench icon] summarizer — completed
```

### Completed Tool Calls Section

Shown **after streaming ends** (if `toolCalls.length > 0`):
```
[Wrench icon] web_search
  Status: success
  Result: "Found 5 sources..."

[Wrench icon] file_reader
  Status: error
  Error: "File not found"
```

**Tool call state**:
```typescript
{
  toolCallId: string;
  toolName: string;
  agentName: string;
  status: "running" | "success" | "error";
  progressMessage?: string;
  result?: string;
  startedAt: number;
  endedAt?: number;
}
```

---

## Guardrails

### Guardrail Events Display

```
[Shield with Alert icon] GuardrailName — blocked
[Shield with Check icon] GuardrailName — warned
```

**Colors**:
- **Blocked** (red): border-red-200, bg-red-50, text-red-700
- **Warned** (amber): border-amber-200, bg-amber-50, text-amber-700

**Source**: From `event.action` field in `guardrail_trigger` SSE event

---

## Approval Flow

### Pending Approval Card

Shown when `stream.pendingApproval !== null`:

```
[ShieldCheck icon] Approval Required
  Step: "Publish to Twitter?"
  Summary: "Agent wants to post: 'Check out this...' to @company_twitter"
  From: Agent1

  [Approve Button] [Reject Button]

  [Reject clicked?]
  [Textarea - Rejection feedback (optional)]
  [Reject Button] [Cancel Button]
```

### Approval Submission

**Currently**: Hooked up but not fully implemented (TODO comment in code):
```typescript
onApprovalSubmit={(_approvalKey, _approved, _feedback) => {
  // TODO: Wire to trpc.agency.submitApproval when section 12 is implemented
}}
```

**Expected flow** (when implemented):
1. User clicks Approve/Reject
2. Call `trpc.agency.submitApproval({ runId, approvalKey, decision, feedback? })`
3. Server unpauses execution
4. Show decision state: "Approved" or "Rejected" with green/red icon

---

## Browser Session Feature

### Feature Flag

`tenantFlags?.agencyBrowserSessionUi` controls visibility

### Opening a Browser Session

**Entry points**:
1. Header button: `"Open Browser Session"`
2. Browser session suggestion card (auto-detected)

**Logic**:
- If session already exists in `browserSessionArtifact`: navigate to session page
- Else: create new session via `liveBrowser.createSession` mutation
  - `sourceType: "agency"`
  - `sourceId: agencyId`
  - `mode: "observe"`
  - `executionIntent`: optional (prompt + skillId)

**After creation**:
- Persist artifact to sessionStorage
- Navigate to browser session page with return path: `/agencies/:id?browserSessionId=:sessionId`

### Browser Session Card

**Shown when**: `agencyBrowserSessionEnabled && browserSessionArtifact`

**Content**:
- Summary card header (last activity time, action label)
- Quick instruction section (skill picker + textarea + send button)
- [Open in Full Browser Session Button]

**Quick instruction flow**:
1. Type goal in textarea
2. Skill auto-detected from text (if `selectionMode === "auto"`)
3. User can manually override skill selection
4. Click "Send Browser Instruction"
5. Creates natural_language command with idempotency key
6. Shows success/error notice

### Browser Suggestion Card

Auto-detected when agency thinks user needs browser:

```
[Card]
  "It looks like you want to research. Open a browser session?"
  [Yes, research in browser] [Dismiss]
```

**Detection logic**: `detectBrowserSessionLaunchSuggestion({ message, originSurface: "agency", sourceId: agencyId })`

---

## Preview Generation & Commits

### Preview Ready Event

When agency generates media/content, SSE emits:
```
event: preview_ready
data: {
  "run_id": "run-123",
  "preview_artifact_ids": ["artifact-1", "artifact-2"],
  "intent": "research_guide",
  "summary": "A comprehensive guide on..."
}
```

### Preview Fetching

Frontend fetches full preview via:
```typescript
utils.agency.getRunPreview.fetch({ agencyId, runId })
  .then(result => {
    setAgencyPreview({
      previewType: result.preview.previewType,
      artifactId: result.preview.artifactId,
      intent: result.preview.intent,
      lifecycleState: result.preview.lifecycleState,
      summaryText: result.preview.summaryText,
      provenance: result.preview.provenance,
      commit: result.preview.commit,
      data: result.preview.data,
      runId,
    });
  })
```

### Preview Card Display

`<AgencyPreviewCard>` renders:
- Preview type (image, video, text, deck)
- Content preview (thumbnail or excerpt)
- [Commit to Library Button] (if not already committed)
- [Dismiss Button]

### Committing Preview

User clicks "Commit" → calls `agency.commitPreview`:

```typescript
trpc.agency.commitPreview.mutate({
  agencyId,
  runId,
  artifactId,
  targetType: "library" | "presentation" | "external",
  targetId: "optional external target ID",
  commitToken: "...commitment token...",
})
```

**On success**:
- Update preview card: `lifecycleState: "committed"`
- Show target type/ID
- Disable commit button

---

## Error Handling

### Stream Errors

**Conditions**:
- HTTP error on initial request: `setError(err.error || "HTTP XXX")`
- No response body: `setError("No response body")`
- SSE failure (3+ in 60s): `setIsPollingFallback(true)`

### Error Display

```
[AlertCircle icon] Error
Error message text
[Retry Button]
```

- Retry button disabled while streaming or if no messages
- Retry uses last user message

### Polling Fallback Banner

```
[Info icon] Live streaming unavailable. Using polling updates.
[Retry SSE Button]
```

---

## Credits & Costs

### Credit Display

Shown in header if `stream.creditsUsed > 0`:
```
[CreditCard icon] 3 credits
```

### Creator Fee Warning

Shown in input bar if `agency.creatorFeeCredits > 0`:
```
[CreditCard icon] Creator fee: 5 credits per successful run
```

---

## Edge Cases & States

### Loading States

- **Initial load**: Full-page loader (centered `<Loader2 animate-spin>`)
- **Agency not found**: Centered message "Agency not found"
- **Preview loading**: Skeleton loader (pulse animation with placeholder boxes)

### Streaming Indicators

- **Active agent badge**: `"Active: AgentName"` in header
- **Typing cursor**: Blinking cursor at end of streaming message: `height-3 width-1 animate-pulse`
- **Activity spinner**: In sidebar when `isStreaming`
- **Send button loader**: `<Loader2 animate-spin>` while streaming

### Disabled States

- Send button disabled if: input empty OR streaming
- Browser command button disabled if: textarea empty OR busy
- Run options can't be closed if recipientAgent or additionalInstructions set
- Approval buttons disabled until user makes decision

---

## Keyboard Interactions

- **Enter**: Send message (if not streaming)
- **Shift+Enter**: New line in textarea
- **Escape**: ? (not explicitly handled, but component could add)

---

## Responsive Design

| Screen | Behavior |
|--------|----------|
| Mobile | Activity panel hidden, header icons adjusted, input full-width |
| Tablet | Activity panel toggleable, input full-width |
| Desktop (≥1024px) | Activity panel visible by default |

---

## Accessibility Features

- **Semantic HTML**: Button, Textarea, Select, etc.
- **ARIA labels**: Help button, panel toggle
- **Color contrast**: Badge colors meet WCAG AA (verified in Tailwind utility classes)
- **Icon + text**: Icons paired with text labels
- **Keyboard navigation**: Buttons, dropdowns, textareas all keyboard-accessible (Radix UI)
- **Disabled states**: Visually indicated (opacity, cursor)

---

## Critical Code Locations

### Frontend UI
- Main page: `apps/web/client/src/pages/AgencyChat.tsx` (977 lines)
- Stream hook: `apps/web/client/src/hooks/useAgencyStream.ts` (727 lines)
- Chat stream renderer: `apps/web/client/src/components/agency/AgencyChatStream.tsx` (250+ lines)
- Activity panel: `apps/web/client/src/components/agency/AgencyActivityPanel.tsx` (117 lines)
- Approval card: `apps/web/client/src/components/agency/ApprovalCard.tsx` (120+ lines)
- Model picker: `apps/web/client/src/components/agency/ModelPicker.tsx`
- Browser session UI: `apps/web/client/src/components/browser-session/`

### Backend tRPC
- Agency router: `apps/web/server/routers/agency.ts` (2100+ lines)
  - Model/feature selection: lines 1-100
  - Conversation procedures: lines 1000-1500 (getById, getRun, etc.)
  - Preview procedures: lines 1700-2000 (getRunPreview, commitPreview)
  - Admin procedures: lines 2046-2100

### HTTP Endpoints
- Stream handler: Not in main codebase (Python bridge via agencyBridge service)
- agencyBridge: `apps/web/server/services/agencyBridge.ts` (HTTP client to Python)
- Feature flag check: `server/services/featureFlags.ts`

### Python Backend
- Agency orchestrator: `python-backend/app/services/agency_orchestrator.py` (600+ lines)
  - ExecutionContext class: lines 66-129
  - Node dispatch: lines 164+ (match statement for node types)
- Agency creator (AI auto-create): `python-backend/app/api/agency_creator.py` (164 lines)

---

## Unimplemented / In Progress

1. **Approval submission**: Hook exists but no tRPC call wired yet (Section 12 TODO)
2. **File attachments**: `fileIds` parameter in stream params but no UI for upload
3. **Conversation history**: `conversationId` parameter accepted but not used to fetch history
4. **Polling fallback**: Hook detects it (`isPollingFallback`) but parent doesn't auto-poll
5. **Browser session feature flag check**: Frontend checks `tenantFlags` but not enforced globally

---

## Summary

Agency Chat is a feature-rich conversational interface for multi-agent systems with:

**Strong features**:
- Real-time streaming with fallback
- Rich activity visualization (agents, tools, guardrails, approvals)
- Model override per conversation
- Per-run instruction injection
- Browser session integration (create, resume, quick commands)
- Preview generation & library commits
- Graceful error handling with retry

**Design patterns**:
- SSE + polling fallback for resilience
- Activity events as structured log for debugging
- Run context passed through orchestrator (mutable ExecutionContext)
- Color-coded agents for visual clarity
- Modular component structure (stream handler + renderers)

**Integration points**:
- tRPC for CRUD operations
- HTTP SSE for real-time streaming
- Python FastAPI for orchestration
- Redis for session state (BrowserSession)
- Browser session service for browser automation

