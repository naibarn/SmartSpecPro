---
name: Teams Feature UI Completeness Audit
description: Comprehensive gap analysis comparing help documentation promises vs frontend/backend implementation
type: project
---

# Teams Feature UI Completeness Audit

**Date**: 2026-03-18
**Status**: AUDIT COMPLETE — 10 Features audited, 3 CRITICAL GAPS identified, 2 MEDIUM gaps

---

## Executive Summary

The Teams feature is **80% complete** with functional CRUD operations and room management. However, there are **3 CRITICAL gaps** that the help documentation promises but the frontend does NOT implement:

1. **Add Member to existing team** (Help 51-53) — **MISSING**: No "Add Member" button/dialog in team detail page
2. **Team Templates** (Help 123-134) — **MISSING**: Backend endpoint exists but frontend has NO template picker UI
3. **Activity Panel** (Help 107-114) — **PARTIAL**: RunMonitorPanel exists but is NOT integrated into TeamRoomView

2 additional MEDIUM gaps:
4. **Member Management UI** (Help 49-65) — **PARTIAL**: Can't edit/remove members from existing team (only during creation)
5. **Progress Indicator** (Help 107-114) — **MISSING**: No progress bar for subtask completion

---

## Detailed Gap Analysis

### 1. CREATE TEAM

**Help Doc Reference**: "Creating a Team" section (lines 40-47)

**Help Promise**:
```
1. Navigate to Teams in the main menu.
2. Click New Team.
3. Enter name and optional description.
4. Click Create.
```

**Backend Status**: ✅ COMPLETE
- `team.create` mutation: `apps/web/server/routers/team.ts` (lines 28-45)
- Validates: name (required), members (min 1, max 10), exactly 1 lead
- Service: `teamService.createTeam()` (creates agency + team + profiles in transaction)

**Frontend Status**: ✅ COMPLETE
- New Team dialog: `Teams.tsx` (lines 465-590)
- Fields: name, description (optional), member picker with lead selection
- Recently verified working (per git history: `feat(orchestrator): security hardening...`)

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 2. ADD MEMBER TO EXISTING TEAM

**Help Doc Reference**: "Team Members → Adding Members" (lines 51-56)

**Help Promise**:
```
Click "Add Member" in the team detail page. Each member is a persona...
Assign: Persona (dropdown), Role (Lead or Member).
```

**Backend Status**: ✅ ENDPOINT EXISTS
- `team.updateMember` mutation: `apps/web/server/routers/team.ts` (lines 94-112)
- Updates display name, role, instructions, model, lead status, etc.
- **LIMITATION**: Updates existing members only; no "add new member" endpoint

**Frontend Status**: ❌ **MISSING**
- Teams.tsx has NO "Add Member" button in team detail view
- Member picker ONLY available during team creation (lines 502-563)
- When viewing existing team: shows name, description, Archive button — NO member management
- Cannot view, edit, or add members to existing team after creation

**Verdict**: ❌ **CRITICAL GAP** — Help promises "Click Add Member in team detail page" but UI doesn't exist

**Impact**: Users can create teams with initial members but cannot modify team membership after creation.

---

### 3. TEAM TEMPLATES

**Help Doc Reference**: "Templates" section (lines 123-134)

**Help Promise**:
```
Use pre-built team template:
- Research Trio: One researcher, one analyst, one writer
- Content Review: One drafter, one editor, one fact-checker
- Brainstorm Panel: Three members with divergent styles, one synthesizer lead
- Technical Review: One implementer, one code reviewer, one documentation writer

"Select a template when creating a new team to pre-populate member roles."
```

**Backend Status**: ✅ PARTIAL
- Schema: `assistantTeamTemplates` table (drizzle/schema.ts:5883-5897)
- Endpoint: `team.cloneFromTemplate()` mutation (team.ts:47-61)
- Service: `createFromTemplate()` function (teamService.ts:237-288)
- **LIMITATION**: No seeded templates with the names from help docs
- Database template search: Returns empty (no Research Trio, Content Review, Brainstorm Panel, Technical Review found)

**Frontend Status**: ❌ **MISSING**
- Teams.tsx has NO template picker in New Team dialog
- Dialog only has: name, description, manual member selection
- No "Select Template" dropdown or template gallery
- No navigation to template list

