# Implementation Plan: Feature 098 Auto-Team Real Execution and Media Completion

## Outcome

Auto-Team must execute real work and prove it with durable records. A room message can explain progress, but it must not be the source of truth for completion. The source of truth will be canonical Auto-Team execution records tied to the run, room, work item, route, artifacts, provider jobs, reviewer decisions, and final result.

The implementation reuses the existing Team Run engine, Team Rooms, Work OS, Media Studio providers, Unified Orchestrator, and Agency bridge. It adds a governed execution layer around them so media and complex work cannot silently fall back to generic text generation.

## Root Cause to Eliminate

The reported room failure showed that an autonomous media request could:

- create an auto-team room and messages
- route most turns to `writing.article`
- select `parenting-article-writer`
- produce no media job references
- attach most messages to no work item
- finish with `max_rounds_reached`
- leave an active work item in progress

This plan makes that class of failure impossible by requiring:

- persisted route decision before production execution
- route-family hard gate before each skill/provider call
- stage records for all meaningful work
- media job references for media routes
- reviewer/final result evidence before completion
- visible blocked state instead of silent text-only progress
- guided Team room sends to go through a real `team_chat` run instead of persisting user messages without an assistant execution path
- Team prompt assembly to consume the shared context pack from Feature 099 rather than rebuilding user/rule/project/scoped memory locally
- scoped-memory access checks to use actual room/team/project/run ownership and membership, not tenant scope alone

## Architecture

Add a canonical Auto-Team execution layer with these modules:

- `apps/web/shared/autoTeamExecution.ts`
- `apps/web/server/services/autoTeamExecutionService.ts`
- `apps/web/server/services/autoTeamRoutePolicy.ts`
- `apps/web/server/services/autoTeamMediaExecutionService.ts`
- `apps/web/server/services/autoTeamAgencyExecutionService.ts`
- `apps/web/server/services/autoTeamReviewService.ts`
- `apps/web/server/services/autoTeamCompletionEvidence.ts`
- `apps/web/server/services/autoTeamTraceEventService.ts`
- `apps/web/server/services/autoTeamStageTimeoutPolicy.ts`
- `apps/web/server/services/autoTeamProviderPolicy.ts`
- `apps/web/server/services/autoTeamSafetyService.ts`
- `apps/web/server/services/autoTeamAccessPolicy.ts`
- `apps/web/server/services/autoTeamBudgetService.ts`
- `apps/web/server/services/autoTeamArtifactRefService.ts`
- `apps/web/server/services/autoTeamArtifactAccessService.ts`
- `apps/web/server/services/autoTeamRetentionService.ts`
- `apps/web/server/services/contextEngineAdapter.ts` (shared contract from Feature 099)
- `apps/web/server/services/promptComposer.ts`
- `apps/web/server/services/teamRoomMemoryService.ts`
- `apps/web/server/services/scopedMemoryService.ts`
- `apps/web/server/routers/scopedMemory.ts`

The run engine remains the coordinator. It calls the new layer at deterministic boundaries:

- `startRun()` creates or loads the route decision, stage plan, kickoff work item, and room briefing.
- `runNextTurn()` claims the next execution stage, selects the correct persona, enforces route-family gates, executes the step, persists evidence, and posts a room message attached to the stage/work item.
- `advanceRun()` refuses to mark a run completed unless completion evidence exists for the route.
- stop, cancel, timeout, duplicate-loop, and repair decisions update durable stage/review/final-result records.

## Memory And Guided-Chat Parity

Feature 098 consumes the shared context-engine contract from Feature 099 so execution uses the same continuity sources that matter most to correctness, without recreating the retrieval stack inside auto-team code.

Required implementation direction:

- forward `initiatedByUserId`, `currentMessage`, `projectId`, and room language into the shared context-pack adapter used by Team execution
- reuse existing durable memory sources where possible through the shared context pack instead of inventing a parallel memory stack:
  - user entity memories
  - scoped rule memories
  - project summaries
  - scoped assistant/run/room/team memories
