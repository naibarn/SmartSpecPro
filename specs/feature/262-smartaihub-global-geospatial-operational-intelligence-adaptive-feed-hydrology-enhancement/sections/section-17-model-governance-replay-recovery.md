# Section 17 — Model governance, replay, retention and recovery

## Goal and safety boundary

Make projections, derived hydrologic outputs and future forecasts reproducible, revision-scoped, bounded and recoverable. No quantitative/life-safety model is enabled by this section until input coverage, calibration/backtesting, valid basin envelope, uncertainty and owner approval are independently demonstrated. LLM narrative never substitutes for hydrologic validation. This section does not create another job, event or observation authority.

## Tests first

- Model registry tests bind source code/container/artifact hash, feature/forcing versions, configuration, spatial validity envelope, training/calibration corpus, uncertainty semantics, owner approvals and release status. Reject mutable/unidentified artifacts or invalid jurisdiction envelope.
- Forecast lifecycle tests preserve run identity and issued/effective/valid times; supersede overlapping runs deterministically; withdraw/correct runs without deleting history; stale outputs cannot act.
- Verification tests bind predictions to later observation windows, threshold versions, sample counts, missingness/censoring and calibration metrics; refuse calibrated-probability claims when insufficient or correlated evidence.
- Replay tests use immutable capture/event revisions, projection code version and policy/config manifest; deterministic replay yields the same output hash; changed revisions invalidate only affected dependents; bundle tampering fails.
- Recovery tests for worker restart, lease loss/fencing, replay/backfill retry, projection rebuild, database restore, provider transition, rollback, kill-switch expiry, cache invalidation and DR RTO/RPO.
- Load tests exercise viewport/query/graph budgets and priority load shedding; optional enrichments drop before critical emergency intake/list access.

## Implementation

1. Reuse the canonical `worker_jobs` + transactional outbox, lease/fencing/idempotency and retry classification from Section 06/Spec260. Forecast or projection recomputation uses deterministic scoped work inputs (source revisions, area/graph revision, policy, algorithm/artifact hash); queue delivery is not job truth.
2. Use append-only canonical observations and reviewed source evidence. Store derived products as rebuildable revisioned products keyed by input manifest and implementation version. A correction creates a new revision and dependency invalidation; never destructively overwrite accepted history.
3. Define a model registry only if the repository has no existing approved model artifact registry. Require immutable artifact identity, owner, validity area/time, input contracts, units/datum, run metadata, known failure envelope, calibration/backtesting report and release/canary state.
4. Support shadow/canary rollout, metric comparison, scoped rollback and prior-run retention. A model cannot publish an official warning or actionable “safe route”; only authorized human/system policy can create canonical official alerts through the existing Spec260 authority.
5. Add replay bundles containing source/capture refs and hashes, observation/event revision IDs, adapter/schema version, geography/graph revision, projection/model artifacts, policies, disclosure version and output hashes. Minimize or redact sensitive data according to privacy/legal hold rules; do not export provider raw data without rights.
6. Document retention/downsampling and spatial/time partitioning based on expected volume; preserve extremes, threshold crossings, legal holds and provenance. Backfill/rebuild has per-region/tenant budget, priority, cancellation and resumability.
7. Define recovery runbook and tests for active incident: pause affected provider/model, keep safe public lists, retain accepted emergency reports/alerts/watches, replay from last verified watermark, compare projection checksums, and restore with a declared compatibility plan.

## Dependencies and gates

Sections 06–10 supply canonical event/time-series and deterministic impact; section 14 supplies privacy/deletion/hold; section 16 supplies operator health and kill switch. Migration/config files remain conductor-serial. External hydrology calibration, production artifact signing, independent validation, DR infrastructure and real Cloudflare/provider behavior are final gates, not inferred from local replay tests.

## Completion evidence

Deterministic replay and recovery tests pass with changed-source revisions, correction, stale job and resource-budget scenarios. Model artifacts and forecast runs remain auditable and impossible to promote beyond their validity envelope. No life-safety quantitative claim is enabled without external validated evidence.

## UI/UX Contract

### Target User / JTBD
Backend governance and deterministic recovery only; operators review model/provider lifecycle through Section 16.

### Surface Inventory
No new UI surface is introduced by this section.

### Component Map
Model registry, replay bundles and canonical worker recovery services; Section 16 owns operational controls.

### State Matrix
Shadow, canary, released, withdrawn, stale and invalid model states are emitted as governed server status; this section does not render them.

### Responsive Matrix
Not applicable; no screen is authored.

### Accessibility Acceptance
Not applicable to this backend-only section; any operator controls follow Section 16.

### Copy Contract
No user copy authored. Never label an unvalidated model estimate as an official warning or safe recommendation.

### Browser Evidence Required
No standalone browser evidence; integrated evidence checks lifecycle status via Section 16 and proves no invalid model output reaches public projections.
