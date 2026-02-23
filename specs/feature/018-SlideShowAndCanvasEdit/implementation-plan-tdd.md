# Implementation Plan TDD Companion: Feature 018 Slideshow and Canvas Edit (MVP)

Testing conventions for this codebase:
- Runtime: TypeScript (apps/web)
- Framework: Vitest (`cd apps/web && npm test`)
- Backend tests: router/service suites under `apps/web/server/**`
- Frontend tests: component behavior with Testing Library under `apps/web/client/src/**/__tests__`

## 1) Delivery Strategy
Test stubs to write first:
- Test: feature flag and route registration leaves existing non-presentation flows unchanged when presentation feature is disabled.
- Test: additive rollout sequencing keeps legacy library/document routes green after each phase gate.

## 2) Architecture and Module Plan

### 2.1 Backend Additions
Test stubs to write first:
- Test: presentation router registers in `routers.ts` without mutating existing router namespaces.
- Test: presentation service enforces tenant resolution and library authorization on every mutating method.
- Test: media export adapter maps presentation payload into existing media job contract and rejects malformed input.

### 2.2 Schema and Persistence
Test stubs to write first:
- Test: migration creates presentation tables/indexes/constraints additively (no destructive changes).
- Test: uniqueness invariant on `(presentation_id, order_index)` prevents duplicate slot writes.
- Test: transactional reorder algorithm succeeds for swap, insert-middle, bulk move, and rejects conflicting reorder races.
- Test: server byte-accounting updates when assets are attached/removed and recalculates warning/hard limit status correctly.

### 2.3 Frontend Additions
Test stubs to write first:
- Test: presentation route opens correct page from Document Management for `itemType=presentation`.
- Test: slide panel CRUD actions invoke typed API bindings and reflect optimistic pending/save states.
- Test: properties/sidebar edits update canvas model shape for text/image/rect/line without mutating unrelated fields.

### 2.4 Import/Compatibility Path
Test stubs to write first:
- Test: office source item opens read-only and does not alter original source data.
- Test: first edit conversion with idempotency key returns same converted deck on retry/double-submit.
- Test: source-level conversion lock prevents concurrent duplicate conversions.
- Test: unsupported constructs produce `partial_fidelity` markers while preserving source linkage metadata.

## 3) API and Behavior Plan

### 3.1 CRUD and Editing Surface
Test stubs to write first:
- Test: create/get/update/delete presentation metadata endpoints enforce hard limits and return stable error codes.
- Test: add/duplicate/delete/reorder slide endpoints preserve ordering and slide count invariants.
- Test: asset attach/list endpoints enforce per-slide and per-deck limits with user-safe error payloads.

### 3.2 Save and Conflict Semantics
Test stubs to write first:
- Test: mutating endpoint with stale `expected_version` returns `409` plus latest payload and reason code.
- Test: `409` payload includes `conflict_schema_version` and remains backward-compatible for client parsing.
- Test: manual save and autosave share the same version-check semantics for conflict paths.

### 3.3 Playback and Export
Test stubs to write first:
- Test: slideshow payload builder returns deterministic slide order and default durations.
- Test: MP4 export rejects unsupported transition types and accepts `cut`/`fade` only.
- Test: render-spec contract includes `schema_version`; worker ingest rejects unknown versions with explicit failure type.
- Test: export enqueue dedupe/idempotency suppresses duplicate retries within dedupe window.
- Test: per-user/per-deck export throttles return stable retry-friendly error responses.

## 4) Impact and Regression Map

### 4.1 Existing Flows Potentially Affected
Test stubs to write first:
- Test: document management open/create flow for existing non-presentation items remains unchanged.
- Test: existing upload handling/library linking behavior remains stable after presentation endpoints are added.

### 4.2 Regression Blast Radius
Test stubs to write first:
- Test: incorrect item type routing is blocked with clear fallback behavior.
- Test: export adapter failures are isolated and do not regress existing media job queue operations.

### 4.3 Regression Prevention Strategy
Test stubs to write first:
- Test: conflict contract tests cover payload shape and machine-readable codes.
- Test: conversion retry/idempotency matrix prevents duplicate deck creation.
- Test: lifecycle transition regression (soft-delete then restore) enforces expected deny/allow behavior for edit/export endpoints.

## 5) Data Safety and Migration Strategy

### 5.1 Risk Classification
Test stubs to write first:
- Test: migration risk classification metadata is emitted in rollout checklist artifacts and blocks unsafe deploy path if missing.

