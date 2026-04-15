# Section 01: Durable Runtime State and Evidence Model

## Goal

Create the durable state foundation for goal-driven automation without breaking the existing coarse run lifecycle.

The engine needs a reliable place to store:

- current runtime phase
- waiting reason
- next poll time
- reviewer persona
- risk class
- verification status
- evidence references
- async job handle metadata

The first slice should keep `team_runs.status` as the compatibility layer and layer richer state onto run snapshots.

## What This Section Must Change

### 1. Snapshot contract

Extend the runtime snapshot model so it can carry the richer automation state. Use the existing `runSnapshots` table as the durable overlay rather than introducing a parallel runtime store.

The snapshot state should be expressive enough for:

- `running`
- `waiting_for_worker`
- `waiting_for_poll`
- `awaiting_human_approval`
- `blocked`
- `completed`
- `failed`

The snapshot overlay should keep enough information to map the execution state back into the canonical Work OS case or request lifecycle without ambiguity.

It should also be able to carry:

- `waitingReason`
- `riskClass`
- `reviewerPersona`
- `verificationState`
- `nextPollAt`
- `jobHandle`
- `evidenceRefs`
- Work OS linkage metadata needed to keep the business-facing case state aligned with the execution-facing overlay

### 2. Snapshot capture

Update snapshot capture so the new state can be persisted whenever the run changes meaningfully.

The capture path should remain additive:

- existing snapshot consumers must still work
- older run rows without the new overlay must still load
- the capture operation must remain best-effort and non-blocking for user-facing requests

### 3. Read helpers

Add or update helpers that can read the latest snapshot for a run and derive the current runtime overlay from it.

The read helper should be the canonical consumer contract for the runtime overlay so UI and orchestration code do not reconstruct the plan or runtime state independently.

The reader should be able to answer:

- what state is the run in right now
- what is it waiting on
- who should review the current step
- what evidence has already been persisted

### 4. Compatibility rules

Keep the current `team_runs.status` lifecycle intact for compatibility.

The section should not require a destructive migration of historical run rows.

## Files Likely Touched

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/__tests__/teamRoomRunSchema.test.ts`
- `apps/web/server/services/__tests__/monitoringService.test.ts`

## Implementation Notes

- Prefer additive schema fields or a nested runtime-state JSON shape on snapshots.
- Keep the runtime overlay durable and queryable.
- The goal is to make the current state reconstructible later without depending on transient in-memory state.
- Preserve the existing monitoring snapshot cadence and event recording patterns.
- Keep the snapshot shape compatible with downstream Work OS projection and status mapping logic.

## Completion Criteria

- The system can persist and read the richer runtime state.
- Older runs still load and behave correctly.
- Snapshot capture includes enough information for downstream orchestration and UI rendering.
- The evidence model is durable enough to support step verification and review in later sections.