- allow guided/manual room sends to start or resume a `team_chat` run so the assistant reply is run-backed and visible in monitoring state
- keep `auto_team` rooms automation-led; user messages there are context for automation, not an unrestricted free-chat bypass
- persist assistant turn continuity into room/team/run scoped memories and capture user entity memory from room messages as inputs to the shared context pack
- do not add a second retrieval or compaction system inside Feature 098; those responsibilities belong to Feature 099

This feature does not require forcing Team rooms onto the exact `conversationId` storage pipeline used by Chat. Parity is defined by prompt inputs, shared context packs, and durable run behavior.

## Data Model

Create migration `apps/web/drizzle/0155_auto_team_execution_records.sql` and matching schema updates in `apps/web/drizzle/schema.ts`.

Reuse existing memory stores for parity work instead of creating new memory tables:

- `entity_memories` for user/entity continuity
- `scoped_memories` for rule and room/team/run/assistant memory
- project summary records already used by Chat continuity

The plan must only introduce new tables where canonical execution evidence requires them. Memory parity must prefer existing sources of truth.

### `auto_team_route_decisions`

Purpose: one canonical classification per run attempt.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `workRequestId`
- `workCaseId`
- `routeClass`
- `routeConfidence`
- `allowedCapabilityFamiliesJson`
- `selectedPolicyJson`
- `selectedOrchestratorPersonaId`
- `language`
- `decisionReason`
- `source`
- `executionMode`
- `blockedReason`
- `idempotencyKey`
- `createdAt`
- `updatedAt`

Constraints:

- tenant scoped foreign keys where available
- unique `(tenantId, runId, idempotencyKey)`
- index `(tenantId, roomId, createdAt)`
- index `(tenantId, workRequestId, createdAt)`

### `auto_team_execution_stages`

Purpose: durable stage state machine for real execution.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `routeDecisionId`
- `workItemId`
- `planStepKey`
- `stageType`
- `status`
- `assignedPersonaId`
- `expectedCapabilityFamily`
- `selectedSkillId`
- `selectedProvider`
- `inputArtifactRefsJson`
- `outputArtifactRefsJson`
- `jobRefIdsJson`
- `attempt`
- `maxAttempts`
- `startedAt`
- `completedAt`
- `deadlineAt`
- `blockedReason`
- `errorCode`
- `errorMessage`
- `idempotencyKey`
- `metadataJson`
- `createdAt`
- `updatedAt`

Stage types:

- `route`
- `plan`
- `research`
- `storyboard`
- `prompt`
- `media_submit`
- `media_poll`
- `agency_delegate`
- `review`
- `repair`
- `human_approval`
- `finalize`

Statuses:

- `queued`
- `in_progress`
- `waiting_provider`
- `waiting_human`
- `reviewing`
- `completed`
- `needs_revision`
- `blocked`
- `failed`
- `cancelled`
- `superseded`

Constraints:

- unique `(tenantId, runId, planStepKey, attempt)`
- index `(tenantId, runId, status)`
- index `(tenantId, roomId, updatedAt)`
- index `(tenantId, workItemId)`

### `auto_team_media_job_refs`

Purpose: first-class media provider job tracking.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `stageId`
- `workItemId`
- `mediaType`
- `provider`
- `model`
- `providerTaskId`
- `providerStatus`
- `submittedPromptArtifactRef`
- `resultArtifactRefsJson`
- `providerRequestHash`
- `idempotencyKey`
- `lastPolledAt`
- `completedAt`
- `failedAt`
- `errorCode`
- `errorMessage`
- `metadataJson`
- `createdAt`
- `updatedAt`

Constraints:

- unique `(tenantId, idempotencyKey)`
- unique nullable provider identity where the database supports it: `(tenantId, provider, providerTaskId)`
- index `(tenantId, runId, providerStatus)`

