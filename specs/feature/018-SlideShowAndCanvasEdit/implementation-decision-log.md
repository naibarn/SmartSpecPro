# Implementation Decision Log

## 2026-02-22 - Section 01 - Working Tree/Branch Strategy
- options_considered:
  - `switch_branch`: create feature branch before implementation
  - `proceed_main`: proceed on `main` with current dirty tree
- decision_taken: `proceed_main`
- mode_used: `asked`
- rationale: User explicitly selected option 2 after preflight warning.

## 2026-02-22 - Section 01 - Presentation Guard Contract Shape
- options_considered:
  - `throw_errors`: throw RPC errors for wrong-editor and disabled states
  - `deterministic_payload`: return deterministic guard payloads with stable error code + recovery CTA
- decision_taken: `deterministic_payload`
- mode_used: `auto`
- rationale: Lower frontend integration risk and directly satisfies section requirement for deterministic recovery metadata.

## 2026-02-22 - Section 01 - Shared Contract Placement
- options_considered:
  - `server_local`: keep presentation constants/contracts only in server router
  - `shared_module`: define constants/contracts under shared module and consume from server/client
- decision_taken: `shared_module`
- mode_used: `auto`
- rationale: Section explicitly requires shared typed contracts and stable machine-readable codes used by backend/client.

## 2026-02-22 - Section 02 - Presentation Table Shape
- options_considered:
  - `reuse_library_only`: store all slide/deck data directly in `library_items.metadata`
  - `dedicated_tables`: add additive `presentation_*` tables with explicit constraints
- decision_taken: `dedicated_tables`
- mode_used: `auto`
- rationale: Section objective explicitly requires ordering constraints, byte totals, and source metadata that are safer and queryable with dedicated schema.

## 2026-02-22 - Section 02 - Reorder Write Strategy
- options_considered:
  - `range_only_updates`: update only impacted range indexes
  - `bounded_full_rewrite`: rewrite deck order with temporary offset inside transaction
- decision_taken: `bounded_full_rewrite`
- mode_used: `auto`
- rationale: Simpler correctness under uniqueness constraints; bounded cost is acceptable at MVP slide limit.

## 2026-02-22 - Section 03 - Service Orchestration Boundary
- options_considered:
  - `router_heavy`: keep permission/lifecycle/limit logic directly in tRPC router procedures
  - `service_layer`: move orchestration to dedicated `presentationService` and keep router focused on validation + error mapping
- decision_taken: `service_layer`
- mode_used: `auto`
- rationale: Aligns with section objective, keeps policy logic reusable for future frontend/export flows, and reduces router complexity.

## 2026-02-22 - Section 03 - Error Contract Strategy
- options_considered:
  - `trpc_code_only`: rely only on generic tRPC error codes
  - `stable_presentation_codes`: include deterministic presentation machine codes in service errors and map them to tRPC classes
- decision_taken: `stable_presentation_codes`
- mode_used: `auto`
- rationale: Frontend needs deterministic limit/lifecycle handling; stable presentation codes keep client branching robust while preserving existing tRPC semantics.

## 2026-02-22 - Section 04 - Conflict Transport Shape
- options_considered:
  - `custom_success_union`: return conflict payload in normal success union to avoid thrown errors
  - `trpc_conflict_error`: throw `CONFLICT` with structured payload attached for parser compatibility
- decision_taken: `trpc_conflict_error`
- mode_used: `auto`
- rationale: Keeps HTTP semantics aligned (`409`) while preserving deterministic conflict payload metadata for client recovery.

## 2026-02-22 - Section 04 - Version Precondition Granularity
- options_considered:
  - `deck_only`: use deck version for all write endpoints
  - `deck_and_slide`: use deck version for deck/asset/reorder operations and slide version for slide content writes
- decision_taken: `deck_and_slide`
- mode_used: `auto`
- rationale: Reduces unnecessary content-write conflicts and aligns save conflict checks with the resource being edited.

## 2026-02-22 - Section 05 - Editor Interaction Model
- options_considered:
  - `drag_drop_reorder`: introduce drag-and-drop for slide ordering in MVP
  - `deterministic_buttons`: use explicit up/down controls for ordering
- decision_taken: `deterministic_buttons`
- mode_used: `auto`
- rationale: Lower complexity and deterministic testability while still meeting section reorder requirements.

## 2026-02-22 - Section 05 - Canvas State Boundary
- options_considered:
  - `inline_state_only`: keep all element mutation logic inline in page component
  - `state_helper_module`: move element normalization/add/update logic into dedicated helper module with unit tests
- decision_taken: `state_helper_module`
- mode_used: `auto`
- rationale: Keeps page logic manageable and directly validates targeted-element mutation behavior required by section tests.

## 2026-02-22 - Section 06 - Conversion Idempotency Storage Strategy
- options_considered:
  - `durable_cross_instance`: implement DB/queue-backed distributed idempotency and lock state in this section
  - `process_memory_mvp`: use deterministic in-process lock/idempotency registry for MVP section scope
- decision_taken: `process_memory_mvp`
- mode_used: `auto`
- rationale: Keeps section implementation focused on contract semantics and testability while deferring distributed orchestration to later hardening.

## 2026-02-22 - Section 06 - Compatibility Contract Shape
- options_considered:
  - `implicit_flags`: expose minimal booleans without source-format/guidance details
  - `explicit_contract`: include schema version, source format, convertability, and user guidance message
- decision_taken: `explicit_contract`
- mode_used: `auto`
- rationale: Improves frontend determinism and aligns with section requirement for clear read-only/unsupported guidance and parser-stable payloads.

