# Section 01 — Server Access, Workflow Policy, and Migration

## Goal

Close owner-only access, missing capability projections, workflow policy
absence, and binding/job persistence gaps without destructive changes.

## Owned files

- `apps/web/shared/workerSeriesControlPlane.ts`
- `apps/web/shared/verticalDramaMedia/contracts.ts`
- `apps/web/shared/verticalDramaMedia/workflow.ts`
- `apps/web/server/services/verticalDramaSeriesAccessService.ts`
- `apps/web/server/services/verticalDramaMediaJobService.ts`
- `apps/web/server/routes/workerSeriesControlPlane.ts`
- admin workflow policy service/router and focused tests
- `apps/web/drizzle/schema.ts` plus one new additive SQL migration and journal

## Implementation

Add typed capability projections and durable principal resolution using current
connected-device/Worker sharing policy. Add workflow registry/policy/resolution
contracts and a policy service with default/lock/override/fallback semantics.
Pin resolved policy/workflow to jobs. Add missing binding metadata/FKs and
invariant migration checks. Keep owner-only behavior as the safe fallback when
no explicit group/tenant policy exists.

## TDD acceptance

Access precedence, hidden Series, capability enforcement, policy resolution,
stale resolution, migration legacy-row safety, active uniqueness, and job pin
tests pass before Section 02.