### `auto_team_review_records`

Purpose: reviewer persona scoring on actual evidence.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `stageId`
- `workItemId`
- `reviewerPersonaId`
- `reviewType`
- `score`
- `passThreshold`
- `passed`
- `reviewedArtifactRefsJson`
- `reviewedJobRefIdsJson`
- `comments`
- `repairInstructions`
- `idempotencyKey`
- `createdAt`
- `updatedAt`

Constraints:

- unique `(tenantId, runId, reviewType, idempotencyKey)`
- index `(tenantId, runId, passed)`

### `auto_team_final_results`

Purpose: terminal route-aware completion/failure record.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `workRequestId`
- `workCaseId`
- `routeDecisionId`
- `status`
- `finalArtifactRefsJson`
- `mediaJobRefIdsJson`
- `reviewRecordIdsJson`
- `humanApprovalStatus`
- `summary`
- `failureReason`
- `completedAt`
- `idempotencyKey`
- `createdAt`
- `updatedAt`

Constraints:

- unique `(tenantId, runId, idempotencyKey)`
- index `(tenantId, workRequestId, createdAt)`
- index `(tenantId, roomId, createdAt)`

### `auto_team_trace_events`

Purpose: durable, monotonic, idempotent trace trail for every important automation transition. This replaces file-only/debug-only traces as the production source for run debugging.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `workRequestId`
- `workCaseId`
- `workItemId`
- `stageId`
- `routeDecisionId`
- `eventName`
- `sequence`
- `sourceComponent`
- `idempotencyKey`
- `traceEventId`
- `severity`
- `summary`
- `metadataJson`
- `artifactRefsJson`
- `createdAt`

Constraints:

- unique `(tenantId, runId, sequence)`
- unique `(tenantId, runId, idempotencyKey)`
- unique `(tenantId, traceEventId)`
- index `(tenantId, runId, createdAt)`
- index `(tenantId, roomId, createdAt)`
- index `(tenantId, eventName, createdAt)`

### `auto_team_artifact_refs`

Purpose: canonical execution-scoped references to existing artifacts, media outputs, files, or provider result assets. This avoids treating arbitrary JSON blobs as durable artifacts.

Fields:

- `id`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `stageId`
- `workItemId`
- `artifactType`
- `artifactRole`
- `title`
- `storageRef`
- `externalRef`
- `contentHash`
- `mimeType`
- `visibility`
- `source`
- `createdByPersonaId`
- `createdByStageId`
- `retentionPolicyJson`
- `safetyStatus`
- `metadataJson`
- `createdAt`
- `updatedAt`

Constraints:

- index `(tenantId, runId, artifactType)`
- index `(tenantId, stageId)`
- index `(tenantId, workItemId)`
- unique `(tenantId, runId, contentHash, artifactRole)` where content hash is available

## Shared Contracts

Create `apps/web/shared/autoTeamExecution.ts` for route classes, stage statuses, review schema, final-result schema, and UI projection types.

Contracts must be pure TypeScript and avoid server imports:

- `AutoTeamRouteClass`
- `AutoTeamCapabilityFamily`
- `AutoTeamStageType`
- `AutoTeamStageStatus`
- `AutoTeamExecutionStage`
- `AutoTeamMediaJobRef`
- `AutoTeamReviewRecord`
- `AutoTeamFinalResult`
- `AutoTeamTraceEvent`
- `AutoTeamArtifactRef`
- `AutoTeamArtifactAccessDecision`
- `AutoTeamRetentionPolicy`
- `AutoTeamRunSnapshot`
- `AutoTeamStageTimeoutPolicy`
- `AutoTeamProviderDecision`
- `AutoTeamAccessDecision`
- `AutoTeamBudgetDecision`
- route-to-required-evidence helpers

Use these contracts from server services, routers, and client components to avoid duplicated status strings.

