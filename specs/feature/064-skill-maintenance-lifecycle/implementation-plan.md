# Implementation Plan: Feature 064 - Skill Maintenance Lifecycle

## Objective

Implement a governed maintenance system for SmartSpecPro skills that can:

1. analyze a single skill or many skills
2. generate structured recommendations
3. block unsafe contract-breaking changes
4. let admins review and approve improvements
5. support scheduled sweeps
6. migrate suitable skills to GenJS bundles safely
7. expose orchestration configuration in Admin > Skills

## Current-codebase fit

This feature should extend:

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/scheduler.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/skills/intelligence-skill-creator/*`

## Delivery approach

### Slice 1 - Foundations

Add the data model and server-side analyzer primitives first.

This slice creates:

- maintenance tables
- analyzer service
- contract snapshot support
- shared recommendation types
- schema tests
- migration SQL

### Slice 2 - Single-skill review

Add:

- `Analyze` action in Admin > Skills
- recommendation listing/detail APIs
- recommendation review drawer / modal

### Slice 3 - Controlled apply

Add:

- apply runner
- compatibility gate
- verification loop
- run logging
- proposal/direct-apply decision rules

### Slice 4 - Scheduled sweeps

Add:

- maintenance schedules
- sweep runner
- recommendation-only batch analysis
- admin review queue

### Slice 5 - GenJS migration

Add:

- GenJS candidate scoring
- migration planning
- tool/bootstrap verification
- bundle scaffolding
- fixture tests and smoke tests
- support for tool/helper file creation when bundle migration needs new JS modules

### Slice 6 - Orchestration config

Add:

- edit-dialog orchestration settings
- runtime config storage
- admin preview / audit support

## Review loop per slice

Each slice should follow the same deep-implement loop:

1. write or update tests first
2. implement the smallest non-breaking change set
3. run targeted verification
4. review contract impact before moving on
5. update implementation progress and decision log if scope changes

## Contract guardrails

Before any slice is considered complete:

- existing `skills` CRUD must still pass
- Admin > Skills create/edit/import paths must still load
- skill runtime metadata must remain backward compatible
- newly added maintenance logic must be additive by default

## Proposed implementation order by file ownership

### Foundation slice ownership

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0123_skill_maintenance_lifecycle.sql`
- `apps/web/drizzle/schema.test.ts`
- `apps/web/server/services/__tests__/skillMaintenanceSchema.test.ts` if needed

### Analyzer slice ownership

- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`

### Router slice ownership

- `apps/web/server/routers/skills.ts`
- `apps/web/server/routers/__tests__/skills.maintenance.test.ts`

### UI slice ownership

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/components/admin/SkillMaintenanceAdvicePanel.tsx`
- `apps/web/client/src/components/admin/SkillMaintenanceQueue.tsx`

### Apply and schedule slice ownership

- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/skillMaintenanceScheduler.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/scheduler.ts`

### GenJS and orchestration slice ownership

- `apps/web/server/services/skillGenjsMigration.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/skills/intelligence-skill-creator/*`
- `apps/web/client/src/components/admin/SkillOrchestrationConfigPanel.tsx`

## Rollout policy

Rollout should happen in three phases:

1. hidden foundations and server-only analysis
2. admin-visible advice and preview without broad auto-apply
3. guarded apply and schedule features after verification confidence is established

## Architecture notes

### Analyzer

The analyzer should be deterministic where possible and should combine:

- file presence checks
- manifest/schema completeness
- runtime metadata inspection
- test and fixture heuristics
- GenJS suitability heuristics
- optional ISC-backed recommendation enrichment

### Compatibility gate

The gate should operate on:

- schema hashes
- sample input/output snapshots
- required field diffs
- execution mode/runtime shifts
- old tests and new fixture tests

### Apply runner

The apply runner should support two modes:

1. safe direct apply for low-risk changes
2. proposal-first mode for higher-risk changes

### Recommendation queue

Admin review should operate on persisted recommendation records rather than only temporary output.

## Likely touched files

### Database / schema

- `apps/web/drizzle/schema.ts`
- new migration files under `apps/web/drizzle/`

### Server

- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/scheduler.ts`
- new `apps/web/server/services/skillMaintenance*.ts` files

### Frontend

- `apps/web/client/src/pages/AdminSkills.tsx`
- possibly extracted maintenance components under `apps/web/client/src/components/admin/`

### ISC / maintenance runtime

- `apps/web/skills/intelligence-skill-creator/*`

## Non-breaking contract rule

This implementation must assume that many existing skills are already consumed by:

- chat flows
- schedulers
- workflows
- agencies
- external automation paths

Therefore:

- no auto-apply should run if the compatibility gate finds input/output contract risk
- public and shared skills must default to recommendation-only until approved

## End-state

When complete, SmartSpecPro should have a maintenance loop where skill quality is observable, upgradeable, and safe to operate over time.
