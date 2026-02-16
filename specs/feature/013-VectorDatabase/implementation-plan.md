# Implementation Plan: Vector Database Productionization (Feature 013)

Date: 2026-02-16
Primary Inputs: `spec.md`, `research-notes.md`, `interview-notes.md`

## 1. Delivery Strategy
Deliver in controlled phases that preserve existing search behavior while enabling provider interoperability.

1. Establish provider abstraction and effective-config resolution.
2. Wire gallery/library indexing and deletion hooks into existing DB job + Celery pipeline.
3. Implement provider dispatch in worker execution path (eliminate config/runtime drift).
4. Add/complete pgvector migration and tenant RLS enforcement on single primary database.
5. Implement staged provider cutover with readiness and rollback gates.
6. Add backfill/reindex workflows and operational observability.
7. Complete validation matrix across providers with tenant isolation negative tests.

## 2. Phase Plan

### Phase A: Provider Abstraction and Routing
- Define a provider interface consumed by Node search/indexing entrypoints.
- Implement adapters for Cloudflare Vectorize, pgvector, and Chroma with normalized method contracts.
- Add central resolver that reads active vectordb settings and cutover state.
- Replace direct Vectorize path in search/indexing call sites with abstraction layer.
- Ensure provider capability metadata (dimensions, supported filters, limits) is exposed for validation and operational checks.

### Phase B: Async Indexing Integration (Celery Primary)
- Keep existing `library_index_jobs` + Celery task processing as primary queueing framework.
- Extend job payload schema to represent source domain (`gallery`/`library`), operation (`index`/`delete`), tenant context, and dedupe key.
- Add index/delete enqueue hooks to scoped routers/services:
  - gallery create/update/delete flows
  - library create/upload/delete flows
  - media-to-library ingestion path where applicable
- Ensure worker handlers are idempotent and safe for retries.
- Align retry policy and dead-letter behavior with production reliability controls.
- Define queue SLOs and guardrails:
  - queue lag SLO for normal operations and reindex campaigns
  - max retry and terminal failure handling
  - dead-letter review and replay procedure
  - backpressure triggers that throttle new indexing intake when lag/failure thresholds are exceeded

### Phase C: Provider Switch and Staged Cutover
- Introduce switch state model with `current_read_provider`, `target_provider`, and campaign status.
- Enforce cutover governance:
  - freeze non-emergency vectordb config edits during active cutover windows
  - require optimistic-lock/version checks on switch-state updates to prevent concurrent-write drift
- On switch request:
  - validate target provider connectivity
  - launch reindex campaign
  - preserve old read provider during backfill window
- Define migration-time write policy (dual-write aware):
  - canonical writes target source-of-truth pipeline and target provider campaign path
  - mirrored writes to old provider remain enabled until cutover completes
  - reconciliation pass resolves write drift before readiness evaluation
- Define readiness gate as `coverage_95_plus_smoke`:
  - coverage >=95% eligible records indexed in target
  - smoke tests pass for key search paths
  - sampled parity queries meet minimum quality threshold against baseline provider
- Cut over reads only when gate passes.
- Roll back on `either` trigger:
  - indexing failure-rate breach threshold window
  - search regression (quality or latency)

### Phase D: pgvector Single-DB Migration + RLS
- Add migration path for pgvector extension and required vector tables/indexes.
- Apply tenant RLS policies for vector tables with deny-by-default posture.
- Verify policy coverage for select/insert/update/delete behaviors.
- Add migration verification checks (extension present, indexes present, policy enforcement).
- Provide migration rollback sequence and restore verification.

### Phase E: Backfill and Reindex Operations
- Replace backfill script stubs with real scoped data loaders for gallery/library.
- Support campaign-level progress tracking: queued, processed, succeeded, failed, skipped.
- Add resumable processing with dedupe to avoid duplicate vector records.
- Add post-backfill consistency checks against source-of-truth row counts.

### Phase F: Observability and Admin Operations
- Implement vector audit event model for index/delete/search/switch/reindex outcomes.
- Expose provider health, queue status, and campaign progress via admin-facing endpoints/UI.
- Add alerting thresholds for failure-rate spikes, latency regressions, and stalled campaigns.
- Surface masked credential state and explicit provider capability diagnostics in admin settings.

## 3. Impact Map (Regression-Sensitive Areas)

| Existing Area | Potential Regression | Mitigation |
|---|---|---|
| `search` router behavior | Empty/partial results during provider transitions | Staged cutover; readiness gate; rollback trigger |
| Gallery CRUD | Increased write latency if enqueue path is blocking | Non-blocking enqueue; timeout guard; fallback logging |
| Library indexing pipeline | Job schema drift or worker incompatibility | Versioned payloads; backward-compatible parser |
| Admin settings vectordb tab | Incorrect provider state after save/switch | Atomic config update and cache invalidation checks |
| Python worker processing | Default provider path ignoring selected config | Mandatory provider resolver in task entrypoint |
| Database migrations | Extension/policy migration failure impacting startup | Preflight checks and explicit migration rollback steps |

## 4. Regression Prevention Strategy
- Test-first rollout for each phase with focused unit and integration gates.
- Canary rollout by tenant cohort for switch/cutover logic where possible.
- Feature-flag controls for new provider dispatch and cutover activation.
- Runtime dashboards and alerting with ownership assignments for on-call response.
- Default alert thresholds for rollout operations:
  - queue lag >10 minutes for 15 minutes
  - indexing failure rate >5% over rolling 30 minutes
  - search latency p95 >1.5x baseline for 15 minutes
- Post-deploy verification checklist:
  - queue throughput and failure rate
  - queue lag SLO adherence and dead-letter size
  - search latency p95
  - cross-tenant isolation negative tests
  - campaign coverage progression

## 5. Data Safety Strategy