## Route Policy and Family Gate

Implement `autoTeamRoutePolicy.ts`.

Responsibilities:

- classify objective and request metadata into a route class
- derive allowed capability families
- select default required stages for the route
- block unknown or unsafe routes with an explicit reason
- enforce that selected skill/provider family matches route
- expose a deterministic route-decision result that can be persisted

Route classes and allowed families:

- `media.video`: `media.video`, `video.prompt`, `research.synthesis`, `writing.review`
- `media.image`: `media.image`, `image.prompt`, `research.synthesis`, `writing.review`
- `agency.swarm`: `orchestration.swarm`, `research.synthesis`, `writing.review`
- `workflow.automation`: `workflow.automation`, `research.synthesis`, `writing.review`
- `research.synthesis`: `research.synthesis`, `writing.review`
- `document.writing`: `document.writing`, `research.synthesis`, `writing.review`
- `unknown.blocked`: no production families

For media routes:

- article or generic document writing cannot be the primary execution capability
- prompt-writing can be an intermediate stage only if followed by a media submit stage
- completion requires media job reference and terminal media job status

Use `executeUnified()` with `capabilitiesAllowed` for provider/skill execution. If the chosen skill fails the gate, persist `route_skill_family_mismatch`, mark the current stage `blocked`, and surface the issue in Work OS/Team UI.

## Execution Service

Implement `autoTeamExecutionService.ts`.

Responsibilities:

- create route decision records
- create stage plans for each route
- claim the next runnable stage with idempotent locking
- attach stages to work items
- post room updates using `roomService.postWorkUpdate()` with `workItemId`, artifact refs, and metadata
- mirror status to Work OS automation/case projections
- expose run snapshot projection for UI and routers
- prevent completion without required route evidence

Important behavior:

- kickoff is owned by the team orchestrator persona, not generic system, unless it is a system-only status event
- every non-system work message must include `workItemId`, `runId`, `stageId`, and route metadata
- no stage can advance from `in_progress` to `completed` without either artifact refs, job refs, review refs, or explicit blocked/failure reason
- repeated text-only turns with no new evidence trigger loop guard

### Stage Claiming and Concurrency

Implement stage claiming with database-backed concurrency control. The execution service must not rely on in-memory locks.

Required behavior:

- claim only `queued`, `needs_revision`, or retry-eligible `blocked` stages
- use one atomic transaction or conditional update to move a stage to `in_progress`
- include `claimToken`, `claimedBy`, and `claimExpiresAt` in stage metadata or dedicated columns
- if two workers call `runNextTurn()` at the same time, only one worker can claim the stage
- expired claims can be reclaimed after timeout policy allows it
- media/agency submit must still check idempotency after stage claim to avoid duplicate paid jobs

Tests must simulate concurrent `runNextTurn()` calls and prove that one stage execution and one provider job are created.

## Durable Trace Events

Implement `autoTeamTraceEventService.ts`.

Responsibilities:

- append durable trace events for every important automation transition
- allocate monotonic `sequence` per `(tenantId, runId)`
- reuse the same event row for repeated logical transitions with the same idempotency key
- redact sensitive metadata before persistence
- expose trace events in debug snapshots and Work OS evidence views

Required events:

- `automation.start.requested`
- `automation.room.created`
- `automation.run.started`
- `route.decision.created`
- `route.decision.blocked`
- `stage.created`
- `stage.claimed`
- `stage.timeout`
- `skill.execution.started`
- `skill.execution.completed`
- `skill.execution.blocked`
- `media_job.created`
- `media_job.polled`
- `media_job.completed`
- `media_job.failed`
- `agency_run.created`
- `agency_run.completed`
- `review.started`
- `review.completed`
- `review.unavailable`
- `repair.created`
- `human_approval.waiting`
- `human_approval.completed`
- `loop_guard.triggered`
- `run.completed`
- `run.blocked`
- `run.cancelled`