**Verdict**: ❌ **CRITICAL GAP** — Backend ready but frontend + seeded templates missing

**Implementation Notes**:
- Backend can clone templates (service ready)
- Need: (1) Seed 4 predefined templates, (2) Add template picker dropdown to New Team dialog, (3) Show template member roster

---

### 4. TEAM ROOM CREATION

**Help Doc Reference**: "Team Rooms → Creating a Room" (lines 71-81)

**Help Promise**:
```
1. Select a team on the Teams page.
2. Click "New Room" in the top bar.
3. Choose Room Type: Team, Direct, Auto Team, or Job Review.
4. Describe Objective/Goal.
5. Click Create Room.
```

**Backend Status**: ✅ COMPLETE
- `teamRoom.create` mutation: `teamRoom.ts` (lines 12-28)
- Accepts: teamId, roomType, goalPrompt, projectId (optional)
- Service: `roomService.createRoom()`

**Frontend Status**: ✅ COMPLETE
- New Room dialog: `Teams.tsx` (lines 408-463)
- Room type selector with 4 options (lines 417-434)
- Goal prompt textarea (lines 436-447)
- Wired to API and invalidates room list on success

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 5. TEAM ROOM CONVERSATION / MESSAGING

**Help Doc Reference**: "Sending Messages" (lines 90-95)

**Help Promise**:
```
Inside a room, use the message input at the bottom.
Messages go to all agents by default.
Target a specific agent using the recipient selector.
System messages appear with distinct style.
```

**Backend Status**: ✅ COMPLETE
- `teamRoom.sendMessage` mutation: `teamRoom.ts` (lines 39-57)
- Supports: recipientType (all, assistant, subgroup, user), recipientAssistantId

**Frontend Status**: ✅ COMPLETE
- TeamRoomView component: `components/orchestrator/TeamRoomView.tsx` (lines 52-225)
- Message input at bottom (lines 204-222)
- Recipient selector available (recipientAssistantId in mutation)
- Multi-actor message rendering with avatars, timestamps, visibility badges
- Auto-scroll and keyboard shortcuts (Enter to send)

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 6. START RUN / STOP RUN

**Help Doc Reference**: "Starting a Run" (lines 97-105), "Monitoring a Run" (lines 107-115)

**Help Promise**:
```
1. Open a room and click "Start Run".
2. Enter your prompt.
3. Click Send.

Control: Click "Stop Run" to interrupt.
```

**Backend Status**: ✅ COMPLETE
- `teamRun.start` mutation: `teamRun.ts` (lines 23-37)
- Accepts: roomId, executionMode, objective, stopPolicy
- `teamRun.stop` mutation: (lines 53-61)
- `teamRun.pause` and `teamRun.resume` also available

**Frontend Status**: ✅ COMPLETE
- TeamRoomView header (lines 130-144): Start/Pause/Stop buttons
- Conditional rendering based on runId presence
- Buttons styled and functional

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 7. ACTIVITY PANEL

**Help Doc Reference**: "Monitoring a Run" (lines 107-114)

**Help Promise**:
```
"The Activity panel shows each agent's current status: idle, thinking, or responding."
"A progress indicator shows how many subtasks are complete vs pending."
Messages appear in real time via live streaming (SSE).
```

**Backend Status**: ✅ COMPLETE
- Event streaming via `useRunStream()` hook
- RunStreamEvent type with actorType, eventType, visibility, data fields
- Events filtered by visibility (transparent, milestone, summary, private_internal)

**Frontend Status**: ⚠️ **PARTIAL**
- RunMonitorPanel component EXISTS (components/orchestrator/RunMonitorPanel.tsx)
  - Shows agent roster with turn counts and token usage
  - Event timeline with 200-event buffer
  - Run controls (pause, resume, stop)
  - Status indicator: running, paused, completed, stopped, failed
  - **BUT**: NOT INTEGRATED into TeamRoomView

- TeamRoomView DOES show agent status via SSE (lines 119-128: "Connected" / "Disconnected")
  - Renders messages with actor avatars and timestamps
  - Filters by visibility
  - **MISSING**: No explicit activity panel or progress indicator UI

**Verdict**: ⚠️ **MEDIUM GAP** — RunMonitorPanel exists separately but not integrated; TeamRoomView has basic status but no activity/progress UI

