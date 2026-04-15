# Section 01 - Canonical Work Model And Migration Envelope

## Goal

Define the canonical Work OS storage strategy and the first-release compatibility envelope so the feature has one stable work identity across request, case, task, approval, exception, outcome, and SLA state.

## Scope

- Add `work_request` and `work_case` as new persisted tables.
- Keep `work_task` backed by the existing `team_work_items` table for the first release.
- Add `work_assignment` as an immutable ownership history table so queue and owner changes remain auditable.
- Add explicit persisted records for `work_approval`, `work_exception`, `work_outcome`, and `work_sla`.
- Continue using `work_item_events` as the lifecycle journal and extend its event vocabulary where needed.
- Add the minimum indexes needed for tenant, state, owner, queue, and timeline lookup.
- Add a read-projection path so legacy `team_work_items` records can appear in the Work OS case timeline without requiring a full backfill on day one.

## Implementation Notes

- Preserve existing `team_work_items` behavior for legacy routes.
- Model the new tables so they can reference the same tenant, case, and task identity without duplicating ownership state.
- Keep this section focused on schema and compatibility mapping only.
- Keep the projection logic deterministic so the same legacy task resolves to the same case/task identity on repeated reads.
- Do not implement UI or routing in this section.

## Likely Files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/__tests__/workItemSchema.test.ts`
- `apps/web/server/services/workItemService.ts`
- `apps/web/server/services/workOs*` helper files if needed

## Tests First

- Assert the new Work OS schema objects exist with the required tenant and linkage fields.
- Assert `work_task` maps to the legacy team-work-item substrate for the first release.
- Assert the lifecycle journal can record Work OS transitions in addition to legacy team-work-item events.
- Assert tenant-scoped lookup helpers or indexes support queue and timeline retrieval.

## Acceptance Notes

- The repo has one canonical work identity model, not two competing ones.
- Legacy surfaces can continue to function while the new Work OS layer is introduced.

## Implemented Files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0146_work_os_case_ledger_and_operating_queues.sql`
- `apps/web/drizzle/meta/0146_snapshot.json`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/__tests__/workOsSchema.test.ts`
- `apps/web/server/services/__tests__/workOsService.test.ts`
- `apps/web/server/routers/__tests__/workOs.test.ts`

## Deviation

- The first-release projection path is deterministic and read-only for legacy tasks, but the physical backfill/migration scripts remain for a later pass.