Trace metadata must include `tenantId`, `teamId`, `roomId`, `runId`, `workRequestId`, `workCaseId`, `workItemId`, `stageId`, `routeClass`, `selectedSkillId`, artifact refs, and idempotency key where available.

## Stage SLA and Timeout Policy

Implement `autoTeamStageTimeoutPolicy.ts`.

Default budgets:

- route decision: 30 seconds
- plan artifact creation: 2 minutes
- research brief: 5 minutes
- storyboard: 5 minutes
- prompt generation: 3 minutes
- media job creation: 2 minutes
- media job polling: provider policy or 30 minutes default
- step review: 5 minutes
- final review: 5 minutes
- human final approval: 5 minutes
- Work OS mirror update: 1 minute

Timeout behavior:

- transient provider timeout may retry with exponential backoff and jitter
- repeated timeout creates repair work or blocks according to policy
- human final approval timeout follows human approval policy and must be recorded
- media provider timeout must not complete the media stage
- review timeout must not approve the step
- every timeout emits a durable trace event and visible UI state

The timeout service must be deterministic and testable. Do not bury timeout values in React components or ad hoc run-engine constants.

## Media Job Lifecycle

Implement `autoTeamMediaExecutionService.ts`.

Responsibilities:

- generate prompt artifacts for image/video routes
- call existing Media Studio provider functions through `executeUnified()` or media generation services
- submit media jobs with server-injected auth only
- persist `auto_team_media_job_refs`
- poll/resume jobs using `mediaGenerationService.getTask()`
- attach result artifacts to the relevant work item, stage, and final result
- display provider unavailable, entitlement, safety, and timeout states as blocked stages

Video route chain:

1. research/source summary artifact
2. storyboard/scene plan artifact
3. video prompt artifact
4. provider submit job reference
5. provider poll stage until terminal status
6. reviewer score/comment on result
7. final result or repair loop

Image route chain:

1. prompt artifact
2. provider submit job reference
3. provider poll or result capture
4. reviewer score/comment on result
5. final result or repair loop

Idempotency:

- derive media submit key from `tenantId`, `runId`, `stageId`, `mediaType`, prompt hash, provider, model, and attempt
- never submit a duplicate provider job if an unfinished job ref exists for the same key
- polling must update the existing job ref rather than creating new job refs

## Provider and Model Decision Policy

Implement `autoTeamProviderPolicy.ts`.

Responsibilities:

- preserve explicit user provider/model preference such as `veo 3.1`
- merge user request, room/team defaults, Media Studio defaults, tenant policy, entitlement, availability, and budget
- persist requested provider/model and selected provider/model in route/stage/job metadata
- explain why a requested provider/model cannot be used
- request human choice between allowed alternatives when policy requires it
- prevent silent downgrade to text-only work

Provider unavailable or entitlement failure must produce one of:

- `provider_unavailable`
- `model_not_entitled`
- `budget_exceeded`
- `quota_exceeded`
- `human_provider_choice_required`
- `provider_substitution_recorded`

Tests must prove that an explicit `veo 3.1` request is either sent to a matching video provider/model or visibly blocked/substituted with a recorded policy reason.

## Budget, Credit, and Quota Controls

Implement `autoTeamBudgetService.ts`.

Responsibilities:

- run preflight budget checks before media or agency submission
- reserve credits or quota before paid provider jobs when the billing system supports reservation
- use an idempotent billing key tied to the media/agency job idempotency key
- release or finalize reservations when jobs fail, cancel, or complete
- block with visible `budget_exceeded` or `quota_exceeded` when limits prevent execution
- prevent retries from charging twice for the same logical provider job

Budget decisions must be included in trace events and debug snapshots. Provider calls must not be attempted after a fail-closed budget decision.

## Retention And Cleanup

Implement `autoTeamRetentionService.ts`.

Responsibilities:

