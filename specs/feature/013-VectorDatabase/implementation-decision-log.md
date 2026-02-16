# Implementation Decision Log

## 2026-02-16 Run Initialization

- step: preflight
- options: `stop_for_branch`, `proceed_here`
- decision: `proceed_here`
- mode: `asked`
- rationale: User explicitly confirmed continuing on current dirty `main` state.

- step: decision_style_handshake
- options: `ask_every_choice`, `smart_auto`, `auto_by_default`
- decision: `smart_auto` (reused)
- mode: `auto`
- rationale: `decision-mode.md` already exists and user did not request mode change.

- step: test_command
- options: manifest `PROJECT_CONFIG` command vs inferred defaults
- decision: `npm --workspace @smartspec/web test && cd python-backend && pytest`
- mode: `auto`
- rationale: Explicitly provided in `sections/index.md` PROJECT_CONFIG block.

- step: tooling
- options: `rg`, `grep/find`
- decision: `grep/find` fallback
- mode: `auto`
- rationale: `rg` is unavailable in this environment.

## Section 01 Decisions

- step: resolver_default_provider
- options: `chromadb` default vs `cloudflare_vectorize` default
- decision: `cloudflare_vectorize`
- mode: `auto`
- rationale: Preserve current production behavior and avoid silent provider flip.

- step: node_adapter_scope
- options: full pgvector/chroma runtime implementation vs explicit boundary stubs
- decision: boundary stubs with deterministic `VectorProviderError`
- mode: `auto`
- rationale: Keeps contract and resolver/dispatch behavior testable without introducing unverified DB/API assumptions.

## Section 02 Decisions

- step: payload_persistence_strategy
- options: add DB columns now vs additive service-layer payload contract
- decision: additive service-layer payload contract
- mode: `auto`
- rationale: Minimizes schema risk while enabling versioning, dedupe-key stability, and legacy parser compatibility immediately.

- step: enqueue_failure_behavior
- options: fail primary write vs non-blocking enqueue fallback
- decision: non-blocking fallback (`enqueue_error` result)
- mode: `auto`
- rationale: Primary API/library writes should remain successful on transient queue failures.

- step: backpressure_hook
- options: hard block all enqueue vs optional throttle for non-critical paths
- decision: optional throttle hook (`allowThrottle` + threshold function)
- mode: `auto`
- rationale: Preserves reliability while allowing controlled queue protection under lag.

## Section 03 Decisions

- step: worker_provider_resolution_source
- options: keep hardcoded Chroma path vs resolve provider from effective env-backed settings
- decision: resolve provider from `LIBRARY_VECTOR_PROVIDER`/`VECTOR_DB_PROVIDER` with normalized aliases and safe fallback
- mode: `auto`
- rationale: Reduces provider-dispatch drift and keeps worker behavior aligned with configurable rollout state.

- step: retry_classification_policy
- options: retry everything except `ValueError` vs explicit transient/permanent classifier
- decision: explicit classifier (`transient` => retry until max attempts; permanent => fail terminal immediately)
- mode: `auto`
- rationale: Prevents unproductive retries on tenant/entity/payload guardrail violations while preserving retries for transport/backend instability.

- step: dedupe_scope
- options: rely only on completed-status short-circuit for same job id vs dedupe-key short-circuit across duplicate jobs
- decision: dedupe-key short-circuit against recent completed jobs scoped by tenant + item
- mode: `auto`
- rationale: Improves idempotency for duplicated/replayed jobs without requiring schema changes.

## Section 04 Decisions

- step: migration_framework_alignment
- options: introduce new Alembic-only flow vs follow repository migration script pattern
- decision: follow existing repository migration script pattern (`python-backend/migrations/006_*.py`)
- mode: `auto`
- rationale: Keeps operational workflow consistent with existing migration inventory and migration-ordering checks.

- step: rls_policy_idempotency
- options: attempt create-only policy statements vs drop-and-recreate policy set per upgrade run
- decision: drop-and-recreate policy set on upgrade
- mode: `auto`
- rationale: Ensures deterministic policy definitions and prevents silent drift when policy SQL changes across iterations.

- step: extension_rollback_behavior
- options: always drop `vector` extension on rollback vs make extension drop explicit opt-in
- decision: extension drop is opt-in (`--drop-extension`)
- mode: `auto`
- rationale: Reduces destructive rollback risk when `vector` extension may be shared by other schemas/workloads.

- step: preflight_capacity_gate
- options: no capacity gate vs enforce configurable headroom threshold
- decision: enforce configurable capacity headroom (`PGVECTOR_MIGRATION_MAX_DB_BYTES` + minimum threshold)
- mode: `auto`
- rationale: Prevents running index-heavy migration steps on constrained databases without explicit operator acknowledgment.

## Section 05 Decisions

- step: campaign_state_persistence
- options: in-memory resume metadata vs persistent campaign table
- decision: persistent campaign table (`library_backfill_campaigns`) with migration `007_library_backfill_campaign.py`
- mode: `auto`
- rationale: Section objective requires resumable checkpoints and deterministic counters across process restarts.

- step: domain_scoping_source
- options: couple Python worker to separate gallery ORM model vs classify domains from `library_items.source`
- decision: classify using `library_items.source` (`media_history` => gallery, non-`media_history` => library)
- mode: `auto`
- rationale: Preserves tenant-scoped query safety and avoids unstable gallery model dependencies in the Python worker boundary.

