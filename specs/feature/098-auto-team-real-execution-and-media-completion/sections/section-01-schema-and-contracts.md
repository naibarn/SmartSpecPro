# Section 01: Schema and Contracts

## Goal

Create the durable data model and shared TypeScript contracts for canonical Auto-Team execution. This section does not change runtime behavior yet; it makes route decisions, stages, media jobs, reviews, and final results representable and testable.

## Why This Section Exists

The current system stores team runs, room messages, work items, and monitoring snapshots, but the observed failure proves those are not enough. A video request produced many messages and no media job, then stopped at `max_rounds_reached`. The system needs first-class records that can prove what happened.

## Files to Create or Modify

- Create `apps/web/drizzle/0155_auto_team_execution_records.sql`
- Modify `apps/web/drizzle/schema.ts`
- Create `apps/web/shared/autoTeamExecution.ts`
- Create `apps/web/shared/__tests__/autoTeamExecution.test.ts`
- Create `apps/web/drizzle/__tests__/autoTeamExecutionSchema.test.ts`
- Update any migration registry or migration snapshot test fixture if this repository has one
- Update generated schema artifacts such as `apps/web/drizzle/schema.js` if this repository requires them

## TDD First

Write failing tests before implementation.

### `apps/web/shared/__tests__/autoTeamExecution.test.ts`

Cover:

- route class constants include `media.video`, `media.image`, `agency.swarm`, `workflow.automation`, `research.synthesis`, `document.writing`, `unknown.blocked`
- capability family constants include media, prompt, research, document, review, agency, and workflow families
- stage type constants include route, plan, research, storyboard, prompt, media submit, media poll, agency delegate, review, repair, human approval, finalize
- stage status constants include queued, in progress, waiting provider, waiting human, reviewing, completed, needs revision, blocked, failed, cancelled, superseded
- required evidence helper says video/image routes require media job refs
- required evidence helper says prompt-only evidence is not enough for media completion
- final result status helper distinguishes completed, failed, cancelled, and legacy unverified
- trace event helper validates monotonic sequence/idempotency fields
- artifact ref helper validates canonical artifact type, role, visibility, retention, and safety fields

### `apps/web/drizzle/__tests__/autoTeamExecutionSchema.test.ts`

Cover:

- `schema.ts` exports all canonical Auto-Team tables
- each table includes `tenantId`
- route decisions include `routeClass`, `allowedCapabilityFamiliesJson`, `selectedOrchestratorPersonaId`, `language`, `blockedReason`, `idempotencyKey`
- stages include `stageType`, `status`, `workItemId`, `planStepKey`, `expectedCapabilityFamily`, `selectedSkillId`, `jobRefIdsJson`, `blockedReason`, `idempotencyKey`
- media job refs include `mediaType`, `provider`, `model`, `providerTaskId`, `providerStatus`, `submittedPromptArtifactRef`, `resultArtifactRefsJson`, `idempotencyKey`
- review records include reviewer persona, score, threshold, pass flag, comments, repair instructions
- final results include route decision, status, final artifact refs, media job refs, review record refs, human approval status, summary, failure reason
- trace events include event name, sequence, source component, idempotency key, trace event id, severity, summary, and redacted metadata
- artifact refs include artifact type/role, storage/external refs, content hash, visibility, retention policy, and safety status
- migration text contains unique indexes for idempotency keys
- migration text contains unique `(tenantId, runId, sequence)` for trace events

## Shared Contract Design

Create `apps/web/shared/autoTeamExecution.ts` with no server-only imports.

Export literal arrays and derived union types:

- `AUTO_TEAM_ROUTE_CLASSES`
- `AUTO_TEAM_CAPABILITY_FAMILIES`
- `AUTO_TEAM_STAGE_TYPES`
- `AUTO_TEAM_STAGE_STATUSES`
- `AUTO_TEAM_FINAL_RESULT_STATUSES`
- `AUTO_TEAM_MEDIA_TYPES`

Export interfaces:

- `AutoTeamRouteDecision`
- `AutoTeamExecutionStage`
- `AutoTeamMediaJobRef`
- `AutoTeamReviewRecord`
- `AutoTeamFinalResult`
- `AutoTeamTraceEvent`
- `AutoTeamArtifactRef`
- `AutoTeamRunSnapshot`
- `AutoTeamRequiredEvidence`
- `AutoTeamStageTimeoutPolicy`
- `AutoTeamProviderDecision`
- `AutoTeamBudgetDecision`
- `AutoTeamAccessDecision`

Export helpers:

- `getRequiredEvidenceForRoute(routeClass)`
- `routeRequiresMediaJob(routeClass)`
- `routeAllowsCapability(routeClass, capabilityFamily)`
- `isTerminalStageStatus(status)`
- `isTerminalMediaStatus(status)`
- `isFinalResultTerminal(status)`

