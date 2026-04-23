# Section 07: Work OS, Team UI, and Monitoring

## Goal

Expose canonical Auto-Team execution clearly in Work OS, My Requests, Work OS Console, and Team rooms. Users must see old and new requests, know which room they are in, switch rooms reliably, understand progress, and control automation.

## Dependencies

- Section 01 schema/contracts
- Section 03 stage engine and snapshots
- Section 04 media lifecycle
- Section 05 agency lifecycle
- Section 06 review/finalization/controls

## Files to Create or Modify

Server:

- Modify `apps/web/server/services/workOsService.ts`
- Modify `apps/web/server/routers/teamRun.ts`
- Modify `apps/web/server/routers/teamRoom.ts`
- Create or modify `apps/web/server/services/autoTeamAccessPolicy.ts`
- Create or modify `apps/web/server/services/autoTeamArtifactAccessService.ts`
- Modify `apps/web/server/routers/scopedMemory.ts`
- Modify `apps/web/server/services/scopedMemoryService.ts`
- Modify `apps/web/server/services/promptComposer.ts`
- Modify `apps/web/server/services/teamRoomMemoryService.ts`
- Modify request creation/update router if `/work/request` uses another router

Client:

- Modify `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- Modify `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- Modify `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx`
- Modify Work OS Console page/component
- Modify My Requests page/component
- Modify `/work/request` page/component

Tests:

- `apps/web/server/services/__tests__/workOsService.autoTeamVisibility.test.ts`
- `apps/web/server/routers/__tests__/teamRunCanonicalSnapshot.test.ts`
- `apps/web/server/routers/__tests__/autoTeamAccessPolicy.test.ts`
- `apps/web/server/services/__tests__/autoTeamArtifactAccess.test.ts`
- `apps/web/server/routers/__tests__/scopedMemoryRouter.test.ts`
- `apps/web/client/src/components/orchestrator/__tests__/TeamRoomView.autoTeamExecution.test.tsx`
- `apps/web/client/src/components/orchestrator/__tests__/RoomWorkflowPanel.canonicalStages.test.tsx`
- `apps/web/client/src/pages/__tests__/WorkRequest.languageAndEdit.test.tsx`
- `apps/web/server/services/__tests__/scopedMemoryService.test.ts`

## TDD First

Write failing tests for:

- My Requests still shows a request after it is assigned to a team room
- Work OS Console shows route/current stage/media job/review/final result
- room card shows room ID snippet, created date/time, language, mode, latest run status
- user can return to room list and switch rooms
- top room grid collapses and current room identity remains visible
- right panel sections collapse independently
- stop/cancel/retry buttons call server mutations
- `/work/request` language toggle defaults to English and supports Thai
- new room stores selected language
- edit-not-started request opens existing title/details instead of blank form
- request owner, team member, reviewer, and tenant admin see only allowed evidence/actions
- non-member and cross-tenant copied links cannot read room/run/stage/job/review/final/debug data
- debug raw diagnostics are visible only to admin/debug users
- guided/manual room sends start or resume a run-backed `team_chat` assistant flow instead of persisting write-only messages
- scoped memory create/search/update/delete/promote rejects room/team/project/run access that the caller does not actually own or participate in
- artifact reads/downloads go through the shared access helper and return redacted projections when the caller lacks explicit artifact-read permission

## Work OS Visibility

Update Work OS projections so request visibility is not tied only to current queue owner.

Include records where the current user/tenant is connected by:

- requester/request creator
- work case
- linked team run
- linked team room
- assigned owner/team
- work item source reference

Every listed request must include:

- request ID
- case ID
- team ID
- room ID
- run ID
- route class
- current stage
- current stage status
- blocked reason
- final result status
- created/updated timestamps

Do not hide the request because it moved from queue to a new room.

## Access Policy and RBAC

All Work OS, Team, snapshot, control, and debug endpoints must call `autoTeamAccessPolicy.ts`.

Permission matrix:

- requester can view their own request, linked room/run summary, final result, and user-safe blockers
- team members can view rooms/runs for teams they belong to
- team owner/orchestrator can start, stop, retry, and cancel automation when policy allows
- assigned reviewer or authorized human reviewer can approve/reject review stages
- tenant admin can view sanitized debug snapshots
- raw diagnostics require explicit admin/debug permission
- cross-tenant copied links return not found or forbidden without leaking object existence
- artifact deep links must not expose raw storage refs or internal provider paths to unauthorized users

UI must hide or disable controls the current user cannot execute, but server permissions are authoritative.

