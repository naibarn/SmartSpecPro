# Implementation Hardening Plan

Date: 2026-02-22
Source: `implementation-security-review.md`
Mode: `plan_now`

## Objective
Close high-severity security/availability gaps before broader rollout, then schedule medium/low hardening with bounded scope.

## Priority Order
1. High: bound export registry memory growth.
2. High: enforce strict `slideContent` input schema and payload limits.
3. Medium/low: durable conversion idempotency/locking, tenant-link DB enforcement, throttle key cleanup.

## Stream A - Export Registry Memory Hardening (High)

### Status
- implemented_on: `2026-02-22`
- outcome: `done (bounded in-memory fallback with TTL + max-entry eviction + targeted tests green)`

### Target
- `apps/web/server/services/presentationPlaybackExport.ts`

### Plan
1. Replace in-process export state maps (`dedupeRegistry`, `statusRegistry`, `resultRegistry`) with bounded external state (Redis preferred).
2. Add TTL policy for dedupe and status entries.
3. Add hard cap protection for fallback in-memory mode (for local/dev usage).
4. Keep current API contract unchanged (`triggerExport`, `getExportStatus`).

### TDD Stubs
- Test: stale dedupe/status entries are evicted after TTL.
- Test: high-volume enqueue does not grow in-memory state unbounded in fallback mode.
- Test: dedupe behavior remains deterministic across repeated identical requests.
- Test: cross-process status read works when state is externalized.

### Acceptance Criteria
- No unbounded map growth on production path.
- Existing export contract tests remain green.
- `PRESENTATION_EXPORT_THROTTLED` behavior and retry metadata unchanged.

## Stream B - Slide Content Validation Hardening (High)

### Status
- implemented_on: `2026-02-22`
- outcome: `done (strict shared schema + service byte-limit enforcement + targeted regression suites green)`

### Target
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/presentationService.ts`

### Plan
1. Define typed Zod schemas for slide elements and slide content shape.
2. Replace `z.record(z.any())` inputs in `addSlide` / `updateSlide` with strict schema validation.
3. Enforce payload-size and element-count limits server-side.
4. Add clear machine-readable validation failure codes/messages for limit overages.

### TDD Stubs
- Test: valid element payloads pass unchanged.
- Test: unexpected keys / wrong types are rejected with `PRESENTATION_VALIDATION_FAILED`.
- Test: oversized payloads are rejected with deterministic message/code.
- Test: deeply nested payloads beyond configured depth are rejected.

### Acceptance Criteria
- Untrusted payloads cannot persist arbitrary JSON shapes.
- DB write amplification risk from oversized slide payloads is bounded.
- Existing editor happy-path tests continue to pass after schema tightening.

## Stream C - Medium/Low Follow-Up

### C1: Durable Conversion Idempotency (Medium)
- implemented_on: `2026-02-22`
- outcome: `done (conversion idempotency + source-lock state moved to DB-backed durable tables with TTL, with shared-state duplicate suppression tests green)`
- Move conversion lock/idempotency state from process memory to durable shared state with TTL.
- Add tests for multi-instance duplicate conversion suppression.

### C2: Tenant Link Integrity at DB Layer (Medium)
- implemented_on: `2026-02-22`
- outcome: `done (composite tenant/deck/library-item and slide/deck integrity constraints added via migration + schema alignment + regression test coverage)`
- Add schema-level tenant alignment constraints/triggers for `presentation_asset_links`.
- Add migration + integrity regression tests.

### C3: Throttle Registry Key Compaction (Low)
- implemented_on: `2026-02-22`
- outcome: `done (implemented during Stream A via empty-key pruning + bounded compaction tests)`
- Remove empty throttle-window keys after pruning.
- Add bounded-size and periodic compaction tests.

## Execution Sequence
1. Implement Stream A + tests.
2. Implement Stream B + tests.
3. Re-run focused presentation suites.
4. Re-run broader regression subset.
5. Execute Stream C in separate hardening batch if timeboxed release pressure exists. ✅

## Validation Command Set
- `cd apps/web && npm test -- server/services/presentationPlaybackExport.test.ts`
- `cd apps/web && npm test -- server/routers/presentation.test.ts server/services/presentationService.test.ts`
- `cd apps/web && npm test -- server/services/presentationWorkflowRegression.test.ts`
- `cd apps/web && npm test -- server/services/presentationCompatibilityService.test.ts`
- `cd apps/web && npm test -- server/services/presentationWorkflowRegression.test.ts server/services/presentationObservability.test.ts server/services/presentationPersistence.test.ts server/services/presentationPlaybackExport.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts`

## Rollback Notes
- Keep feature flags (`PRESENTATION_EDITOR_ENABLED`, `PRESENTATION_EXPORTS_ENABLED`) as immediate safety controls.
- If external state integration regresses, fallback to disabled export writes while preserving read/editor operations.
