# Section 01 - Shared Contracts and Persistence

## Purpose

This section establishes the canonical shared workpack contract, lifecycle vocabulary, replay-grade run ledger shape, and first-pass persistence model for Feature 079.

The goal is to give every later section one stable source of truth for workpack ids, versioning, run history, simulation output, exceptions, benchmark promotion, and metric snapshots before any intake, compiler, routing, or UI work depends on them.

## Why this section comes first

- Later sections need stable identifiers and enums before they can safely draft, simulate, execute, replay, or promote workpacks.
- The feature must reuse the existing runtime stack rather than inventing a parallel execution model, so the shared contract has to describe references to current workflow, skill, browser, hybrid, agency, connector, and desktop assets.
- Persistence decisions made here will determine whether the feature stays a reusable workpack layer or accidentally becomes a hidden persistent role system.
- Section 080 depends on workpacks being addressable as reusable execution units, so the contract must leave room for future ownership without defining that ownership model now.

## Files in scope

- `apps/web/shared/workpackContracts.ts` new shared contract module
- `apps/web/shared/__tests__/workpackContracts.test.ts` new shared contract tests
- `apps/web/drizzle/schema.ts` workpack tables and JSON-backed columns
- `apps/web/drizzle/migrations/*` new migration file or files for the dedicated workpack tables
- `apps/web/server/services/workpackPersistence.ts` or equivalent read/write helper if a dedicated persistence layer is needed

## Shared contract model

Create one shared module that defines the canonical TypeScript and Zod vocabulary for these concepts:

- `case_source`
- `playbook`
- `workpack`
- `workpack_version`
- `workpack_run`
- `simulation_run`
- `workpack_exception`
- `connector_map`
- `benchmark_pack`
- `metric_snapshot`
- `workpack_execution_plan`
- `workpack_step`

The module should keep the same style as the repo's other shared contract files: exported string-union constants, exported Zod schemas, and exported TypeScript types inferred from those schemas.

## Canonical lifecycle vocabulary

Define a narrow, fail-closed set of enums that later sections can reuse without reinterpreting state names.

- `workpackLifecycleState`: `draft`, `clarification_needed`, `needs_review`, `ready`, `simulating`, `supervised`, `autonomous`, `paused`, `retired`, `archived`
- `autonomyMode`: `draft`, `supervised`, `autonomous`
- `promotionState`: `unpromoted`, `candidate`, `approved`, `promoted`, `reverted`, `blocked`
- `workpackRunStatus`: `queued`, `running`, `awaiting_approval`, `succeeded`, `failed`, `cancelled`, `blocked`
- `simulationStatus`: `queued`, `running`, `passed`, `failed`, `needs_revision`, `blocked`, `inconclusive`
- `exceptionReasonCategory`: `operational`, `transient`, `connector_auth`, `policy_boundary`, `ambiguity`, `drift`, `schema_mismatch`, `irreversible_action`
- `sideEffectClass`: `read_only`, `bounded_write`, `external_write`, `irreversible`, `financial`, `privileged`

These enums should be shared across storage, API payloads, and UI state. They should fail closed when an unknown state appears.

## Workpack payload rules

The shared contract should model a workpack as a versioned bundle with explicit links to the source material and the runtime surfaces it compiles into.

- A `workpack` should carry its current lifecycle state, autonomy mode, promotion state, policy profile, connector requirements, evaluation fixtures, and runtime preference hints.
- A `workpack_version` should be immutable once published. Any material edit should create a new version instead of mutating the published one in place.
- A `workpack_run` should be replay-grade, not just a status record. It needs planned steps, actual steps, approval checkpoints, side-effect classification, artifact references, and connector response summaries.
- A `simulation_run` should mirror the same plan structure closely enough to compare expected versus actual outcomes without special-case logic.
- A `workpack_exception` should bind the workpack, version, run, reason category, risk class, context, and remediation pointer into one structured inbox item.
- A `benchmark_pack` should point back to a specific promoted workpack version and its evidence, rather than copying the entire workpack payload.
- A `metric_snapshot` should capture point-in-time rollout and outcome data for promotion, ROI, and readiness views.

Store connector details and compiler metadata in a version-scoped JSON payload where schema churn is still expected. Do not place secrets in the workpack record.

## Data governance and storage hygiene

The shared contract should make replay, fixture, and benchmark evidence governable instead of assuming every payload can be stored forever in raw form.

