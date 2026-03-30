# Research Notes

## Existing surfaces confirmed in codebase

### Admin UI

- `apps/web/client/src/pages/AdminSkills.tsx`
  - already supports list, edit, import, pending approval, ISC proposal queue
  - already has sandbox settings in the edit dialog
  - is the correct place to add analyze/advice/apply actions and a new maintenance tab

### Skills router

- `apps/web/server/routers/skills.ts`
  - already owns skill CRUD, proposal queue APIs, preview-model diagnostics, folder import, and skill studio launch
  - is the best place to add maintenance procedures

### Skill studio / ISC proposal flow

- `apps/web/server/services/skillStudioService.ts`
  - already launches ISC
  - already reads and applies proposal diffs
  - already syncs created skills back into the database
  - should be reused as the basis for maintenance apply flows where practical

### Runtime / sandbox

- `apps/web/server/services/skillExecutor.ts`
  - already supports `sandbox-command`
  - already resolves bundle roots and command manifests
  - is the right place to verify GenJS migration smoke paths

### Scheduling pattern

- `apps/web/server/services/scheduler.ts`
  - already demonstrates one-time and recurring schedule behavior
  - can serve as the pattern for maintenance sweep scheduling

- `apps/web/server/jobs/pendingApprovalAlert.ts`
  - shows a lightweight timer-driven background reminder job

### Current skill metadata

- `apps/web/drizzle/schema.ts`
  - `skills` already stores execution mode, sandbox profile, config JSON, execution policy JSON, and ownership/visibility
  - maintenance history should use dedicated tables instead of overloading `configJson`

### ISC / GenJS

- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
  - already supports GenJS bundle generation
  - already supports modular pipeline helpers and optional orchestration contract
  - is ready to be called by a higher-level maintenance planner

## Key design implications

1. This feature should be additive and should lean on existing admin skills UI and router ownership.
2. Recommendation persistence needs a real data model, not just files on disk.
3. Contract safety must be implemented before auto-apply is allowed.
4. GenJS migration should build on the new ISC scaffolding rather than inventing a separate bundle format.
5. Maintenance scheduling should reuse existing service/job patterns but keep its own schedule table and run logs.
