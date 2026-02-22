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
