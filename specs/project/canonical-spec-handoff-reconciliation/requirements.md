# Canonical Spec Handoff and Repository Reconciliation

## Goal
Create one shared, evidence-backed handoff contract and deterministic tooling that discovers and reconciles every canonical Spec dynamically across configured roots, without implementing legacy feature requirements during the reconciliation migration.

## Authority and safety invariants
- Treat normative legacy `spec.md` files as read-only by default. Make no feature application/runtime changes to complete old Specs and do not revive retired systems.
- Reuse/generalize existing handoff and universal development lifecycle semantics; do not create a competing status engine.
- Keep Spec disposition, implementation lifecycle, and continuation decision independent.
- Use explicit evidence and confidence. Never infer cancellation, retirement, obsolescence, authority, verification, deployment, acceptance, or completion from age, revision number, file date, a completion document, a commit, or partial tests alone.
- Every discovered Spec directory, including malformed/missing/duplicate/alternate-root records, must appear in reconciliation output; discovered canonical records must equal global indexed records.
- Every valid canonical Spec receives machine-readable manifest and requirement ledger, generated human status, and observed/inferred reconciliation history. Never fabricate historical event timestamps.
- Preserve requirement provenance; only extract normative requirements conservatively. Keep partial supersession and multi-successor mapping first-class.
- Reconciliation is DISCOVER → RECONCILE → CLASSIFY → PROVE → INDEX. It does not automatically implement Specs.

## Required semantics
Support dispositions ACTIVE_CANONICAL, ACTIVE_SUPPORTING, LEGACY_COMPATIBILITY, SUPERSEDED_FULL, SUPERSEDED_PARTIAL, MERGED_INTO, RETIRED, HISTORICAL_ONLY, DORMANT_UNRESOLVED, CANCELLED_EXPLICIT, INVALID_OR_UNKNOWN. Support continuation decisions CONTINUE_REQUIRED, CONTINUE_RECOMMENDED, CONTINUE_OPTIONAL, VALIDATION_ONLY, MAINTENANCE_ONLY, DO_NOT_CONTINUE_SUPERSEDED, DO_NOT_CONTINUE_RETIRED, DO_NOT_CONTINUE_HISTORICAL, RECONCILIATION_REQUIRED, HUMAN_PRODUCT_DECISION_REQUIRED. Keep confidence HIGH, MEDIUM, LOW, UNRESOLVED and authority conflicts explicit.

The requirement ledger tracks applicability, current relevance, successor mapping, implementation and verification status/evidence, evidence SHA/freshness, blocker, next action, and final state PASS/FAIL/BLOCKED_TRUE_EXTERNAL/NOT_APPLICABLE. Intermediate states require a next action. Completion requires every applicable outcome criterion, including verification/deployment/acceptance where required.

## Tooling and generated views
Provide deterministic, idempotent, dry-run-capable tooling with structured JSON output, practical atomic writes, preservation of authoritative manual decisions, and commands for inventory, per-Spec/all reconciliation, status, next action, validation, indexing, stale evidence, and relationships. Generate `specs/_status/spec-index.json`, `SPEC-STATUS.md`, `reconciliation-report.json`, and `continuation-queue.json`, including consolidated ambiguity and exclusion views. STATUS.md is generated only.

## Workflow integration
Integrate the shared handoff contract with deep-project, deep-plan, deep-plan-quick, deep-implement, Orchestra, session-finish, integration-controller, and verification/deployment evidence flows. Updates must bind implementation, canonical integration, verification, deployment, and acceptance evidence to exact revisions. Spec `spec.md` remains normative requirement authority; handoff is implementation/lifecycle authority.

## Scope boundary
This work builds the framework and performs repository-wide metadata reconciliation only. It must not implement feature behavior from legacy Specs or rewrite their normative documents. The canonical Spec roots must be discovered from repository configuration and filesystem evidence, not a maintained Spec-ID allowlist. Include alternate roots and malformed records in an explicit report.

## Required policy scenarios
Cover all 30 scenarios from the user brief, including full/partial supersession, age neutrality, authority conflict, stale evidence, missing deployment/acceptance, security residuals, removed legacy implementation, multi-successor merge, idempotence, manual decisions, exhaustive global index invariants, no false COMPLETE, no fabricated history, generated status drift, and resume behavior.

## Definition of Done
1. One canonical shared handoff/lifecycle model exists and is consumed by required workflows.
2. Deterministic tooling inventories every discovered canonical Spec/root and records malformed candidates without silent omission.
3. Reconciliation and generated indexes preserve the separation of disposition, lifecycle, continuation, authority, confidence, evidence, and requirement-level residuals.
4. Legacy reconciliation does not implement feature code or mutate normative `spec.md` files.
5. All requested generated views, continuation and ambiguity queues, stale detection, validation, and relationship queries work idempotently.
6. Framework tests/audits cover the required policy scenarios and global invariants.
7. All safe checkpoints are integrated to the configured canonical development ref; post-integration validation and any production/deployment evidence are reported separately.

## Constraints
Use existing repository package conventions and dependencies. Do not run repository-wide TypeScript checks in the shared implementation session. Preserve all pre-existing dirty work. Do not use retired Agency, work/request, workpacks, legacy `/workflows`, OpenSandbox, or Docker/OpenSandbox dispatch systems.