- archive or purge expired prompts, provider payloads, generated assets, trace events, and artifact refs according to tenant policy
- best-effort purge provider-side assets when the provider exposes deletion; otherwise scrub local refs and keep redacted placeholders
- keep cleanup idempotent and tenant-scoped
- preserve user-safe summaries and debug snapshots after underlying payloads are removed
- avoid mutating live run state while performing cleanup
- support dry-run and audit reporting so retention changes can be verified before enforcement

Retention cleanup must be scheduled separately from the run engine and must not block stage execution.

## Artifact Reference and Persistence Policy

Implement `autoTeamArtifactRefService.ts`.

Responsibilities:

- create canonical artifact references for research, storyboard, prompt, media result, agency output, review notes, and final result
- point to existing artifact/media storage when possible rather than creating a parallel storage system
- record `artifactType`, `artifactRole`, `storageRef`, `externalRef`, `contentHash`, `visibility`, `source`, `createdByStageId`, and retention metadata
- verify the referenced artifact belongs to the same tenant or is a safe provider result
- expose access-controlled artifact refs to Work OS, Team UI, and final result records
- keep raw `storageRef` and `externalRef` server-only unless a caller has explicit artifact-read permission
- route artifact read/download/list operations through `autoTeamArtifactAccessService` so redaction and tenant checks stay centralized

Do not treat arbitrary `artifactRefsJson` as sufficient by itself for final completion. It must resolve to canonical artifact refs or trusted existing artifact records.

## Safety and Context-Minimization Service

Implement `autoTeamSafetyService.ts`.

Responsibilities:

- scrub external/archived context for prompt-injection attempts before it reaches LLM or provider prompts
- minimize provider payloads to only the context required for the media/agency job
- redact sensitive Work OS context, internal review notes, tenant secrets, unrelated room history, tokens, and private URLs
- enforce generated-media policy checks for copyright, likeness, brand, prohibited content, and unsafe visual/textual output
- validate output safety before final review and final completion
- apply retention policy to media prompts, generated assets, and provider payload metadata

Output safety failure must create repair, human review, or blocked state. It must never publish or mark the result complete.

## Agency Delegation

Implement `autoTeamAgencyExecutionService.ts`.

Responsibilities:

- route complex multi-agent objectives to Agency Swarm when `routeClass = agency.swarm`
- persist agency run handle, status, and artifacts in stage metadata or a dedicated job-ref-compatible record
- keep the auto-team room as the user-visible control surface
- block completion until the agency run has terminal evidence or explicit failure

The agency stage must behave like media stages: durable handle first, polling/resume second, reviewer/final-result gate last.

## Review, Repair, and Finalization

Implement `autoTeamReviewService.ts` and `autoTeamCompletionEvidence.ts`.

Responsibilities:

- choose reviewer persona according to role policy
- review actual artifact/job/final-output evidence
- persist score, pass/fail, comments, and repair instructions
- trigger repair stage when score is below threshold
- incorporate prior failure and reviewer comments into the next plan attempt
- wait for human approval when policy requires it
- write a final-result record only when route-required evidence exists

Completion rules:

- `media.video` requires prompt/storyboard artifact, media job ref, terminal media status, review record, and final result.
- `media.image` requires prompt artifact, media job ref/result, review record, and final result.
- `agency.swarm` requires agency run handle, terminal agency status, review record, and final result.
- `document.writing` requires final document artifact, review record, and final result.
- failure completion must include a sanitized failure reason and blocked/failed final result.

Reviewer availability is fail-closed for `media.video`, `media.image`, and `agency.swarm`:

- retry with the assigned reviewer when transient
- select an approved backup reviewer persona when policy allows
- request human review when policy allows
- otherwise block with `reviewer_unavailable`

Media and agency routes must never pass final review through heuristic fallback alone.

## Loop Guard, Stop, and Cancel

Add a repeated-loop detector to the execution service.

