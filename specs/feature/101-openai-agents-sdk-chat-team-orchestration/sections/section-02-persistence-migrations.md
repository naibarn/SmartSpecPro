# Section 02: Persistence And Migrations

## Purpose

Add durable storage for SDK runtime metadata, generic runtime traces, and generic checkpoints while preserving existing Team ledger tables and legacy run compatibility.

This section must be additive. It must not reinterpret historical rows as SDK runs.

## Depends On

- `section-01-shared-contracts-flags`

## Blocks

- Node runtime client
- Chat integration
- Team integration
- Ledger/UI debug
- Rollout gates

## Files Owned By This Section

- `apps/web/drizzle/schema.ts`
- New migration files under the repo's existing Drizzle migration location
- `apps/web/drizzle/__tests__/agentRuntimeSchema.test.ts`
- `apps/web/server/services/agentRuntime/redaction.ts`

Section 04 owns `traceService.ts` and `checkpointService.ts`. This section owns schema, migrations, schema tests, and the reusable redaction helper consumed by those services.

## Schema Changes

### Extend `team_runs`

Add nullable/default-safe columns:

- `runtimeEngine`
- `runtimeMode`
- `runtimeSdkVersion`
- `runtimeAdapterVersion`
- `runtimeTraceId`
- `runtimeGatewayRouteId`
- `runtimeFrozenAt`
- `runtimeTerminalReason`
- `runtimeCurrentStepKey`
- `runtimeApprovalState`
- `runtimeStateJson`

`runtimeStateJson` must be versioned. Expected envelope fields:

- `schemaVersion`
- `planDigest`
- `stepStatuses`
- `checkpointRefs`
- `selectionSource`
- `flagSnapshot`
- `lastEventSequence`

Legacy behavior:

- existing rows may have null runtime fields
- null runtime fields map to `legacy runtime`
- no migration should backfill invented SDK trace ids or step state

### Add `agent_runtime_traces`

Purpose: generic redacted runtime archive for Chat, Team, Responses, and shared skill runtime.

Fields:

- id
- tenant id
- surface
- room id nullable
- run id nullable
- message id nullable
- step key nullable
- attempt id nullable
- trace id
- event id
- sequence
- event name
- source component
- severity
- summary nullable
- redacted metadata JSON
- SDK version nullable
- adapter version nullable
- model id nullable
- provider id nullable
- gateway route id nullable
- idempotency key
- created at

Indexes:

- tenant + run + sequence
- tenant + trace id
- tenant + event name + created at
- tenant + idempotency key unique

### Add `agent_runtime_checkpoints`

Purpose: generic Chat/Responses/shared-skill/non-work HITL pause/resume storage.

Fields:

- id
- tenant id
- surface
- room id nullable
- run id nullable
- message id nullable
- step key nullable
- attempt id nullable
- checkpoint id
- checkpoint status
- approval state
- resume cursor nullable
- snapshot JSON
- detail JSON
- idempotency key
- requested by nullable
- approved by nullable
- rejected by nullable
- resumed by nullable
- requested at
- approved at nullable
- rejected at nullable
- resumed at nullable
- created at
- updated at

Indexes:

- tenant + checkpoint id unique
- tenant + run + step key
- tenant + status + updated at
- tenant + idempotency key unique

### Existing Team Tables To Reuse

Do not replace:

- `auto_team_execution_stages`
- `auto_team_review_records`
- `auto_team_trace_events`
- `auto_team_final_results`
- `auto_team_artifact_refs`
- `work_approvals`
- `work_automation_run_checkpoints`

Team runtime projection should use these existing tables in later sections.

## Redaction Helper

Add a redaction utility that can be reused by trace and checkpoint services.

It must redact:

- JWTs
- bearer tokens
- provider API keys
- internal service tokens
- signed URLs
- cookies
- OAuth refresh tokens
- connector credentials
- large raw document fragments

The helper should be allowlist-oriented for persisted trace metadata where practical.