The same ownership model must apply to scoped-memory endpoints used by Team continuity features. Tenant scope alone is not sufficient authorization for room/team/project/run memory access.
The same ownership model must also apply to artifact read/download/list endpoints and signed URL issuance.

## Work OS Console

Add canonical evidence slices:

- route decision
- stage timeline
- media job refs
- agency run refs
- review records
- final result
- blocked/failure reason
- retry/cancel controls where allowed

Deep links must retain `caseId`, `roomId`, `runId`, and `timelineSource` where appropriate.

## Team Room Layout

The Team room should feel full-page like Media Studio:

- avoid cramped centered cards
- chat should be the dominant surface
- top room grid/list can collapse
- right work panel can collapse sections
- current room identity remains visible when the top grid is collapsed

Current room details panel must show:

- room title
- room ID
- room created date/time
- team name/team ID
- run ID
- work request ID
- work case ID
- language
- autonomy mode: auto/semi-auto/manual
- route class
- current stage/status
- selected orchestrator persona
- latest media/agency job status
- whether the current room is automation-led or guided `team_chat`

## Room Cards and Switching

Room cards must show:

- title
- created date/time
- status: active/paused/archived
- latest run status
- language
- route class if known
- room ID snippet
- selected/current marker

The "back to room list" control must always clear room-detail state enough to pick another room. Avoid URL/state combinations that keep the old room selected after the user clicks a different room.

## Guided Team Chat Parity

Guided/manual Team rooms must not behave like persist-only logs.

Required behavior:

- sending a message can start or resume a `team_chat` run
- the assistant reply is emitted through the run engine and reflected in run monitoring state
- prompt assembly respects the room language
- prompt assembly includes available user entity memory, user rule memory, project continuity, and scoped assistant/run/room/team memories
- `auto_team` rooms may capture user messages as context without silently becoming unrestricted chat

## Automation Controls

Show controls based on run state:

- start automation
- stop/pause
- cancel
- retry blocked stage
- rerun as new run
- open media job/result
- approve/reject when waiting human

Controls must call server mutations from Section 06, not directly mutate client state as if successful.

## Request Language and Editing

On `/work/request`:

- add English/Thai language toggle
- default to English
- persist language in request/start automation payload
- when creating a room, store language on `team_rooms.language`
- include language in run objective/prompt context
- allow editing title/details/category/urgency/risk/team assignment while request has not started automation
- "Open request page" for an existing request must load existing values

## Monitoring Snapshot

Add or extend run snapshot endpoint to return `AutoTeamRunSnapshot` from Section 01:

- route decision
- stages
- active stage
- media job refs
- review records
- final result
- controls allowed
- room details
- Work OS links
- trace event summary
- timeout/budget/provider/safety status

Client components must consume this projection instead of parsing room messages to infer state.

## Security Requirements

- All evidence endpoints are tenant-scoped.
- UI must not show cross-tenant IDs or data if a copied link is invalid.
- Stop/cancel/retry buttons must respect permission checks.
- Provider error details shown to users must be sanitized.
- Do not expose auth tokens, provider raw payloads, or private URLs.
- Scoped-memory endpoints must verify actual room/team/project/run participation before revealing or mutating memory.
- Artifact read/download endpoints must use the same access helper as room/run/job/review reads.
- Artifact reads must not reveal raw storage refs or signed URLs unless the caller has explicit artifact-read permission.
- Artifact views must remain understandable even if underlying payloads were redacted or archived by retention cleanup.

## Acceptance Criteria

- Users can see all old/new Work OS requests after assignment.
- Users can identify the latest room and switch rooms.
- Users can collapse panels without losing room identity.
- Users can see current route/stage/job/review/final state.
- Users can stop/cancel/retry safely.
- Request language affects room/run output language.
- Guided/manual Team sends produce run-backed assistant replies instead of write-only persistence.
- Scoped-memory access is blocked for same-tenant users who are unrelated to the target room/team/project/run.
- Artifact reads and debug snapshots do not leak raw storage refs to users without permission.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/workOsService.autoTeamVisibility.test.ts server/routers/__tests__/teamRunCanonicalSnapshot.test.ts server/routers/__tests__/teamRoom.test.ts server/routers/__tests__/scopedMemoryRouter.test.ts client/src/components/orchestrator/__tests__/TeamRoomView.autoTeamExecution.test.tsx client/src/components/orchestrator/__tests__/RoomWorkflowPanel.canonicalStages.test.tsx client/src/pages/__tests__/WorkRequest.languageAndEdit.test.tsx
npm --prefix apps/web run check
```