## 2026-02-22 - Section 07 - Export Queue Integration Boundary
- options_considered:
  - `full_worker_dispatch`: integrate direct external queue/worker dispatch in this section
  - `contract_first_adapter`: implement render-spec adapter + enqueue abstraction with in-process state for MVP
- decision_taken: `contract_first_adapter`
- mode_used: `auto`
- rationale: Keeps section focused on deterministic contract validation, dedupe, and throttling while avoiding unrelated operational coupling in the current scope.

## 2026-02-22 - Section 07 - Dedupe Key Strategy
- options_considered:
  - `idempotency_required`: reject requests without explicit idempotency key
  - `hybrid_fingerprint`: use explicit key when provided, fallback to stable tenant/user/deck/format fingerprint
- decision_taken: `hybrid_fingerprint`
- mode_used: `auto`
- rationale: Preserves duplicate-click protection for current UI behavior while still honoring explicit idempotency keys when available.

## 2026-02-22 - Section 08 - Observability Storage Strategy
- options_considered:
  - `external_sink_now`: wire metrics/logging directly to external telemetry in this section
  - `in_process_first`: implement deterministic in-process metrics/log contracts now and defer sink integration
- decision_taken: `in_process_first`
- mode_used: `auto`
- rationale: Keeps section scope on contract/test coverage and rollout guard behavior without introducing infrastructure coupling.

## 2026-02-22 - Section 08 - Export Emergency Guard Scope
- options_considered:
  - `full_feature_disable`: disable all presentation reads/writes for export incidents
  - `write_only_export_disable`: block export writes while preserving read safety and diagnostics
- decision_taken: `write_only_export_disable`
- mode_used: `auto`
- rationale: Matches rollout objective to contain queue risk quickly while maintaining operator visibility and user read access.

## 2026-02-22 - Section 09 - Regression Layer Strategy
- options_considered:
  - `full_browser_e2e`: add browser-level end-to-end suite for create/edit/export/reopen now
  - `deterministic_service_regression`: add service-level workflow regression tests with deterministic dependencies
- decision_taken: `deterministic_service_regression`
- mode_used: `auto`
- rationale: Lower flake risk and faster CI feedback while still validating contract-critical lifecycle, conversion, export, and reopen behavior.

## 2026-02-22 - Section 09 - Cleanup Validation Placement
- options_considered:
  - `db_query_only`: rely only on ad hoc SQL checks for orphan/stale detection
  - `pure_helpers_plus_tests`: add pure helper detectors with repeatable unit coverage first
- decision_taken: `pure_helpers_plus_tests`
- mode_used: `auto`
- rationale: Keeps cleanup invariants testable and reusable by future scheduled consistency jobs without coupling section scope to infra wiring.

## 2026-02-22 - Section 10 - Release Gate Implementation Form
- options_considered:
  - `pipeline_script_only`: implement readiness checks only as external release scripts
  - `typed_policy_module`: codify readiness checks in typed service module with unit tests
- decision_taken: `typed_policy_module`
- mode_used: `auto`
- rationale: Provides deterministic, testable contracts that can be reused by both CI and runbook tooling.

## 2026-02-22 - Section 10 - Ownership Validation Scope
- options_considered:
  - `minimal_owner_check`: require only one global owner field
  - `incident_class_owners`: require explicit owners for conflict, conversion, and export incident classes
- decision_taken: `incident_class_owners`
- mode_used: `auto`
- rationale: Aligns with rollout objective to keep incident triage ownership explicit for the highest-risk operational classes.

## 2026-02-22 - Finalization - Execution Context on Protected Branch
- options_considered:
  - `proceed_here`: continue finalization on `main` with current dirty tree
  - `stop_for_branch`: stop and resume after branch/clean-state switch
  - `proceed_selective`: continue but restrict touches to feature planning artifacts only
- decision_taken: `proceed_here`
- mode_used: `asked`
- rationale: User explicitly selected option 1 during finalization preflight.

## 2026-02-22 - Finalization - Full Suite Failure Handling
- options_considered:
  - `stop_on_full_suite_failure`: block security re-review until full suite is green
  - `continue_with_documented_failures`: record suite failures and continue mandatory security re-review
- decision_taken: `continue_with_documented_failures`
- mode_used: `auto`
- rationale: Full-suite failures are broad repository baseline/environment issues outside presentation scope; finalization still requires security re-review and explicit risk capture.

## 2026-02-22 - Finalization - Post-Re-Review Hardening Path
- options_considered:
  - `plan_now`: produce focused hardening plan before closing
  - `fix_now`: immediately implement critical/high findings
  - `defer`: carry findings forward without new hardening artifact
- decision_taken: `plan_now`
- mode_used: `asked`
- rationale: User selected option 1 after receiving the mandatory post-re-review prompt.

## 2026-02-22 - Hardening Stream A - State Management Strategy
- options_considered:
  - `externalize_now`: move export state fully to shared external store in this pass
  - `bounded_in_memory_now`: implement bounded in-memory TTL/cap safeguards immediately, defer externalization
- decision_taken: `bounded_in_memory_now`
- mode_used: `auto`
- rationale: Provides immediate OOM-risk mitigation with low integration risk and preserves current contracts while leaving cross-instance state externalization as a planned follow-up.

## 2026-02-22 - Hardening Stream B - Validation Enforcement Layer
- options_considered:
  - `router_only_validation`: rely on input schema validation at router boundary only
  - `shared_schema_plus_service_guard`: validate shape via shared schema and enforce payload-byte limits in service layer
- decision_taken: `shared_schema_plus_service_guard`
- mode_used: `auto`
- rationale: Preserves deterministic contracts at API boundary while adding defense-in-depth for non-router call paths and oversized payload protection.
