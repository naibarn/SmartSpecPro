# Section 06: Scheduled Sweeps and Review Queue

## Goal

Allow admins to scan many skills on a schedule and review queued recommendations later.

## Files to Create

- `apps/web/server/services/skillMaintenanceScheduler.ts`
- `apps/web/server/services/__tests__/skillMaintenanceScheduler.test.ts`

## Files to Modify

- `apps/web/server/services/scheduler.ts`
- `apps/web/server/jobs/pendingApprovalAlert.ts`
- `apps/web/server/routers/skills.ts`

## TDD - Tests to Write First

- schedule creation persists a maintenance schedule
- sweep runner creates recommendation records without applying breaking changes
- disabled schedules do not run
- admin reminder path can include maintenance backlog summary

## Implementation Guidance

1. Add schedule CRUD/list procedures.
2. Support scope filters such as:
   - all skills
   - by category
   - by execution mode
   - GenJS candidates only
   - stale-analysis only
3. Default scheduled runs to recommendation-only behavior.
4. Log sweep runs into `skill_improvement_runs`.

## Compatibility Constraints

- do not reuse `scheduled_messages` rows directly for maintenance semantics
- keep maintenance schedule ownership and filtering explicit
