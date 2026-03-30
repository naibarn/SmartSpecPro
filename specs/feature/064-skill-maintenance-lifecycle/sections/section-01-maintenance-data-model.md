# Section 01: Maintenance Data Model

## Goal

Create the persistent data model for maintenance recommendations, run history, compatibility snapshots, and schedules.

## Files to Create

- `apps/web/drizzle/<new migration files>`

## Files to Modify

- `apps/web/drizzle/schema.ts`

## TDD - Tests to Write First

- schema tests proving new tables and columns exist
- migration test or schema-shape assertion for recommendation/run/snapshot/schedule tables

## Implementation Guidance

1. Add tables:
   - `skill_improvement_recommendations`
   - `skill_improvement_runs`
   - `skill_contract_snapshots`
   - `skill_maintenance_schedules`
2. Add enums where helpful for:
   - recommendation status
   - risk level
   - run type
   - run status
   - compatibility status
   - schedule status
3. Minimum recommendation fields:
   - `skillId`
   - `tenantId`
   - `recommendationType`
   - `title`
   - `status`
   - `riskLevel`
   - `compatibilityStatus`
   - `qualityScore`
   - `recommendationJson`
   - timestamps and reviewer fields
4. Minimum run fields:
   - `skillId`
   - `recommendationId`
   - `scheduleId`
   - `runType`
   - `status`
   - `logsJson`
   - `metricsJson`
   - `verificationJson`
   - timestamps
5. Minimum snapshot fields:
   - `skillId`
   - `recommendationId`
   - `runId`
   - `snapshotType`
   - `executionMode`
   - `runtimeProfile`
   - `inputSchemaHash`
   - `outputSchemaHash`
   - `contractHash`
   - `snapshotJson`
6. Minimum schedule fields:
   - `tenantId`
   - `name`
   - `status`
   - `cronExpression`
   - `timezone`
   - `scopeJson`
   - `policyJson`
7. Keep `skills.configJson` free of recommendation history; use it only for runtime config.
8. Add exported TypeScript types for each table.
9. Add indexes for:
   - recommendation queue filtering by `skillId`, `status`, `riskLevel`
   - runs by `skillId`, `scheduleId`, `status`
   - snapshots by `skillId`, `capturedAt`
   - schedules by `status`, `nextRunAt`

## Compatibility Constraints

- no existing `skills` CRUD flow should break
- existing migrations and schema tests must still pass
