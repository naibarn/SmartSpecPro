# Section 01 - Role Contracts, Bindings, and Persistence

## Purpose

This section establishes the canonical shared contract, lifecycle vocabulary, role-to-workpack binding model, and first-pass persistence strategy for Feature 080.

The goal is to give every later section one stable source of truth for role ids, contract versions, routine definitions, routine-cycle records, checkpoints, typed handoffs, and role-level projections before any scheduler, monitor, or UI work depends on them.

## Why this section comes first

- Later sections need stable identifiers and enums before they can safely schedule routines, evaluate delegation, or aggregate monitor state.
- The feature must remain a layer above Feature 079 workpacks, so the shared contract has to model references to workpack families, versions, and run ids without duplicating workpack internals.
- Persistence choices made here determine whether Feature 080 becomes a durable operating layer or devolves into a monitor over transient run state.
- The authority envelope and binding model must be explicit before scheduler, monitor, and learning code can enforce fail-closed autonomy.

## Files in scope

- `apps/web/shared/roleAgentContracts.ts` new shared contract module
- `apps/web/shared/__tests__/roleAgentContracts.test.ts` new shared contract tests
- `apps/web/drizzle/schema.ts` role-agent tables and JSON-backed columns
- `apps/web/drizzle/migrations/*` migration file or files for role entities
- `apps/web/server/services/rolePersistence.ts` or equivalent dedicated read/write helper
- `apps/web/server/services/teamService.ts` only where existing team records need an explicit bridge into role-agent activation

## Shared contract model

Create one shared module that defines the canonical TypeScript and Zod vocabulary for these concepts:

- `role_blueprint`
- `role_agent`
- `role_contract`
- `role_workpack_binding`
- `role_routine`
- `role_routine_run`
- `role_checkpoint`
- `role_message`
- `role_handoff`
- `role_metric_snapshot`
- `role_exception_binding`
- `role_improvement_proposal`
- `role_promotion_gate`

The module should match the repo's current contract style: exported string-union constants, exported Zod schemas, and exported TypeScript types inferred from those schemas.

## Canonical lifecycle vocabulary

Define a narrow, fail-closed enum set that later sections can reuse without inventing role-specific state names ad hoc.

- `roleAgentLifecycleState`: `draft`, `active`, `paused`, `degraded`, `quarantined`, `retired`, `archived`
- `roleContractStatus`: `draft`, `pending_review`, `active`, `superseded`, `blocked`
- `roleRoutineStatus`: `active`, `paused`, `blocked`, `retired`
- `roleRoutineRunStatus`: `queued`, `running`, `awaiting_approval`, `succeeded`, `failed`, `blocked`, `quarantined`, `cancelled`
- `roleAutonomyTier`: `manual`, `guided`, `supervised`, `autonomous`
- `roleHealthState`: `healthy`, `degraded`, `blocked`, `stale`, `quarantined`
- `workpackResolutionPolicy`: `pinned_version`, `follow_benchmark_track`, `follow_latest_ready_in_family`
- `roleDelegationIntentType`: `request`, `handoff`, `escalate`, `dependency_block`, `status_summary`, `approval_request`, `shared_finding`
- `checkpointRecoveryState`: `fresh`, `stale`, `needs_resume_review`, `recovered`, `quarantined`
- `rolePromotionDecision`: `unchanged`, `promote`, `downgrade`, `freeze`, `revert`

These enums should be shared across storage, API payloads, UI state, and telemetry. Unknown values must fail closed.

## Role payload rules

The shared contract should model a role agent as a versioned operating envelope with explicit links to routines, workpack families, and current operational state.

- A `role_blueprint` should define purpose, default mission, KPI categories, default authority envelope, typical connector families, and recommended routine starters.
- A `role_agent` should carry its current lifecycle state, active contract id, department label, ownership context, and current health posture.
- A `role_contract` should be immutable once activated. Material edits should create a new version rather than mutating the active contract in place.
- A `role_workpack_binding` should describe one role-allowed workpack family or benchmark track together with resolution policy, rollback baseline, connector ceiling, and side-effect ceiling.
- A `role_routine` should bind one recurring responsibility to one or more role-workpack bindings plus schedule, trigger, concurrency, and SLA metadata.
- A `role_routine_run` should be the canonical routine-cycle projection. It needs trigger source, idempotency key, selected workpack family, resolved workpack version, linked workpack run ids, current cycle state, checkpoint pointer, and recovery status.
- A `role_checkpoint` should capture resumable continuity state without pretending to be the execution ledger. It should always reference the active or last-completed `role_routine_run`.
- A `role_message` and `role_handoff` should preserve sender, recipient, delegation intent, provenance, related work context, and outcome state.
- A `role_metric_snapshot` should represent role-level KPI, backlog, health, and autonomy posture at a point in time rather than rewriting raw execution evidence.
- A `role_improvement_proposal` and `role_promotion_gate` should preserve evidence pointers to the underlying workpack, replay, benchmark, and KPI sources instead of copying them.

## Data governance and storage hygiene

Role persistence should inherit the same safety posture as Feature 079 and extend it to role memory and communication surfaces.

- Contract history, role messages, checkpoints, and learning records should all carry explicit tenant scoping and actor provenance.
- Connector secrets, raw auth tokens, or secret-bearing payloads must never be stored inside role contracts, bindings, checkpoints, or messages. Store handles or redacted summaries only.
- Role memory or checkpoint payloads that preserve operational context should carry trust class, retention tier, and redaction state so the monitor does not quietly become an unbounded memory dump.
- Typed role communication should store attributable summaries and references, not raw copies of unrelated sensitive connector payloads.
- Improvement evidence should remain tenant-local by default and should only reference shareable workpack evidence when Feature 079 de-identification and trust-clearance rules already permit it.