**Implementation Notes**:
- RunMonitorPanel could be added to right sidebar of TeamRoomView
- Need progress bar showing subtask completion (not currently tracked)
- Current UI shows messages only; doesn't summarize agent status separately

---

### 8. CHAT SIDEBAR TEAM ROOMS SECTION

**Help Doc Reference**: "Finding Teams → Chat Sidebar" (lines 36-38)

**Help Promise**:
```
"At the bottom of the Chat sidebar, there's a collapsible Team Rooms section.
Click to expand and see your teams.
Clicking a team navigates you to the Teams page."
```

**Backend Status**: ✅ COMPLETE
- `team.list` query: `team.ts` (lines 72-84)
- Returns team summaries with member/room counts

**Frontend Status**: ✅ COMPLETE
- TeamRoomsSidebarSection component: `ChatSidebar.tsx` (lines 628-669)
- Collapsible "Team Rooms" section at bottom (line 530)
- Expands to show team list (limit 10)
- Click navigates to `/teams/:teamId`

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 9. TEAM ARCHIVING

**Help Doc Reference**: "Archiving a Team" (lines 136-138)

**Help Promise**:
```
"Click the Archive button on the team's top bar.
Archived teams are hidden from the default list but can be recovered by an admin."
```

**Backend Status**: ✅ COMPLETE
- `team.archive` mutation: `team.ts` (lines 86-92)
- Sets team and backing agency status to "archived"

**Frontend Status**: ✅ COMPLETE
- Archive button in top bar: `Teams.tsx` (lines 315-321)
- Wired to mutation, invalidates team list on success

**Verdict**: ✅ WORKING AS DOCUMENTED

---

### 10. MEMBER MANAGEMENT (VIEW / EDIT / REMOVE)

**Help Doc Reference**: "Team Members" section (lines 49-65)

**Help Promise** (implicit):
```
Roles: Lead (one, coordinates team) vs Member (performs subtasks).
Each member is a persona with instructions and capabilities.
```

**Backend Status**: ✅ PARTIAL
- `team.updateMember` mutation: Update any member attribute
- **MISSING**: No deleteMember endpoint
- **MISSING**: No getMember / getTeamMembers endpoint (could use team.get which includes members)

**Frontend Status**: ❌ **MISSING**
- No member detail view
- No member edit dialog for existing team
- No member removal button
- Cannot view/edit member roles, instructions, or metadata after team creation
- Only option: create team with members or update via direct mutation (not exposed in UI)

**Verdict**: ❌ **MEDIUM GAP** — Team members visible during creation only; no management UI for existing teams

**Implementation Notes**:
- team.get already returns team with members (teamService.ts:403-430)
- Could add member list view + edit/delete dialogs to team detail page
- Need to add deleteMember mutation to team router

---

## Summary Table

| Feature | Help Doc Section | Backend | Frontend | Gap Level | Fix Effort |
|---------|------------------|---------|----------|-----------|-----------|
| Create Team | 40-47 | ✅ | ✅ | None | — |
| Add Member (existing) | 51-56 | ⚠️ (update only) | ❌ | CRITICAL | 4h |
| Team Templates | 123-134 | ✅ | ❌ | CRITICAL | 6h |
| Create Room | 71-81 | ✅ | ✅ | None | — |
| Send Messages | 90-95 | ✅ | ✅ | None | — |
| Start/Stop Run | 97-115 | ✅ | ✅ | None | — |
| Activity Panel | 107-114 | ✅ | ⚠️ (partial) | MEDIUM | 6h |
| Chat Sidebar Teams | 36-38 | ✅ | ✅ | None | — |
| Archive Team | 136-138 | ✅ | ✅ | None | — |
| Member Management | 49-65 | ⚠️ (update only) | ❌ | MEDIUM | 5h |

**Total Gaps**: 5 (3 CRITICAL, 2 MEDIUM)
**Total Fix Estimate**: 21 hours

---

## Critical Path (Priority Order)

### Phase 1: Enable "Add Member" (4h) — BLOCKS team expansion workflow

1. Add `team.addMember` mutation to team router
   - Input: teamId, personaId, displayName, instructions, isLead
   - Calls: teamService.createTeamMember()

2. Create member management UI in Teams.tsx (team detail view)
   - Show: Current members list with lead badge
   - Actions: Edit (role, name), Delete, Add New (selector + form)
   - Replace: "Add Member in team detail page" → actual button + dialog