Signals:

- same stage type repeated beyond configured limit with no new artifact/job/review evidence
- same selected skill repeatedly returns text-only output for media route
- run budget consumed without stage state transition
- same blocked reason appears repeatedly

Actions:

- pause or block the run with `loop_guard_triggered`
- persist guard evidence in stage metadata
- show a clear banner in Work OS and Team room
- allow user to retry from last safe stage
- allow user to cancel the run

Add server endpoints/mutations for stop/cancel/retry if existing `teamRun` router does not fully cover them for Auto-Team execution stages.

## Access Policy and RBAC

Implement `autoTeamAccessPolicy.ts`.

Every route/stage/job/review/final/debug endpoint must call a shared access helper. Do not duplicate permission checks in each router.
Artifact read/download/list endpoints and signed URL issuance must use the same helper so raw storage refs are never exposed to unauthorized users.

Permission matrix:

- requester can view their own Work OS request, linked room/run summary, final result, and user-safe blocked reasons
- team members can view rooms/runs for teams they belong to
- team orchestrator/owner can start, stop, retry, and cancel automation when policy allows
- assigned reviewer persona or authorized human reviewer can approve/reject review stages
- tenant admin can view debug snapshots with sanitized diagnostics
- raw diagnostics require explicit admin/debug permission
- cross-tenant copied links must return not found or forbidden without leaking object existence
- artifact viewers without explicit artifact-read permission receive redacted projections and do not see raw storage refs or internal provider paths
- room-health/context-engine monitoring views require room participation or admin/debug permission

Access tests must cover request owner, team member, non-member, reviewer, tenant admin, and cross-tenant access for room/run/stage/job/review/final result IDs.

## Work OS and My Requests

Update Work OS service projections so requests remain visible after assignment to a room.

Required behavior:

- Work OS and My Requests list both old and new requests scoped to the user/tenant
- assigned work remains visible with linked team room, run, route, current stage, and final result
- Work OS Console can deep-link to evidence slices: main case, role routine, team run, workpack record, media job, review, final result
- a request never disappears just because a new room was created or a team assignment moved it from queue to execution

## Team UI

Update Team room and run-monitor UI:

- full-page layout consistent with Media Studio
- top room grid can collapse so chat has more space
- when top grid is collapsed, side/right panel still shows current room identity
- current room details include room ID, created date/time, language, autonomy mode, route, current stage, run ID, work request ID, work case ID, and owner persona
- room cards show created date/time and latest run status so users can identify the newest room
- room selection always returns to the room list and can switch rooms
- right work panel sections are collapsible
- visible progress shows active stage, provider job status, review score, final result, blocked reason, and retry/cancel controls
- language toggle exists on `/work/request` and start automation; default English, optional Thai
- selected language is stored on the room and sent to LLM/provider instructions

## Observability

Add structured trace events for:

- route decision created
- route blocked
- stage created
- stage claimed
- skill/provider selected
- family gate passed/failed
- media job submitted
- media job polled
- artifact attached
- reviewer completed
- repair triggered
- loop guard triggered
- final result created
- Work OS mirror updated

Logs must include `tenantId`, `teamId`, `roomId`, `runId`, `workRequestId`, `stageId`, `routeClass`, `traceId`, and idempotency key where applicable.

Provide a debug script or server-side query helper to inspect one run/room from real DB without guessing.

## Security

Maintain and extend existing controls:

