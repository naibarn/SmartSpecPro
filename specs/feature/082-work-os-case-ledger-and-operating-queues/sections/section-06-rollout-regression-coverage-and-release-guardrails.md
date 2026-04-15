# Section 06 - Rollout, Regression Coverage, And Release Guardrails

## Goal

Ship the Work OS safely with staged rollout, regression coverage, and guardrails that prevent split ownership or shadow workflow engines.

## Scope

- Roll out in compatibility-first phases.
- Add regression coverage around tenant isolation, lifecycle events, and legacy compatibility.
- Add release guardrails so no user-facing surface can mutate ownership, SLA, approval, or exception state outside the canonical work service boundary.
- Keep the rollout reversible through deterministic projections and additive migration steps before any full backfill is enabled.

## Implementation Notes

- Prefer additive migration steps.
- Stage read compatibility before write migration.
- Keep the first release reversible.

## Likely Files

- `apps/web/server/services/__tests__/`
- `apps/web/server/routers/__tests__/`
- `apps/web/server/services/*workos*.test.ts`
- `apps/web/server/routers/*workos*.test.ts`

## Tests First

- Assert legacy team-work-item routes still function after the Work OS adapter is introduced.
- Assert no user-facing surface can mutate Work OS ownership, SLA, approval, or exception state without the canonical service boundary.
- Assert tenant isolation is preserved across intake, queueing, approval, exception, and timeline access.
- Assert the final regression suite covers the primary lifecycle from intake through outcome retrieval.
- Assert external assistants and autonomous workers route to triage when no safe target work item, queue, or owner is available.
- Assert a later physical backfill or feature-flag harness can be introduced without changing the deterministic read-projection contract.

## Acceptance Notes

- The rollout can be staged without breaking existing surfaces.
- The release does not introduce duplicate workflow engines or competing ownership stores.

## Implemented Files

- `apps/web/server/services/__tests__/workOsService.test.ts`
- `apps/web/server/services/__tests__/workOsSchema.test.ts`
- `apps/web/server/routers/__tests__/workOs.test.ts`
- `apps/web/server/routers/__tests__/approvals.test.ts`
- `apps/web/drizzle/0146_work_os_case_ledger_and_operating_queues.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/drizzle/meta/0146_snapshot.json`

## Deviation

- The rollout guardrail is currently expressed through compatibility-first code paths and regression tests; a dedicated feature-flag rollout harness can be added later if needed, but the specification now requires the deterministic projection contract to remain stable across any later backfill work.