- step: gallery_enqueue_behavior
- options: enqueue gallery via unsupported Python path vs skip enqueue with diagnostics
- decision: skip enqueue and record actionable diagnostics (`skip_reason`)
- mode: `auto`
- rationale: Avoids unsafe false-positive writes while still exposing campaign accounting/visibility for gallery scope.

- step: consistency_diagnostics_payload
- options: return full missing-entity set vs bounded sample
- decision: bounded missing-entity sample (max 50)
- mode: `auto`
- rationale: Keeps diagnostics actionable without unbounded response payload growth on large tenants.

## Section 06 Decisions

- step: switch_state_persistence_shape
- options: in-memory cutover state vs persistent DB model + migration
- decision: persistent model `library_provider_switch_states` with migration `008_library_provider_switch_state.py`
- mode: `auto`
- rationale: Section objective requires auditable, resumable, and monotonic state across process boundaries.

- step: optimistic_lock_enforcement
- options: in-memory version check only vs DB-conditional update on `(id, switch_version)`
- decision: DB-conditional updates with rowcount conflict detection
- mode: `auto`
- rationale: Ensures concurrent writes cannot silently override state transitions.

- step: readiness_gate_thresholds
- options: permissive ad-hoc thresholds vs strict `coverage_95_plus_smoke` defaults
- decision: coverage >=95%, smoke required, parity >=95%, reconciliation drift == 0
- mode: `auto`
- rationale: Aligns gating behavior to section contract and fails closed on drift.

- step: rollback_trigger_policy
- options: require both trigger classes vs either-trigger rollback
- decision: rollback on either indexing failure-rate breach (>=5%) OR search regression (explicit flag or latency >=1.5x)
- mode: `auto`
- rationale: Matches section requirement for fast recovery on either safety signal.

## Section 07 Decisions

- step: observability_storage_scope
- options: persistent audit table vs bounded in-memory audit stream + structured logs
- decision: bounded in-memory audit stream (`deque`) plus structured log emission and metric counters
- mode: `auto`
- rationale: Enables immediate audit schema validation with minimal migration risk while preserving operational visibility.

- step: admin_health_surface
- options: add broad UI/dashboard first vs add admin service aggregator + endpoint contract now
- decision: add service aggregator + `/api/admin/vectordb/health` endpoint now
- mode: `auto`
- rationale: Meets section diagnostics objective while keeping scope constrained to backend operational data contract.

- step: alert_policy_ownership_metadata
- options: threshold checks only vs thresholds with owner/runbook metadata
- decision: include owner + runbook URL in alert payloads
- mode: `auto`
- rationale: Aligns alerts with operational ownership and incident response requirements.

- step: credential_diagnostics_strategy
- options: hide provider config entirely vs masked diagnostic payload with health/capabilities
- decision: masked config with recursive secret redaction + explicit connection health/capabilities fields
- mode: `auto`
- rationale: Preserves actionable admin diagnostics without leaking credentials.

## Section 08 Decisions

- step: acceptance_validation_scope
- options: full staging e2e pipeline in-section vs acceptance-style integration tests in isolated DB fixtures
- decision: acceptance-style integration tests in isolated DB fixtures
- mode: `auto`
- rationale: Provides deterministic validation for rollout gates while avoiding environment-coupled flakiness in this implementation section.

- step: delete_acceptance_path
- options: defer delete acceptance to future section vs add scoped delete helper now
- decision: add `delete_library_item_vectors` helper for indexed chunk cleanup and soft-delete acceptance checks
- mode: `auto`
- rationale: Enables explicit delete acceptance coverage required by section objective.

- step: rollout_artifact_format
- options: inline checklist only in section notes vs dedicated canary runbook artifact
- decision: dedicated `rollout-canary-runbook.md` artifact with cohort gates and rollback procedure
- mode: `auto`
- rationale: Improves operational handoff and keeps rollout ownership/checklists reusable.

## Completion Remediation Decisions (2026-02-16)

- step: node_provider_parity_strategy
- options: keep deterministic stubs vs implement concrete adapters in Node runtime
- decision: implement concrete `pgvector` and local persisted `chromadb` adapters
- mode: `auto`
- rationale: Closes production parity gap while preserving deterministic contract/error behavior.

- step: worker_delete_contract
- options: keep fail-closed delete path vs execute `operation=delete` in worker
- decision: execute delete path with idempotent missing-item handling (`fail_on_missing=False`)
- mode: `auto`
- rationale: Completes queue payload contract for index+delete without breaking retry semantics.

- step: gallery_backfill_execution
- options: keep gallery skip diagnostics vs enqueue gallery jobs in campaign/batch runners
- decision: enqueue gallery jobs with dedicated job type and no skip reason
- mode: `auto`
- rationale: Achieves domain parity and removes known rollout blocker.

- step: cutover_runtime_wiring
- options: keep service-only cutover controls vs expose runtime admin endpoints
- decision: added provider-switch admin endpoints (state/assert/request/approve/rollback)
- mode: `auto`
- rationale: Makes governance controls callable by runtime admin operations.

- step: security_hardening_decision
- options: `plan_now`, `fix_now`, `defer`
- decision: `defer`
- mode: `auto`
- rationale: No critical/high findings; remaining items are medium-risk hardening and test-depth improvements recorded in `implementation-security-review.md`.

- step: security_hardening_followup
- options: keep `defer` vs implement medium findings now
- decision: implement now (`fix_now`)
- mode: `auto`
- rationale: User requested production-close completeness; implemented endpoint-level admin cutover/health tests and lock-protected Chroma writes to remove medium findings.