## TDD Tests To Write First

Schema tests:

- Test `team_runs` includes all runtime columns.
- Test `runtimeStateJson` is nullable/default-safe for legacy rows.
- Test `agent_runtime_traces` exists with required fields.
- Test `agent_runtime_traces` has tenant + idempotency uniqueness.
- Test `agent_runtime_traces` has tenant + run + sequence indexing.
- Test `agent_runtime_checkpoints` exists with required fields.
- Test `agent_runtime_checkpoints` has tenant + checkpoint id uniqueness.
- Test migrations do not make SDK metadata required for old rows.

Redaction tests:

- Test JWT is redacted.
- Test bearer token is redacted.
- Test provider key-like value is redacted.
- Test signed URL is redacted.
- Test cookie header is redacted.
- Test OAuth refresh token is redacted.
- Test large raw document fragment is truncated or replaced by reference.

Trace schema/redaction tests:

- Test trace table shape supports redacted metadata only.
- Test redaction helper prepares metadata safe for trace persistence.
- Test schema has uniqueness needed for duplicate event prevention.

Checkpoint schema tests:

- Test checkpoint table shape includes tenant, surface, checkpoint id, resume cursor, approval state, and idempotency key.
- Test schema has uniqueness needed for idempotent checkpoint writes.
- Test Work OS checkpoint tables remain unchanged and available for Team work-backed approvals.

## Implementation Notes

- Keep all migrations additive.
- Use existing Drizzle naming and index conventions.
- Prefer nullable columns for first rollout.
- Do not add UI changes here.
- Do not add Python adapter code here.

Implemented shape:

- `apps/web/drizzle/schema.ts` now extends `team_runs` with additive runtime metadata columns for engine/mode/version, trace/gateway identifiers, frozen step state, approval state, terminal reason, and nullable `runtimeStateJson`.
- `apps/web/drizzle/schema.ts` now declares generic `agent_runtime_traces` and `agent_runtime_checkpoints` tables for Chat, Team, Responses, and shared-skill runtime persistence without reinterpreting historical Team rows as SDK runs.
- `apps/web/drizzle/0156_openai_agents_runtime_persistence.sql` adds the runtime metadata columns and both generic persistence tables with additive `IF NOT EXISTS` migration semantics and the required uniqueness/index coverage for idempotency and replay safety.
- `apps/web/drizzle/meta/_journal.json` now records migration `0156_openai_agents_runtime_persistence` without rewriting earlier migration history.
- `apps/web/server/services/agentRuntime/redaction.ts` now provides a shared persistence redaction helper that removes JWTs, bearer tokens, provider keys, signed URLs, cookie-like values, refresh tokens, nested credential objects, and oversized raw document fragments.
- `apps/web/server/services/agentRuntime/traceService.ts` and `apps/web/server/services/agentRuntime/checkpointService.ts` now consume the shared redaction helper so generic runtime traces and checkpoints persist only redacted payloads.

Test status:

- Implemented 19 targeted Vitest assertions covering additive `team_runs` runtime columns, generic trace/checkpoint tables, migration index declarations, legacy-row null safety, Work OS checkpoint compatibility, and runtime persistence redaction behavior.
- Verified with:
  - `npm test -- drizzle/__tests__/agentRuntimeSchema.test.ts server/services/__tests__/agentRuntimeRedaction.test.ts server/services/__tests__/agentRuntimeTraceService.test.ts server/services/__tests__/agentRuntimeCheckpointService.test.ts`
- The migration remains additive: old `team_runs` rows keep nullable runtime columns, existing Auto-Team tables stay intact, and Work OS checkpoint storage remains the Team work-backed path.

## Acceptance Criteria

- Schema supports runtime metadata, generic traces, and generic checkpoints.
- Existing runs can still render as legacy.
- Trace/checkpoint persistence can deduplicate events.
- Redaction utility exists and is tested.
- No destructive migration is introduced.