### 5.2 Pre-Migration Backup Plan (Required for low/high)
Test stubs to write first:
- Test: deployment precheck fails when backup markers/baseline counts are absent for low/high risk migrations.

### 5.3 Non-Destructive Migration Sequence
Test stubs to write first:
- Test: expand-only migration applies cleanly and legacy document workflows still pass smoke tests.
- Test: optional backfill job (when enabled) is idempotent and safe to rerun.

### 5.4 Rollback and Restore Runbook
Test stubs to write first:
- Test: rollback feature flag path disables new presentation writes while preserving read safety.
- Test: restore verification checks detect orphaned references and fail fast on inconsistency.

### 5.5 Post-Migration Consistency Checks
Test stubs to write first:
- Test: `slide_count` column equals actual slide rows for each presentation.
- Test: deck byte totals match summed asset usage and warning/hard threshold flags.
- Test: cleanup checks detect orphaned asset-link rows and stale uploaded objects after failed conversion or slide delete paths.

## 6) Backward Compatibility Plan
Test stubs to write first:
- Test: existing ppt/pptx items remain read-only unless explicit conversion is requested.
- Test: source-preservation metadata remains immutable after conversion and edits.
- Test: legacy video/document APIs respond identically for unaffected item types.

## 7) Implementation Phases

### Phase 1: Schema and Backend Foundation
Test stubs to write first:
- Test: baseline CRUD and slide endpoints succeed against migrated schema.
- Test: deterministic `409` conflict payload path for stale versions.

### Phase 2: Editor MVP UI
Test stubs to write first:
- Test: single-user authoring loop (add slide, edit element, save) persists and reloads correctly.
- Test: conflict UI exposes `Reload`, `Overwrite`, and `Copy as new deck` options with correct API wiring.

### Phase 3: Playback and Export
Test stubs to write first:
- Test: player navigation and fullscreen controls operate with keyboard support.
- Test: PNG and MP4 export actions enqueue jobs and surface actionable status/errors.
- Test: export-trigger dedupe and throttle behaviors surface correct user messaging.

### Phase 4: PPTX Compatibility and Conversion
Test stubs to write first:
- Test: read-only office path renders without conversion side effects.
- Test: conversion endpoint produces editable deck once and reuses result on retries.
- Test: partial-fidelity indicators are emitted for unsupported structures.

### Phase 5: Hardening and Rollout
Test stubs to write first:
- Test: observability counters/log events emit for conflicts, conversion failures, export failures, throttles.
- Test: rollout guardrails allow progressive tenant enablement and emergency disable flow.

## 8) Validation and Test Strategy

### 8.1 Backend Tests
Test stubs to write first:
- Test: router authz denial matrix across tenant mismatch, missing feature gate, and lifecycle-restricted resources.
- Test: service-level reorder concurrency matrix and conversion metadata integrity.
- Test: export adapter timing normalization and transition whitelist.

### 8.2 Frontend Tests
Test stubs to write first:
- Test: slide CRUD UI state updates and pending-save indicators.
- Test: canvas element property edits update the correct element only.
- Test: accessibility baseline for keyboard-only operation, visible focus, and labeled controls.

### 8.3 Integration and Safety Checks
Test stubs to write first:
- Test: end-to-end create -> edit -> export -> reopen scenario.
- Test: pptx read-only -> convert -> edit scenario with source linkage retained.
- Test: cross-tenant access denial for presentation and asset operations.
- Test: cleanup scenario for failed conversion/asset removal leaves no orphaned links or stale objects.

## 9) Operational Monitoring and Ownership
Test stubs to write first:
- Test: metric/event emission for conflict spike, conversion failure rate, export latency, export failure rate.
- Test: alert threshold evaluators trigger at configured values and suppress below-threshold noise.
- Test: duplicate-trigger suppression and throttle rejection telemetry emit expected tags.

## 10) Risks and Mitigations
Test stubs to write first:
- Test: concurrent reorder race does not corrupt order_index invariants.
- Test: routing guard prevents wrong-editor open for non-presentation items.
- Test: conversion retries do not create duplicate derived decks.
- Test: worker desync guard rejects malformed render-spec and logs actionable error class.

## 11) Post-Change Validation
Test stubs to write first:
- Test: security suite verifies tenant isolation remains intact for all new routes.
- Test: migration consistency checklist passes before rollout progresses.
- Test: existing document/media regression suite remains green after presentation feature enablement.
- Test: launch-week monitoring signals remain within defined SLO thresholds after canary.
