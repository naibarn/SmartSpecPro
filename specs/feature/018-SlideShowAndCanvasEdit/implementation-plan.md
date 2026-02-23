# Implementation Plan: Feature 018 Slideshow and Canvas Edit (MVP)

## 1) Delivery Strategy
Deliver the feature in additive, low-risk phases that align with existing `library` and `mediaJobs` architecture. The implementation remains tenant-scoped and permission-checked through existing patterns, while introducing a new presentation domain for editor and slide data.

Execution priorities:
1. Establish data model and APIs with optimistic versioning.
2. Deliver usable editor + slide CRUD + save semantics.
3. Integrate playback and basic export.
4. Add PPTX read-only compatibility and one-time conversion path.
5. Harden validation, observability, and regression coverage.

## 2) Architecture and Module Plan

### 2.1 Backend Additions
- Add a new presentation router module under `apps/web/server/routers/` and register it in `apps/web/server/routers.ts`.
- Add a presentation service layer under `apps/web/server/services/` for:
  - slide ordering and transactional reorder
  - version checks and conflict handling
  - deck limit validation
  - source attachment metadata and conversion bookkeeping
- Reuse existing library authz primitives and tenant resolution flow.
- Reuse existing media job orchestration for MP4 export, adding a presentation-to-render-spec adapter.

### 2.2 Schema and Persistence
- Add additive tables (or equivalent) for:
  - presentation metadata
  - slide records with order/version and `slide_content` JSON
  - presentation asset links
  - source attachment/import fidelity metadata
- Keep query-critical fields materialized in columns (title, slide_count, updated_at, version).
- Keep flexible layout and element payload in JSON per slide.
- Enforce ordering invariants with a unique constraint on `(presentation_id, order_index)` and a reorder algorithm that uses bounded transactional updates to avoid duplicate slots.
- Add authoritative deck byte-accounting fields and update hooks so warning/hard-limit enforcement is derived from server-tracked totals, not client estimates.

### 2.3 Frontend Additions
- Add presentation editor page and route under `apps/web/client/src/pages/`.
- Add presentation UI components under `apps/web/client/src/components/` (presentation namespace):
  - slide panel
  - basic canvas viewport and element renderer
  - properties sidebar (MVP subset)
  - playback shell
  - export panel
- Add typed API bindings and contracts in client and shared type files.
- Integrate presentation actions into Document Management list/item interactions.

### 2.4 Import/Compatibility Path
- Preserve existing office items as read-only.
- Add conversion workflow for first edit request:
  - create internal presentation entity
  - generate per-slide `slide_content` payloads best-effort
  - mark unsupported constructs as `partial_fidelity`
  - keep immutable link to original source file
- Require conversion idempotency via request idempotency key and source-level lock semantics so retries/double-clicks cannot create duplicate converted decks.

## 3) API and Behavior Plan

### 3.1 CRUD and Editing Surface
Implement endpoints for:
- create/get/update presentation metadata
- add/duplicate/delete/reorder slides
- update slide content and slide settings
- attach/list presentation assets

Behavioral guarantees:
- hard server-side limits enforced for slides/assets/sizes
- validation errors return stable machine-readable codes and user-friendly messages
- write paths are idempotent where practical
- define a published error-code catalog for all limit and conflict failures so frontend handling remains deterministic

### 3.2 Save and Conflict Semantics
- All mutating endpoints receive `expected_version` (or header equivalent).
- On mismatch, return `409` with:
  - `conflict_schema_version` for contract compatibility signaling
  - latest version numbers
  - latest payload for conflicting resource
  - conflict reason code
- Client UX supports `Reload`, `Overwrite`, `Copy as new deck` (no auto-merge in MVP).
- Autosave may use constrained last-write-wins for explicitly non-critical fields only when declared safe.

### 3.3 Playback and Export
- Build player payload from ordered slides and defaults.
- PNG export path: deterministic 1920x1080 per slide.
- MP4 export path:
  - accepted transitions: `cut`, `fade`
  - normalize frame properties before filter graph assembly
  - deterministic timing from slide duration defaults and transition durations
- Export uses existing async job pipeline and status tracking patterns.
- Export trigger endpoint enforces dedupe/idempotency semantics for retried requests and repeated click bursts.
- Export trigger endpoint enforces bounded per-user and per-deck enqueue throttles with stable error responses.
- Add versioned render-spec contract (`schema_version`) between web enqueue and Python worker ingest with strict validation and explicit failure behavior for unknown versions.

## 4) Impact and Regression Map

