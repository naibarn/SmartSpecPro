# Section 02 — Native Artifact Lifecycle

## Goal

Implement the native-only canonical artifact lifecycle behind the Section 01 gates. The feature must remain usable with all external providers disabled. Persistence is conditional: add no DDL unless the G0 record proves a durable owner, tenant isolation, deletion/retention, backup/recovery, and reference closure.

## Dependencies

- Depends on: Section 01 reconciliation record, canonical schemas, and flag policy.
- Blocks: Sections 04–07.
- Must reuse: existing tenant/auth/audit conventions and `worker_jobs` plus outbox for genuinely asynchronous work only.

## Tests first

Create focused service tests before implementation.

1. Native request normalization creates an artifact/version with a deterministic digest while all provider flags are false.
2. Read returns only the caller tenant/project; cross-tenant reads, stale version writes, unsupported schema versions and invalid rights metadata fail closed.
3. Append-version, fork, compare, decision, cancellation, and idempotent replay retain immutable prior versions and lineage.
4. Owner transfer requires reauthorization; retention/delete marks references for collection without deleting a still-referenced asset.
5. Simulated retry/restart preserves idempotency/result linking. If asynchronous work is registered, test canonical `worker_jobs` + outbox lifecycle, cancellation, retry ownership and result linkage.
6. If G0 has no approved storage owner, test the storage-adapter interface with an in-memory fake and assert there is no migration/schema change. Do not weaken this gate to make a test pass.

## Implementation

1. Add a design artifact service and storage adapter in the shared/server layer selected by local conventions. Expose explicit operations: create draft, read, append immutable version, fork, compare semantic diff, record decision, transfer ownership, retention/delete request, and resolve reference closure.
2. Normalize a native design request into canonical artifact content and provenance `native`. Native creation must not invoke provider clients. Preserve prompt input according to the Section 01 safe-envelope policy.
3. Enforce tenant/project authorization in every service entry point, use existing audit patterns, and return typed failures for authorization, conflict, stale decision, storage unavailable, and unsupported schema.
4. If G0 verifies an existing durable owner, implement the smallest adapter to that owner and prove design artifact versions survive worker job cleanup. If it does not, implement only the adapter contract/fake and update the reconciliation record with the exact external schema-owner decision required. Do not add speculative migration tables or make `worker_artifacts` authoritative.
5. For work that actually becomes long running, add one server-owned job type/executor through the canonical job-control-plane gateway and outbox. It must use the canonical idempotency key, cancellation, retry policy, result link, and audit path. Do not introduce queues, schedulers, approval engines, or an in-house workflow engine.
6. Keep persistence references normalized; never accept arbitrary URLs or attach raw provider output. Model asset rights and reference-aware GC eligibility explicitly.

## Files to inspect/likely touch

- `apps/web/shared/workerRuntime.ts`, `apps/web/shared/featureFlags.ts`
- `apps/web/server/routes/jobControlPlane.ts` and its gateway/service dependencies
- `apps/web/server/services/` nearest durable artifact and audit services
- `apps/web/drizzle/schema.ts` only if the G0 gate permits a minimal approved change
- corresponding focused `apps/web/**/__tests__/*.test.ts`

## Completion criteria

- Native artifact lifecycle is provider-independent, idempotent, version-immutable, tenant isolated, and authorization/audit aware.
- Storage has either verified durable closure or an explicit fail-closed adapter blocker; no accidental job-cascade loss is possible.
- Long-running execution, if any, is exclusively `worker_jobs` plus outbox.
- All external/provider flags remain false.

## Implementation record

- Added an injected `DesignArtifactRepository` port and native service boundary for create/read/append in `apps/web/server/services/designArtifactService.ts`. The repository contract requires idempotent insert-only writes and an atomic expected-latest-version check for append.
- Added test-only in-memory adapter coverage for default-off behavior, native-only create, immutable v1 payload, read isolation, stale version rejection, idempotent replay and version-specific internal refs.
- Authorization uses an injected actor-scoped port; the request's tenant/project/user must match that server-owned actor context. Audit events distinguish `attempted` writes from `replayed` idempotent results; a future production adapter must close transactional/outbox audit semantics before user-facing wiring.
- Repository inspection confirmed `conversationArtifacts` is conversation/user scoped and `worker_artifacts` cascades with its job. Neither is adopted as canonical design storage. No production repository adapter, migration, route, or worker executor is added.
- Focused tests: `cd apps/web && npm test -- --run shared/designIntelligence.test.ts shared/__tests__/featureFlags.designIntelligence.test.ts server/services/__tests__/designArtifactService.test.ts` — 3 files, 32 tests passed.
- **Blocker remains open:** durable tenant/project storage owner, retention/delete policy, backups/recovery, asset reference closure and atomic uniqueness semantics need a verified authority before a production adapter or DDL. The service is not wired into a user-facing path; section acceptance for durable lifecycle is therefore not complete.

## UI/UX Contract

### Target User / JTBD
N/A for this backend/contract section; its outputs serve the authenticated design-authoring user described by Section 06.

### Surface Inventory
N/A; this section adds no browser route or screen.

### Component Map
N/A; no UI component is owned here. Contract/service ownership is specified above; UI is owned by Section 06.

### State Matrix
N/A for direct UI. Service outcomes (success, validation failure, unauthorized, stale version, cancellation, unavailable provider) must be machine-readable for Section 06.

### Responsive Matrix
N/A; no layout is changed by this section.

### Accessibility Acceptance
N/A for direct UI; this section must not remove accessibility metadata consumed by the UI.

### Copy Contract
N/A; user-visible Thai/English text belongs to Section 06 localization resources. Never expose raw provider or secret errors.

### Browser Evidence Required
N/A for direct UI; integration browser evidence is collected in Section 06 and final hardening.