### Risk Classification
- **Risk level: `high`**.
- Rationale: provider/model switching requires full reindex; current state includes provider dispatch drift and incomplete delete hooks, creating risk of stale or missing search data.

### Pre-Migration Backup Plan
- Capture pre-change backups for vector-related operational tables and settings snapshots.
- For pgvector migration on primary DB:
  - backup target schema and metadata before extension/table/index changes
  - checkpoint migration state for deterministic restore
- Preserve previous provider data during staged cutover (no destructive purge before validation).

### Preflight Checklist (Required Before Migration/Cutover)
- Validate extension creation privileges and migration role permissions.
- Validate DB capacity headroom for index build and backfill windows.
- Validate index build configuration (memory/workers) against rollout size.
- Run RLS policy dry-run/verification queries for allow/deny cases.
- Confirm provider health checks and smoke-test harness readiness.

### Restore/Rollback Runbook
- Trigger conditions:
  - indexing failure rate >5% over a rolling 30-minute window
  - search regression detected (quality parity below threshold or latency p95 above agreed bound)
  - migration verification failure
- Rollback actions:
  1. Set read provider back to previous stable provider.
  2. Pause campaign writes to failing target provider.
  3. Restore affected DB migration state if schema rollback is required.
  4. Re-run smoke and tenant-isolation checks on restored path.
  5. Re-open rollout only after root-cause remediation and dry-run verification.
- Verification after rollback:
  - successful query and index operations on stable provider
  - queue resumes with acceptable error rate
  - no cross-tenant leakage in negative tests
  - vectordb config snapshot/version/hash consistency matches pre-cutover baseline

### Non-Destructive Migration-First Approach
Use `expand -> migrate/backfill -> contract`.
- Expand:
  - add extension/tables/indexes/policies and provider dispatch plumbing without removing old path
- Migrate/backfill:
  - reindex gallery/library content to target provider while old provider serves reads
  - keep mirrored writes active and reconcile drift
- Contract:
  - only after stability window, retire obsolete paths and cleanup stale artifacts

### Automated Migration/Backfill Checks
- Extension and schema existence validation.
- Policy verification for tenant RLS behavior.
- Coverage accounting by source domain and tenant.
- Consistency checks comparing source records vs indexed vectors.
- Smoke tests for search relevance and latency before cutover.
- Parity evaluation against baseline provider on a representative query set.

## 6. Compatibility Notes
- Existing Cloudflare Vectorize behavior remains functional through abstraction wrapping.
- Existing Celery-based indexing remains primary; enhancements are additive.
- Search API contracts stay stable for clients unless explicitly versioned.
- Provider-specific limits are normalized at service boundary; unsupported features must degrade predictably.
- Backward compatibility for in-flight legacy job payloads is required during transition.

### Provider Capability Compatibility Matrix
| Capability | Cloudflare Vectorize | pgvector | ChromaDB | Normalized Plan Behavior |
|---|---|---|---|---|
| Vector dimensions | fixed per index/model | configurable by model/table | fixed per collection | enforce provider-specific validation and campaign re-embed on switch |
| Tenant isolation primitives | namespace + metadata filters | SQL predicates + RLS | app-level metadata filtering | always apply server-derived tenant filters + provider/DB guardrails |
| topK/result limits | provider-specific limits | DB/query controlled | provider/query controlled | clamp request limits to safest provider-compatible defaults |
| Metadata filter indexing | requires metadata index management | native column/index strategy | metadata semantics vary by collection | provision filter-ready schema/indexes before campaign writes |
| Unsupported features | some constraints by API/index config | depends on extension/index config | feature set differs by deployment mode | explicit fallback path and admin-visible compatibility notes |

## 7. Test and Verification Plan

### Unit Coverage Priorities
- Provider resolver and setting/cutover-state resolution.
- Adapter contract conformance for all three providers.
- Queue job parser/idempotency behavior.
- RLS policy guard checks where testable at DB integration boundary.

### Integration Coverage Priorities
- gallery create -> index -> searchable
- gallery delete -> vector removed
- library create/upload -> index -> searchable
- library delete -> vector removed
- provider switch with staged cutover and readiness gate logic
- rollback execution on either configured trigger path
- cross-tenant negative search tests across providers

### Operational Validation
- Reindex campaign dry-run in staging with realistic content volume.
- Provider outage simulation during active campaign to verify rollback triggers and alert paths.
- Latency and failure-rate baseline comparison pre/post changes.
- Cutover rehearsal including rollback drill.
- Query-set parity evaluation before cutover:
  - fixed representative query corpus
  - minimum relevance parity threshold versus baseline provider
  - latency bound validation for key query classes

## 8. Execution Order and Dependencies
1. Provider abstraction and resolver foundation.
2. Queue payload/schema extension and worker provider dispatch alignment.
3. Router/service enqueue hooks for gallery/library.
4. pgvector migration + RLS + verification tooling.
5. Reindex/backfill operational workflows.
6. Staged cutover controls and rollback automation.
7. Observability/dashboarding and alerting.
8. End-to-end validation and rollout.

## 9. Ownership and Operational Readiness
- Node API team owns abstraction, router hooks, and admin settings integration.
- Python worker team owns Celery task dispatch and provider execution parity.
- Database owner validates pgvector migration and RLS rollout on primary DB.
- SRE/ops owner validates monitoring, alerts, and incident runbooks.

## 10. Done Criteria
- v1 domains (`gallery`, `library`) are auto-indexed and searchable through active provider.
- Deletes remove vectors reliably for v1 domains.
- Provider switch executes staged cutover using `coverage_95_plus_smoke` gate.
- Rollback path works on either trigger condition.
- pgvector runs on single primary DB with tenant RLS enforced.
- Observability and alerting provide actionable operational visibility.
