# Section 12: Frontend — Chat Shell Migration & Sidebar Redesign

## Overview

Transforms `/chat` from a single-conversation shell into a unified orchestration shell. Migrates the primary state from `selectedConversationId: number | null` to `ActiveThreadRef` union type. Redesigns the sidebar with sections for Chats, Teams, Auto Sessions, Inbox, and Agency Jobs.

**Depends on:** Section 10 (tRPC routers for team/room data)
**Blocks:** Section 13 (team builder), Section 14 (room monitor)

**Files to modify:**
- `apps/web/client/src/pages/Chat.tsx` — primary state migration
- `apps/web/client/src/components/chat/ChatSidebar.tsx` — redesign with sections
- `apps/web/client/src/components/chat/ChatView.tsx` — thread-type-aware rendering

**Files to create:**
- `apps/web/client/src/lib/threadRef.ts` — ActiveThreadRef type + utilities
- `apps/web/client/src/components/chat/ThreadRouter.tsx` — routes to correct view per thread kind
- `apps/web/client/src/components/chat/UnifiedSidebar.tsx` — new sidebar with sections
- `apps/web/client/src/components/chat/CreationMenu.tsx` — New Chat / New Team Chat / etc.
- `apps/web/client/src/__tests__/threadRef.test.ts`
- `apps/web/client/src/components/chat/__tests__/UnifiedSidebar.test.tsx`

---

## Tests (Write First)

```typescript
// apps/web/client/src/__tests__/threadRef.test.ts
describe("ActiveThreadRef", () => {
  it("parses 'chat:123' into { kind: 'chat', id: 123 }");
  it("parses 'team_room:uuid' into { kind: 'team_room', id: 'uuid' }");
  it("parses 'agency:a1:c2' into { kind: 'agency_conversation', ... }");
  it("parses 'inbox:task_123' into { kind: 'external_inbox_task', id: 'task_123' }");
  it("serializes back to query string format");
  it("returns null for invalid format");
});

// apps/web/client/src/components/chat/__tests__/UnifiedSidebar.test.tsx
describe("UnifiedSidebar", () => {
  it("renders Chats section with existing conversations");
  it("renders Teams section with active team rooms");
  it("shows badges for active runs and pending approvals");
  it("renders creation menu with all 4 options");
  it("selecting a team room calls setActiveThread with team_room kind");
  it("old chat items still work with chat kind");
});
```

---

## Implementation Details

### `ActiveThreadRef` type (`lib/threadRef.ts`)

```typescript
export type ActiveThreadRef =
  | { kind: "chat"; id: number }
  | { kind: "team_room"; id: string }
  | { kind: "agency_conversation"; id: string; agencyId: string }
  | { kind: "external_inbox_task"; id: string };

export function parseThreadRef(str: string): ActiveThreadRef | null;
export function serializeThreadRef(ref: ActiveThreadRef): string;
```

URL format: `/chat?thread=chat:123`, `/chat?thread=team_room:room_uuid`, etc.
Optional params: `panel=activity`, `run=run_123`, `view=summary`.

### Chat.tsx State Migration

Replace `selectedConversationId: number | null` with `activeThread: ActiveThreadRef | null`.

Backward compatibility: if URL has old `?c=123` format, convert to `{ kind: "chat", id: 123 }`. Existing chat logic remains unchanged when `activeThread.kind === "chat"`.

### ThreadRouter Component

Renders the correct center pane based on `activeThread.kind`:
- `"chat"` → existing `<ChatView />` (no changes)
- `"team_room"` → `<TeamRoomView />` (Section 14)
- `"agency_conversation"` → existing `<AgencyChat />` (link out)
- `"external_inbox_task"` → `<InboxTaskView />` (Section 16)

**`InboxTaskView` component** (stub in this section, full implementation in section-16):