- tenant-scoped queries for every new table
- never accept client-supplied provider auth tokens
- only server injects media provider tokens
- validate external URLs through existing SSRF controls before media/reference fetch
- sanitize provider errors before showing them to users
- preserve detailed errors in server logs
- enforce file size/type/extension/signature checks for uploaded artifacts
- enforce idempotency for submit/poll/review/finalize
- block private-network, metadata, loopback, and redirect-to-private URLs
- keep generated media access controlled by tenant/user permissions
- prevent cross-tenant room/run/job IDs in router inputs
- defend against prompt injection from uploaded, archived, or external context
- minimize provider payloads and exclude unrelated Work OS context
- enforce generated-media copyright, likeness, brand, and safety checks
- apply retention controls to prompts, provider payloads, generated assets, and debug traces
- enforce budget, quota, and entitlement checks before paid provider execution
- require artifact reads/downloads to flow through `autoTeamArtifactAccessService` with tenant/run/stage provenance checks
- ensure artifact deep links never leak raw storage references to unauthorized users
- freeze enforcement mode at run creation and persist it in the route decision/run snapshot
- route retention cleanup through `autoTeamRetentionService` rather than ad hoc delete code

## Rollout

Use a feature flag such as `AUTO_TEAM_CANONICAL_EXECUTION`.

Rollout steps:

1. Add tables and contracts.
2. Write records in shadow mode while keeping current behavior.
3. Enable route hard gate for new auto-team runs.
4. Enable media job enforcement for media routes.
5. Enable completion evidence gate.
6. Enable UI surfaces and Work OS projection.
7. Backfill/read legacy rooms as partial evidence with `legacy_unverified` status.
8. Freeze the execution mode on the route decision/run snapshot so in-flight runs are not reclassified by later feature-flag changes.
9. Run backfill tooling only from a trusted operator/admin/debug context; user identity alone must not elevate access.

Rollback plan:

- feature flags can disable enforcement while preserving read-only visibility of already-written canonical records
- disabling enforcement must not delete route/stage/job/review/final-result records
- provider submissions already created must continue polling or be safely cancelled according to provider policy
- migrations must be verified with forward dry-run and documented manual rollback/disable procedure
- debug snapshot must show whether a run was created under shadow, enforced, or rollback mode
- the mode attached to a live run remains immutable even if the tenant flag changes after kickoff; later changes only affect new runs

## Backfill and Legacy Rooms

Do not mutate old messages as if they were verified execution. Instead:

- create route/stage snapshots only when source evidence is reliable
- mark inferred legacy records as `legacy_unverified`
- show legacy runs in UI as historical records with limited evidence
- allow retry/re-run from a legacy room into a new canonical run
- preserve backfill caller context and provenance explicitly so later audits can distinguish trusted backfill from live execution

## Implementation Order

1. Schema and shared contracts.
2. Durable trace events, artifact refs, retention cleanup, timeout policy, access policy, and budget policy foundations.
3. Route policy and hard family gate.
4. Execution service and run-engine integration with database-backed stage claiming.
5. Provider/model policy, media job lifecycle, provider polling, safety checks, and budget enforcement.
6. Agency delegation lifecycle.
7. Review/finalization, reviewer-unavailable handling, human approval, and loop guards.
8. Work OS, Team UI, request language, room switching, and monitoring.
9. Backfill, rollout flag, rollback/debug tooling, and end-to-end tests.

## Verification

The main proving scenario is a Songkran video request:

- request is created from `/work/request`
- user selects a team and language
- automation creates a new room
- route is `media.video`
- orchestrator owns kickoff
- research/storyboard/prompt stages complete with artifacts
- media video job is submitted and tracked
- reviewer scores the actual media result
- final result is visible in Work OS, My Requests, Team room, and Work OS Console
- no article-writing skill can complete the run

Regression scenarios:

- image objective cannot complete without image job
- complex objective delegates to agency and persists agency run handle
- provider unavailable produces blocked stage, not fake completion
- repeated text-only output trips loop guard
- stop/cancel prevents further auto-advance
- room switching works after entering a room
- Work OS still lists requests after room assignment
- guided/manual Team room send starts or resumes a `team_chat` run instead of persisting a write-only message
- guided Team prompt respects room language and user/project/team continuity memory
- unrelated same-tenant users cannot create/search/promote scoped memory for another room/team/project/run
