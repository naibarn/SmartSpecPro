# Section 05: Agency Delegation and Complex Work

## Goal

Route complex multi-agent work through the existing Agency Swarm capability while preserving the same canonical evidence model used by media routes. Agency execution must have a durable handle, status, artifacts, review, and final result.

## Dependencies

- Section 01 schema/contracts
- Section 02 route policy/family gate
- Section 03 execution service/stage engine

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamAgencyExecutionService.ts`
- Modify `apps/web/server/services/teamRunSkillExecutor.ts`
- Modify `apps/web/server/services/runEngine.ts` to dispatch agency stages
- Modify or reuse `apps/web/server/services/agencyBridge.ts`
- Create `apps/web/server/services/__tests__/autoTeamAgencyExecutionService.test.ts`
- Create `apps/web/server/services/__tests__/teamRunSkillExecutor.agencyCanonical.test.ts`

## TDD First

Write failing tests for:

- complex objective routes to `agency.swarm`
- agency delegate stage calls `agencyBridge.executeRun()` or equivalent existing bridge
- returned agency run ID is persisted in stage metadata or a canonical job-compatible reference
- agency stage status can be polled/resumed
- successful agency completion attaches artifacts and moves to review
- failed agency completion creates blocked/failed evidence
- agency run lookups are tenant scoped
- agency start checks budget/quota before creating a swarm run
- retried agency delegation reuses idempotency/billing keys and does not double-charge
- agency route cannot complete from room messages alone

## Service Design

Create `autoTeamAgencyExecutionService.ts` with functions:

- `executeAgencyStage(input)`
- `startAgencyRun(input)`
- `pollAgencyRun(input)`
- `attachAgencyArtifacts(input)`
- `buildAgencyIdempotencyKey(input)`
- `sanitizeAgencyError(error)`
- `assertBudgetAllowsAgencyRun(input)`

Inputs must include:

- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `stageId`
- `workItemId`
- `routeDecisionId`
- `objective`
- `language`
- `selectedAgencyTemplateId` when known
- `attempt`

## Agency Run Evidence

Persist at least:

- agency run ID
- agency conversation ID if available
- selected template/agency ID if available
- status
- submitted objective
- output artifact refs
- error code/message
- last polled timestamp

If adding a dedicated agency job table would be too large for this feature, store the handle in `auto_team_execution_stages.metadataJson` and include it in the run snapshot. However, prefer a clearly typed structure in shared contracts so UI and tests do not parse arbitrary metadata.

## Execution Behavior

For `agency.swarm` route:

1. `plan` stage describes why agency delegation is needed.
2. `agency_delegate` stage creates or reuses agency run handle.
3. `agency_delegate` or follow-up poll stage waits for terminal agency state.
4. Output artifacts are attached to work item and stage.
5. Review stage scores actual agency output.
6. Finalize stage creates final result or repair path.

Auto-Team remains the control surface. The user must not have to leave the team room to understand agency progress.

## Route Gate

Agency route may execute only:

- `orchestration.swarm`
- `research.synthesis`
- `writing.review`

If an article skill is selected for agency production, block with `route_skill_family_mismatch`.

## Idempotency

Build agency idempotency key from:

- `tenantId`
- `runId`
- `stageId`
- objective hash
- selected agency/template ID
- attempt

Before starting a new agency run, look for existing non-terminal agency execution evidence with the same key.

Agency budget and billing must use an idempotent billing key tied to the agency idempotency key. Retry must not create duplicate agency runs or duplicate charges.

## Security Requirements

- Tenant-scope all agency lookups.
- Do not expose internal agency logs across tenants.
- Sanitize agency errors for room/Work OS display.
- Do not let user-provided IDs select agencies outside the tenant or allowed template catalog.
- Preserve existing Agency permission/credit checks.
- Emit durable trace events for agency run create, poll, complete, fail, and timeout.

## Acceptance Criteria

- Complex work can delegate to Agency Swarm.
- Agency runs are durable and resumable.
- Agency route cannot complete without agency terminal evidence and review.
- Auto-Team UI can display agency handle/status through the run snapshot.
- Existing agency tests remain passing.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamAgencyExecutionService.test.ts server/services/__tests__/teamRunSkillExecutor.agencyCanonical.test.ts
npm --prefix apps/web run check
```