Created at `apps/web/client/src/components/orchestrator/InboxTaskView.tsx` as a minimal stub:
- Displays task title, source, objective, status
- Shows approve/reject buttons for awaiting_review tasks
- Shows "Materialized → View Room" link for materialized tasks
- Calls `externalIntake.externalTaskInbox.get` for task data
- Calls `externalIntake.externalTaskInbox.approve` / `.reject` mutations

Section-16 fills in the full implementation with attachment display, routing decision preview, and source trust tier indicator.

### UnifiedSidebar Component

Replaces `ChatSidebar.tsx` with sectioned navigation:

```
┌─────────────────────────┐
│ [+ New ▾]               │
├─────────────────────────┤
│ 💬 Chats                │
│   Recent Chat 1         │
│   Recent Chat 2         │
├─────────────────────────┤
│ 👥 Teams         (3) 🔴 │
│   Marketing Room  ▶     │
│   Research Desk   ◻     │
├─────────────────────────┤
│ ⚡ Auto Sessions  (1)    │
│   Competitor Analysis ▶ │
├─────────────────────────┤
│ 📥 Inbox          (2)   │
│   External Task #1      │
├─────────────────────────┤
│ 🏢 Agency Jobs          │
│   Content Agency        │
└─────────────────────────┘
```

Each section collapses/expands. Badges show: ▶ active run, 🔴 pending approval, (N) unread count.

Data sources: `trpc.teamRoom.list`, `trpc.chat.getConversations` (existing), `trpc.externalTaskInbox.list`.

### CreationMenu Component

Dropdown from the "+ New" button:
- **New Chat** — existing behavior
- **New Team Chat** — opens team selector → creates team_room → navigates
- **New Automatic Team Chat** — opens team selector + objective prompt → creates auto-team room
- **New Team** — navigates to team builder (Section 13)

### Header Integration

Header varies by thread kind:
- `chat`: existing (title, model selector, persona indicator)
- `team_room`: team name + member chips + room type badge + visibility mode switch + run status + approvals badge
- `agency_conversation`: existing agency header
- `external_inbox_task`: task title + source + status + approve/reject buttons

### Header Variants Per Thread Type (from spec §16.8.7)

- **Direct Chat**: Keep existing (title, model selector, persona indicator)
- **Team Room**: team name + member avatar chips + room type badge + visibility mode switch + summary mode switch + run status indicator + approvals badge count
- **Automatic Team Session**: current run status + stop policy summary + last active assistant + summary freshness state

### Composer Mode Selector (from spec §16.8.8)

For team rooms, the composer gains:
- Recipient selector: All Members / specific assistant / subgroup
- Mode selector: Reply Now / Let Team Discuss / Request Review
- Optional run instructions: constraints, approval hints, deadline

Composer behavior by thread type:
- direct chat: current simple behavior
- team room: recipient-aware + mode selector
- automatic room: orchestration control
- inbox task: approve/reject/materialize controls

### Empty State Redesign (from spec §16.8.11)

Replace current "Start New Chat" + "Explore Agencies" with:
- Start New Chat
- Start Team Chat
- Start Automatic Team Session
- Review External Inbox
- Explore Teams

### Brainstorm Compatibility API (from spec §17.9)

Old brainstorm API calls (`POST /api/conversations` with brainstormPartnerModel) are intercepted and redirected to create a "Debate" discussion preset room/run. This ensures backward compatibility for any external integrations.

### Right Panel Extension

Add new panel modes (alongside existing memory/skills/artifacts/schedule/canvas):
- `participants` — assistant identity, status, assigned task (for team rooms)
- `activity` — event stream (for team rooms with active runs)
- `approvals` — pending checkpoints
- `summary` — latest run summary

### Routing

Update Wouter route in App.tsx: `/chat` stays the same, but the Chat page reads `?thread=` param to set `activeThread`. Deep links preserved.

### Backward Compatibility

- Existing direct chats remain readable and usable (kind="chat" path unchanged)
- Current artifacts continue rendering
- Browser session integration keeps working
- Skills panel remains available for direct chat
- Old `?c=123` URLs auto-convert to `?thread=chat:123`