### Phase 2: Template Picker (6h) — UNBLOCKS fast team creation

1. Seed 4 templates in database (or migration script)
   - Research Trio, Content Review, Brainstorm Panel, Technical Review
   - Each with 3-4 member profiles

2. Add template selector to New Team dialog
   - Radio buttons or dropdown: Manual / Template
   - If template: show member roster preview
   - Update form to pre-populate from template

3. Integrate team.cloneFromTemplate mutation (already exists)

### Phase 3: Activity Panel & Progress (6h) — Polish monitoring experience

1. Integrate RunMonitorPanel into TeamRoomView
   - Add toggle or right sidebar panel
   - Show agent roster, event timeline, stats

2. Add progress indicator
   - Track subtask completion in run state
   - Progress bar: X/N subtasks complete
   - Requires backend enhancement to track subtask states

3. Enhance TeamRoomView message rendering
   - Separate agent status updates from chat messages
   - Show "Agent X is thinking..." status changes

### Phase 4: Member Management (5h) — Complete team lifecycle

1. Member list in team detail view
   - Display all members with role, persona, instructions

2. Member edit dialog
   - Update displayName, roleTitle, instructions, model selection

3. Member delete endpoint + UI
   - Confirmation dialog
   - Cannot delete lead if only 1 member

---

## Open Questions

1. **Should users be able to change the team lead after creation?**
   - Help docs don't mention lead reassignment
   - Current updateMember supports it (`isLead` field)
   - Recommend: Yes, allow with confirmation (can't remove last lead)

2. **Do seeded templates need to exist for this release?**
   - Help docs reference 4 specific templates
   - Database schema ready but no seed data
   - Recommend: Seed in migration or during app startup

3. **Should members have different roles (Researcher vs Analyst vs Writer)?**
   - Help mentions "distinct set of instructions" but not role types
   - Current schema: displayName, roleTitle (flexible string)
   - Recommend: Keep flexible; roleTitle is user-defined

4. **Should activity panel show real-time agent thinking vs just messages?**
   - Help says "idle, thinking, or responding" but no backend tracking
   - Current: Only shows agent messages (actorType: assistant)
   - Recommend: Add status_change event type to streaming API

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Add Member not exposed → users stuck with initial roster | HIGH | Implement Phase 1 before release |
| Templates missing → help docs inaccurate | MEDIUM | Seed 4 templates + validate in PR |
| Activity panel not integrated → monitoring confusing | MEDIUM | Add RunMonitorPanel toggle to TeamRoomView |
| No progress indicator → users can't track run status | LOW | Nice-to-have; message stream sufficient for MVP |
| Member removal → accidentally orphaned team | MEDIUM | Add confirmation + prevent deleting only lead |

---

## Files to Modify

**Phase 1 (Add Member)**:
- `server/routers/team.ts` — add addMember mutation
- `server/services/teamService.ts` — add createTeamMember function
- `client/src/pages/Teams.tsx` — add member list + add/edit/delete dialogs

**Phase 2 (Templates)**:
- `drizzle/seed.ts` or migration — seed 4 templates
- `client/src/pages/Teams.tsx` — add template selector to New Team dialog

**Phase 3 (Activity Panel)**:
- `client/src/components/orchestrator/TeamRoomView.tsx` — integrate RunMonitorPanel
- `client/src/components/orchestrator/RunMonitorPanel.tsx` — possibly enhance progress tracking

**Phase 4 (Member Management)**:
- `client/src/pages/Teams.tsx` — expand team detail view with member management
- `server/routers/team.ts` — add deleteMember mutation
- `server/services/teamService.ts` — add deleteTeamMember function

---

## Conclusion

The Teams feature has a solid foundation with full CRUD, room management, and messaging. However, **3 critical gaps prevent the help-documented workflow from working**:

1. Users can't add members to existing teams (breaks "Click Add Member" promise)
2. Templates not available in UI (breaks "Select a template" promise)
3. Activity panel not integrated (breaks monitoring visual feedback)

**Recommended action**: Implement Phase 1 & 2 before marketing/documentation release. Phase 3 & 4 can follow in next sprint.

**Estimated total effort**: 21 hours (distributed across 4 phases, can parallelize some work).