- Every persisted ledger artifact or evidence reference should carry an explicit sensitivity class, access scope, retention tier, and redaction state.
- Connector secrets, auth tokens, raw credentials, and equivalent secret material must never be copied into `workpack`, `workpack_version`, `workpack_run`, or `simulation_run` records. Store only handles or redacted summaries.
- Replay-grade run records should default to reference-plus-summary storage for sensitive connector payloads. Full raw payload capture should remain exceptional, scoped, and governed by the most restrictive access class available to the tenant.
- Simulation fixtures and benchmark evidence should record whether they are masked, synthetic, or still contain source-derived sensitive fields. Unscrubbed fixtures may support tenant-local debugging, but they must not qualify as shareable benchmark evidence by default.
- Retention policy should be explicit per evidence class so temporary fixtures, replay traces, and benchmark lineage do not all live forever. The persistence design should allow archival or deletion without breaking immutable workpack version history.
- If later sections need to share or publish evidence, the default boundary should remain tenant-local until de-identification and trust clearance succeed.

## Persistence strategy

Create dedicated persistence for these records:

- `workpack`
- `workpack_version`
- `workpack_run`
- `simulation_run`
- `workpack_exception`
- `benchmark_pack`
- `metric_snapshot`

The persistence layer should follow these rules:

- Reference existing workflow, template, skill, browser-pack, agency, connector, and desktop assets by id or opaque reference rather than duplicating their internal runtime structures.
- Keep versioned workpack records immutable after publication.
- Keep run ledgers append-only so replay and debugging can reconstruct the exact planned and actual path.
- Store volatile compiler details and connector map expansions as JSON on the version record or a scoped companion record.
- Keep metric and readiness projections separate from immutable version records so rollups can change without rewriting source history.
- If ownership or assignment needs to be represented before Feature 080 exists, use an opaque actor reference or JSON reference, not a new persistent role-agent table.

## Route ownership and boundaries

This section should establish the ownership boundary for the shared contract so later work stays consistent.

- `workflow.ts` continues to own workflow-native assets and any compilation hooks that originate from workflow content.
- A new workpack lifecycle router or service layer should own workpack CRUD, version publishing, run recording, simulation, exception handling, benchmark publishing, and promotion actions.
- Shared contracts must remain importable by both sides without forcing persistence details into UI code or runtime orchestration code.
- The workpack layer must remain a reusable execution unit layer, not the persistent role model from Feature 080.

## Implementation guidance

1. Define the shared workpack types and Zod schemas first so later sections can depend on a single schema shape.
2. Add the database migration and schema changes only after the shared contract is stable.
3. Thread the same shared shapes through server helpers, router payloads, and client consumers instead of creating separate workpack representations.
4. Keep the workpack layer explicit about references to existing runtime assets so the feature compiles into current systems rather than replacing them.
5. Treat the workpack version as the unit of publication and the run ledger as the unit of replay.
6. Keep the Feature 080 compatibility rule explicit: workpacks must be addressable as reusable execution units, but this section must not introduce persistent role ownership semantics.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: the shared schemas accept valid `case_source`, `playbook`, `workpack`, `workpack_version`, `workpack_run`, `simulation_run`, `workpack_exception`, `connector_map`, `benchmark_pack`, and `metric_snapshot` payloads.
- Test: invalid lifecycle transitions, unknown autonomy modes, malformed side-effect classes, and unsupported exception categories fail closed.
- Test: published workpack versions reject in-place mutation semantics and require a new version for material changes.
- Test: workpack run payloads preserve planned steps, actual steps, approval checkpoints, artifact references, and connector response summaries through round-trip validation.
- Test: persistence schema can reference existing workflow, template, skill, browser-pack, agency, connector, and desktop assets without duplicating runtime internals.
- Test: benchmark pack records keep a stable pointer to the promoted workpack version and its evidence instead of copying the full workpack.
- Test: replay, fixture, and benchmark evidence payloads preserve sensitivity class, access scope, retention tier, and redaction state through validation and persistence boundaries.
- Test: secret-bearing connector fields are rejected or forced into reference-only storage instead of being persisted in raw form.
- Test: shareable benchmark evidence cannot be marked publishable unless its fixture de-identification state is explicit.
- Test: shared contract imports remain usable from the existing web shared, server, and client test setup.

## Done when

This section is complete when the codebase has one validated shared workpack contract, the database can persist versioned workpacks and replay-grade runs under explicit sensitivity, retention, and access rules, and later sections can rely on the same ids and enums without inventing a new lifecycle vocabulary.