Keep helper behavior deterministic and side-effect free so client and server can share it.

## Migration Design

Add these tables:

### `auto_team_route_decisions`

Columns:

- `id varchar(36) primary key default gen_random_uuid()`
- `tenantId varchar(36) not null references tenants(id) on delete cascade`
- `teamId varchar(36) not null references assistant_teams(id) on delete cascade`
- `roomId varchar(36) not null references team_rooms(id) on delete cascade`
- `runId varchar(36) not null references team_runs(id) on delete cascade`
- `workRequestId varchar(36) references work_requests(id) on delete set null`
- `workCaseId varchar(36) references work_cases(id) on delete set null`
- `routeClass varchar(64) not null`
- `routeConfidence double precision`
- `allowedCapabilityFamiliesJson jsonb not null default '[]'::jsonb`
- `selectedPolicyJson jsonb`
- `selectedOrchestratorPersonaId varchar(36) references assistant_profiles(id) on delete set null`
- `language text not null default 'en'`
- `decisionReason text`
- `source varchar(64) not null default 'auto_team_route_policy'`
- `blockedReason text`
- `idempotencyKey varchar(255) not null`
- `createdAt timestamptz not null default now()`
- `updatedAt timestamptz not null default now()`

Indexes:

- unique `(tenantId, runId, idempotencyKey)`
- `(tenantId, roomId, createdAt)`
- `(tenantId, workRequestId, createdAt)`
- `(tenantId, routeClass, createdAt)`

### `auto_team_execution_stages`

Columns:

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

Indexes:

- unique `(tenantId, runId, planStepKey, attempt)`
- unique `(tenantId, runId, idempotencyKey)`
- `(tenantId, runId, status)`
- `(tenantId, roomId, updatedAt)`
- `(tenantId, workItemId)`
- `(tenantId, routeDecisionId)`

### `auto_team_media_job_refs`

Columns:

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

Indexes:

- unique `(tenantId, idempotencyKey)`
- `(tenantId, provider, providerTaskId)`
- `(tenantId, runId, providerStatus)`
- `(tenantId, stageId)`
- `(tenantId, workItemId)`

### `auto_team_review_records`

Columns:

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

Indexes:

- unique `(tenantId, runId, reviewType, idempotencyKey)`
- `(tenantId, runId, passed)`
- `(tenantId, stageId)`

### `auto_team_final_results`

Columns:

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

Indexes:

- unique `(tenantId, runId, idempotencyKey)`
- `(tenantId, workRequestId, createdAt)`
- `(tenantId, roomId, createdAt)`
- `(tenantId, status, createdAt)`

### `auto_team_trace_events`

Columns:

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

Indexes:

- unique `(tenantId, runId, sequence)`
- unique `(tenantId, runId, idempotencyKey)`
- unique `(tenantId, traceEventId)`
- `(tenantId, runId, createdAt)`
- `(tenantId, roomId, createdAt)`
- `(tenantId, eventName, createdAt)`

### `auto_team_artifact_refs`

Columns:

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

Indexes:

- `(tenantId, runId, artifactType)`
- `(tenantId, stageId)`
- `(tenantId, workItemId)`
- unique `(tenantId, runId, contentHash, artifactRole)` where the database supports partial uniqueness for non-null hashes

## `schema.ts` Implementation Notes

- Add enum-like `pgEnum` values only if the project convention favors DB enums for this area. Otherwise use varchar/text plus shared TypeScript validation to reduce migration friction.
- Follow existing table naming and column casing style. Existing tables use camelCase column names such as `tenantId`, `roomId`, `runId`.
- Reference existing tables by imported schema objects: `tenants`, `assistantTeams`, `teamRooms`, `teamRuns`, `workRequests`, `workCases`, `teamWorkItems`, `assistantProfiles`.
- Export select and insert types for every table.
- Keep trace metadata and artifact metadata JSON typed narrowly enough that services cannot store provider secrets by accident.

## Security Requirements

- Every table must include `tenantId`.
- New records must be joinable to a tenant-owned room/run.
- Idempotency keys must be tenant scoped.
- JSON columns must store structured references, not raw provider secrets.
- Provider auth tokens must never be stored in these records.
- Trace metadata must be redacted before persistence.
- Artifact refs must not expose signed URLs directly; store stable storage/external references and resolve access through existing permission checks.

## Acceptance Criteria

- Migration file exists and can be applied.
- `schema.ts` exports all tables and types.
- Generated schema artifacts are updated when required by this repository.
- Shared contracts compile on client and server.
- Tests fail before implementation and pass after implementation.
- No runtime behavior is changed in this section beyond adding schema/contracts.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- shared/__tests__/autoTeamExecution.test.ts drizzle/__tests__/autoTeamExecutionSchema.test.ts
npm --prefix apps/web run check
```
