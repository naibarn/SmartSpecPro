# Section 01 — Canonical Contracts and Dark Projection

## Goal and boundaries

Implement M0 only: a durable execution-session projection and contracts while preserving current execution behavior. `worker_jobs` remains the source of truth for job/lease/attempt/cancellation/terminal status. Do not launch long-running work from this projection.

## Requirements

- Add normalized session state, desired/observed state, continuity classes and enforcement levels from Spec 278 §§8–11. Enforce legal transitions in one shared service and reject stale `job_control_revision`.
- Link each session generation to tenant + `worker_jobs.id`; create append-only sequence-numbered events. Idempotent projection upserts cannot rewind state or duplicate events.
- Add driver interface/capability contract and versioned API DTOs. Existing Runner protocol remains compatible; session ID is distinct from Runner connection ID.
- Add flags default-off and shadow projection. With flags off, execution and job state are unchanged.
- Never persist secrets, mutable workspace paths, terminal bytes, or a second job status authority.

## Likely owned files

- `apps/web/drizzle/schema.ts`, new additive `apps/web/drizzle/03xx_spec278_execution_sessions.sql`, migration journal/snapshot and focused migration tests.
- New `apps/web/server/services/runnerExecutionSessionContracts.ts`, `runnerExecutionSessionService.ts`, focused `__tests__`.
- `apps/runner-app/src/lib.rs`, `protocol.rs`, new `session_contract.rs`, and tests.
- Add only safe session summary fields to existing runner/session DTOs after confirming ownership in `runnerNodes.ts` and `runnerControl.ts`.

## Acceptance and tests

Cover INV-001..010 and AC-12, AC-14, AC-15, AC-40. Test state transition matrix, revision compare-and-set, tenant isolation, event sequence uniqueness/idempotency, flag-off behavior, compatibility negotiation and sanitized projection. Validate migration ordering without applying production data changes.

## Dependencies and outputs

No section dependencies. Exports the stable session DTO/state/driver contracts and migration/schema vocabulary used by Sections 02–10. Record actual schema/migration IDs and verified callers during implementation.

## Implementation record

- Added Rust session enums/projection validation and transition guard in `apps/runner-app/src/session_contract.rs`, plus the provider-neutral `SessionDriver` lifecycle interface in `session_driver.rs`.
- Added TypeScript state/continuity/enforcement contracts, sensitive event validation, and a feature-gated transactional projection writer in `apps/web/server/services/runnerExecutionSessionContracts.ts` and `runnerExecutionSessionService.ts`.
- Added tenant/job-linked session and append-only ordered event tables in `apps/web/drizzle/schema.ts`; persisted attempt/fencing snapshot, composite session+tenant event FK, additive migration `0387_spec278_durable_execution_sessions.sql` and journal entry 373.
- `externalAgentRunnerDispatcher` now creates an idempotent `starting` shadow projection before persisting the canonical external-wait metadata when the existing projection flag is enabled. It records the derived session ID in that wait metadata; with the flag off the projection service returns without DB access. If wait persistence fails, the projection is marked unknown best-effort; ambiguous dispatch outcomes are marked unknown before canonical external-wait failure is recorded. Current executions are honestly classified as `ephemeral` / `COMMAND_ONLY` until a persistent Host caller and stronger enforcement exist.
- Added focused Rust, contract, schema, migration, feature-off service, and Task Control tests. Focused Web run passed 147 tests across 7 files; the latest complete Runner package suite passes 126 library unit tests plus 6 Linux Session Host integration tests, with all 7 integration tests passing after final registration validation. `drizzle-kit check` passes after correcting the malformed existing snapshot policy map; broad schema/snapshot drift and new migration snapshot alignment remain open. Formatting was applied with `cargo fmt`.
- Migration was not applied. The session projection feature flag defaults off. Cross-instance recovery and authority issuance remain for Section 03.
- Status: **M0 contract + feature-gated projection producer implemented; broader integration remains open.** Protocol compatibility negotiation, receipt-driven state projection, migration snapshot/schema baseline proof and production shadow sample remain open.