### 4.1 Existing Flows Potentially Affected
- Document Management open/create item workflows.
- Library item type inference and editor routing behavior.
- Upload handling and library link persistence.
- Media export queue and worker load characteristics.
- Permission checks on library-owned resources.

### 4.2 Regression Blast Radius
- Mis-routed item type can send existing documents to wrong editor.
- Incorrect tenant linkage can expose or deny cross-tenant assets.
- Incorrect reorder logic can corrupt slide order and export sequence.
- Export adapter defects can regress existing media job queue stability.

### 4.3 Regression Prevention Strategy
- Add focused router/service tests for presentation flows.
- Add contract tests for conflict handling (`409` payload shape).
- Add integration tests for editor routing by item type.
- Add worker-adapter tests for render-spec normalization and transition constraints.
- Add conversion retry/idempotency tests to prevent duplicate deck creation.
- Add reorder concurrency matrix coverage (swap, insert-middle, bulk move, concurrent reorder submit).
- Add lifecycle regression tests for soft-delete and restore transitions to verify expected presentation route deny/allow behavior.
- Gate rollout behind a presentation feature flag if available, then progressive enablement by tenant cohort.
- Add targeted runtime logging for conflict rate, export failure classes, and conversion fidelity outcomes.

## 5) Data Safety and Migration Strategy

### 5.1 Risk Classification
- Data risk: `low`.
- Rationale:
  - schema is additive
  - no destructive table/column removal in MVP
  - moderate operational risk from new relationships and conversion writes

### 5.2 Pre-Migration Backup Plan (Required for low/high)
Before applying production migration:
- take logical backup of impacted DB schemas (including `library_*` and new presentation tables)
- capture migration baseline metadata (row counts for key tables, schema hash/version)
- snapshot object storage prefixes used by presentation uploads if environment supports versioning/snapshot tools

### 5.3 Non-Destructive Migration Sequence
1. Expand schema
- create new presentation tables and indexes
- add new enum/string usage paths in code without changing old behavior

2. Migrate/backfill
- no bulk data backfill required for MVP baseline
- optional type-normalization backfill for known `presentation` metadata inconsistencies only if explicitly enabled

3. Validate
- migration smoke checks: tables/indexes/constraints present
- write/read smoke checks for create deck, add slide, reorder, save
- ensure old document workflows still pass existing tests

4. Contract (deferred)
- no contract/removal step in MVP
- any cleanup of legacy paths deferred to later phase after adoption metrics

### 5.4 Rollback and Restore Runbook
Rollback trigger conditions:
- migration fails partially
- permission leakage or cross-tenant data access detected
- persistent save conflicts due to server version mismatch bug
- export failure rate exceeds acceptable threshold after release

Rollback actions:
- disable presentation feature flag/new routes
- stop new conversion jobs
- restore DB from pre-migration backup if schema/data corruption confirmed
- restore storage objects from snapshot/versioned state if asset-link corruption is detected

Verification after rollback/restore:
- library document operations pass smoke checks
- no orphaned presentation references in library links
- tenant-level access checks return expected deny/allow behavior
- media job queue health returns to baseline

### 5.5 Post-Migration Consistency Checks
- presentation row count equals count of successfully created presentation library items
- slide_count column matches actual slide rows per presentation
- all presentation assets reference existing tenant-scoped library/upload records
- no orphaned presentation asset-link rows remain after failed conversion rollback or slide deletion cleanup
- no stale uploaded objects remain under presentation prefixes after lifecycle cleanup completes
- no duplicate slide order indexes per presentation
- deck byte totals equal summed asset-link usage and threshold flags are consistent with configured warning/hard limits

## 6) Backward Compatibility Plan
- Existing document workflows remain unchanged.
- Existing ppt/pptx files continue read-only behavior by default.
- Editing office-backed content requires explicit one-time conversion; source file remains preserved.
- Wrong editor type openings are blocked with clear CTA, preventing accidental behavior shifts.
- Existing media and video-editor APIs are not replaced; presentation export is additive via adapter.

## 7) Implementation Phases

### Phase 1: Schema and Backend Foundation
- Add new schema objects and migrations.
- Implement service skeleton with validation/versioning.
- Add presentation router registration and base CRUD endpoints.
- Add limit constants and centralized error-code definitions.
- Add order invariant constraints and transactional reorder primitives.
- Add byte-accounting updates and reconciliation checks for deck totals.

Exit criteria:
- create/read/update/delete deck and slide endpoints pass unit tests
- optimistic conflict path returns deterministic `409` payload