## Migration and coexistence strategy

Feature 080 is entering a codebase that already has teams, rooms, and run ownership concepts. This section should therefore lock an additive migration path before implementation starts.

- Role-agent tables should be added additively rather than by mutating existing team tables into a new meaning overnight.
- Pilot tenants should opt into activated role-agent ownership explicitly rather than via silent backfill.
- Existing team records may reference activated role agents during the transition, but role-agent records become the source of truth for activated persistent roles.
- Dual writes should be minimized to short-lived compatibility bridges. The implementation should prefer one authoritative write path per activated tenant.
- Cutover must be tenant-scoped, auditable, and reversible so disabling the pilot does not corrupt legacy team, room, or workpack history.
- Backfill should preserve stable references between legacy teams and new role agents without inferring unsafe authority envelopes from generic team metadata alone.

## Retention, archival, and purge policy

Durable role state needs an explicit lifecycle so month-scale operation does not become indefinite uncontrolled retention.

- Contract history should remain durable and audit-visible even when hot operational context is archived or purged.
- Hot operational context should be retention-tiered separately from archived context and historical summaries.
- Archived memory and message summaries should stay rehydratable only through explicit, audited access paths that still respect trust class and visibility rules.
- Tenant purge requests should be able to remove hot and archived operational context without breaking immutable contract history more than policy allows.
- Legal-hold or regulated-retention overrides should be representable explicitly so purge and archival jobs do not destroy protected evidence.
- Expired or redacted context should not be allowed to flow back into hot memory, role monitor summaries, or delegated context accidentally after recovery.

## Persistence strategy

Create dedicated persistence for these records:

- `role_blueprint`
- `role_agent`
- `role_contract`
- `role_workpack_binding`
- `role_routine`
- `role_routine_run`
- `role_checkpoint`
- `role_message`
- `role_handoff`
- `role_metric_snapshot`
- `role_exception_binding`
- `role_improvement_proposal`
- `role_promotion_gate`

The persistence layer should follow these rules:

- Keep contract and binding history immutable after activation.
- Keep routine-cycle and checkpoint records append-only or revisioned so continuity and recovery are explainable.
- Separate durable state projections from raw workpack execution evidence; do not duplicate workpack run ledgers inside role records.
- Reference existing team, workpack, connector, room, and monitoring assets by id or opaque reference rather than copying internal runtime structures.
- If existing team records are used as a bridge, store an explicit role-agent reference rather than overloading generic team-member JSON indefinitely.

## Route ownership and boundaries

This section should establish clear ownership so later work stays disciplined.

- Existing `teamService.ts` keeps ownership of team-native concepts.
- Feature 080 adds dedicated role services and routers for role contracts, routines, routine cycles, checkpoints, handoffs, and role-level monitor projections.
- Feature 079 workpack services remain authoritative for workpack execution, replay, readiness, rollout, and incidents.
- Shared contracts must remain importable by monitoring, workpack, server, and UI layers without pulling persistence details into client code.
- The role layer must remain a persistent ownership and monitoring layer, not a second executor.

## Implementation guidance

1. Define the shared role-agent types and Zod schemas first so later sections can depend on one stable vocabulary.
2. Add the database schema only after the shared shapes and enum names are stable.
3. Keep `role_routine_run` explicit as the monitor projection unit. Do not leave "current role state" implicit inside checkpoint blobs.
4. Keep the role-to-workpack binding explicit so Feature 080 can inherit Feature 079 safely instead of freeform routing.
5. Version contract and binding changes that expand power. Do not silently mutate active envelopes.
6. Keep the bridge to current team records narrow and reversible so the feature can evolve without forcing a one-shot rewrite of the team substrate.
7. Define migration ownership and data-retention behavior before implementing the first pilot tenant so persistence does not drift into ad hoc per-service decisions.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: the shared schemas accept valid blueprint, role, contract, binding, routine, routine-cycle, checkpoint, message, handoff, metric, exception-binding, improvement, and promotion payloads.
- Test: unknown lifecycle values, unsupported autonomy tiers, malformed resolution policies, and invalid delegation intent types fail closed.
- Test: activated role contracts reject in-place mutation semantics and require a new version for material authority changes.
- Test: role-workpack bindings preserve resolution policy and rollback baseline through round-trip validation.
- Test: `role_routine_run` payloads preserve trigger source, selected workpack family, resolved workpack version, linked workpack run ids, checkpoint pointer, and recovery status.
- Test: persistence schema can reference existing team, workpack, connector, room, and monitoring assets without duplicating runtime internals.
- Test: secret-bearing connector fields are rejected or forced into reference-only storage instead of persisting raw values.
- Test: role memory and checkpoint payloads preserve trust class, retention tier, and redaction state through validation and persistence boundaries.
- Test: shared contract imports remain usable from existing web shared, server, and client test setups.
- Test: migration bridges from legacy team ownership to role-agent ownership remain tenant-scoped, explicit, and reversible.
- Test: archival, retention expiry, tenant purge, and legal-hold policy can be represented without corrupting immutable contract history.

## Done when

This section is complete when the codebase has one validated shared role-agent contract, dedicated durable storage for role history and current projections, and later sections can rely on the same ids and enums without inventing a second role vocabulary.
