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