### Phase 2: Editor MVP UI
- Add presentation page route and state model.
- Implement slide panel with CRUD and reorder.
- Implement canvas element model (text/image/rect/line) and property editing subset.
- Implement autosave + manual save integration with conflict UI state handling.

Exit criteria:
- single-user authoring loop works end-to-end
- save conflicts are clearly recoverable in UI

### Phase 3: Playback and Export
- Add fullscreen slideshow player and presenter-time indicator.
- Add PNG export endpoint + UI action.
- Add MP4 export trigger using existing worker path and transition constraints.
- Add export trigger dedupe + throttle policy implementation and user-facing retry/throttle messaging.

Exit criteria:
- valid decks export PNG and MP4 with expected defaults
- export errors show actionable status

### Phase 4: PPTX Compatibility and Conversion
- Add read-only open path for existing office items.
- Add one-time conversion flow for edit-on-canvas.
- Add partial-fidelity reporting and source attachment metadata.
- Add conversion idempotency/locking and duplicate-request safety checks.

Exit criteria:
- conversion creates editable deck
- unsupported content is surfaced with partial-fidelity indicators

### Phase 5: Hardening and Rollout
- Add observability hooks and dashboards.
- Run regression suite and focused migration checks.
- Progressive tenant rollout with rollback checklist prepared.

Exit criteria:
- production readiness checklist complete
- no critical regressions in library/media baseline flows

## 8) Validation and Test Strategy

### 8.1 Backend Tests
- Router tests for presentation endpoints, permission denial paths, and limit enforcement.
- Service tests for slide ordering, version conflicts, and conversion metadata.
- Migration tests for schema presence and constraint behavior.
- Export adapter tests for transition whitelist and timing normalization.
- Conflict contract tests asserting `conflict_schema_version` compatibility and stable parser fields.
- Export trigger tests for idempotent retries and throttle denial behavior.

### 8.2 Frontend Tests
- Component tests for slide CRUD, canvas element edits, and save status behavior.
- Conflict UX tests validating reload/overwrite/copy-new options.
- Player tests for keyboard navigation/fullscreen state.
- Accessibility baseline tests for keyboard-only operation, visible focus flow, and labeled controls in editor/player shell.

### 8.3 Integration and Safety Checks
- End-to-end scenario: create deck -> edit -> export -> reopen.
- Compatibility scenario: open existing pptx read-only -> convert -> edit.
- Tenant-isolation scenario: cross-tenant access denied for decks/assets.
- Lifecycle scenario: soft-delete item -> verify deny on edit/export -> restore item -> verify expected access restoration.
- Cleanup scenario: failed conversion or slide asset delete -> verify no orphaned asset links/objects remain.

## 9) Operational Monitoring and Ownership
- Add structured logs for:
  - save conflicts
  - conversion failures and fidelity degradation events
  - export failure classes
- Add counters/alerts for:
  - conflict spike
  - conversion error rate
  - queue latency/failure for presentation exports
  - export trigger throttle rejection rate and duplicate-trigger suppression count
- Define initial SLO thresholds and alert trigger points:
  - save conflict rate alert when conflict responses exceed 5% of save attempts over 15 minutes
  - conversion failure alert when failed conversions exceed 2% daily or 3 consecutive failures for a tenant
  - export queue latency alert when p95 queue wait exceeds 5 minutes for 15 minutes
  - export failure alert when failed jobs exceed 3% in rolling 1 hour
- Assign owner for launch week triage (backend + frontend + worker paths).

## 10) Risks and Mitigations
- Risk: slide order corruption during concurrent edits.
  - Mitigation: DB uniqueness invariant on order slots, transactional reorder algorithm, and concurrency test matrix.
- Risk: type mismatch between document and presentation items.
  - Mitigation: explicit routing guard and CTA fallback behavior.
- Risk: import fidelity surprises.
  - Mitigation: partial-fidelity flags, source preservation, clear UI messaging.
- Risk: duplicate conversion artifacts from retries.
  - Mitigation: idempotency keys, source-level conversion lock, and replay-safe endpoint behavior.
- Risk: worker timeline desync for fades/durations.
  - Mitigation: render-spec normalization tests, strict transition validation, and versioned worker contract checks.

## 11) Post-Change Validation
Release is acceptable only when all are true:
- no tenant isolation regressions in security tests
- presentation CRUD/edit/playback/export happy paths pass
- conflict handling verified under concurrent save tests
- migration/post-migration consistency checks pass
- existing library document/media tests stay green
- rollout monitoring shows no sustained error regressions
- keyboard-only editor/player baseline checks pass for MVP controls
