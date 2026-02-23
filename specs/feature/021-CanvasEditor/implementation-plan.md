# Implementation Plan: Feature 021 Canvas Editor

## 1. Plan Objective
Implement a production-safe Canva-like canvas editor for presentations using a feature-flagged hard switch to `presentation_canvas_v2`, while preserving existing tenant safety, deck lifecycle, and PNG/MP4 export continuity.

## 2. Delivery Boundaries

### Included
- Canvas runtime and layout redesign for presentation editing.
- MVP object support: text, image, shape, line.
- Desktop transform tools (move/resize/rotate/snap/arrange).
- Mobile-safe core editing (select/move/basic text/zoom/pan).
- Debounced autosave with existing conflict semantics.
- Deterministic export degradation + per-slide warnings.
- Internal template catalog integration only.

### Excluded
- Persisted grouping, video editing objects, native icon object type.
- Realtime collaboration/comments implementation.
- Tenant brand kit management and PDF export.
- External template marketplace integration.

## 3. Impact Map (Regression Surface)

### High-Risk Existing Areas
- `apps/web/client/src/pages/PresentationEditor.tsx`
  - current editing experience and save UX will be heavily reworked.
- `apps/web/shared/presentation/contracts.ts`
  - object schema changes impact server validation and export pipeline compatibility.
- `apps/web/server/services/presentationPlaybackExport.ts`
  - render payload must remain stable and deterministic under v2 object inputs.
- `apps/web/client/src/pages/DocumentManagement.tsx`
  - create/open/new-presentation route handoff must remain consistent.

### Medium-Risk Existing Areas
- `apps/web/server/routers/presentation.ts`
  - additive routes for template/degradation checks may affect validation and error mapping.
- `apps/web/server/services/presentationService.ts`
  - payload validation paths and conflict state logic may need v2-aware updates.

### Low-Risk Existing Areas
- durable conversion and tenant hardening tables (`0032`, `0033`) because no destructive DDL is planned.

## 4. Workstream Plan

### Workstream A: Canvas Runtime Foundation
- Introduce a canvas module boundary under `client/src/presentation-canvas`.
- Integrate `react-konva` runtime and isolate stage/layer rendering from route shell logic.
- Define state ownership so serialized slide content remains the single source of truth.

### Workstream B: v2 Schema and Contracts
- Define `presentation_canvas_v2` object contract for MVP types.
- Update shared validation and editor state helpers to v2-only behavior.
- Ensure current API payload shape remains bounded and validated server-side.
- Add client/server contract-test fixtures for MVP object payloads and warning-code outputs.

### Workstream C: Desktop Editing UX
- Implement select/move/resize/rotate/snap/arrange interactions.
- Build right-panel property editing for MVP object types.
- Add command-based undo/redo model with deterministic state transitions.
- Include keyboard selection/movement behavior and visible focus states in interaction acceptance.

### Workstream D: Mobile Safe-Core UX
- Implement viewport controls (pinch/pan) and explicit pan/edit mode switching.
- Limit mobile transform operations to safe-core scope per decision.
- Tune touch targets and prevent accidental transform while scrolling.

### Workstream E: Save/Conflict/Recovery
- Add debounced autosave controller with existing optimistic conflict behavior.
- Preserve manual save and existing conflict messaging semantics.
- Keep deck auto-initialization and back-navigation pathways unchanged.
- Add conflict-burst protection (cooldown + stale-version guard) to avoid autosave retry loops.

### Workstream F: Export Compatibility
- Define renderability rules for unsupported v2 constructs.
- Apply deterministic degradation policy and propagate slide-level warnings.
- Keep PNG/MP4 trigger/status interfaces stable.
- Enforce deterministic degradation precedence and stable warning codes.
- Maintain fixture-backed degradation snapshots so warning code and precedence regressions are caught in CI.

### Workstream G: Rollout, Security, and Ops Hardening
- Wire `PRESENTATION_CANVAS_V2_ENABLED` gating for staged rollout.
- Keep tenant permission checks and actor attribution unchanged on server paths.
- Extend observability for transform/autosave/degradation/conflict metrics.
- Add explicit rollout cutover checklist with owner, abort thresholds, and rollback commands.
- Require a pre-launch rollback drill with named roles (detect, decide, execute, verify) before tenant canary ramp.
- Gate ramp progression on dashboard readiness and alert routing verification for critical metrics.

## 5. Data Safety Strategy

### Risk Classification
- DB migration risk: `low`
- Behavioral data risk: `high` (editor payload semantics and save/export behavior)

### Pre-Migration Backup Plan
- Take pre-rollout database backup/snapshot of:
  - `presentation_decks`
  - `presentation_slides`
  - `presentation_asset_links`
- Capture artifact retention policy and restore owner before tenant canary starts.

### Non-Destructive Migration-First Approach
Even with hard switch v2, apply expand/migrate/contract discipline:
1. Expand
- Add v2 validators and feature-flagged runtime without removing stable editor path.
2. Migrate/backfill
- For any deck touched during rollout, write v2 payloads only.
- If legacy payloads are encountered unexpectedly, treat as blocked/open-in-read-only until explicit migration tooling is introduced.
- Legacy handling contract:
  - block editing for unsupported payload schema
  - show deterministic operator-facing recovery guidance
  - emit structured telemetry for follow-up migration action
3. Contract
- After rollout stabilization, remove fallback code paths and dead feature-flag branches.

### Automated Consistency Checks
- Run post-deploy checks for:
  - slide count/order invariants
  - deck byte totals and orphan asset links
  - template-apply idempotency and duplicate asset-link detection
  - export warning/error rate drift
  - conflict rate anomalies

### Restore/Rollback Runbook
- Trigger conditions:
  - export failure spike
  - conflict/error rate above threshold
  - tenant-level critical regression reports
- Actions:
  - disable `PRESENTATION_CANVAS_V2_ENABLED`
  - return traffic to stable editor path
  - verify deck read/write and export health
  - if data corruption detected, restore impacted tenant/deck snapshots and revalidate counts/order/bytes
- Verification:
  - smoke tests for create/edit/save/export
  - regression suite and readiness checks green before re-enabling

## 6. Compatibility Notes
- Route, API namespace, and core deck/slide lifecycle endpoints remain stable.
- Export APIs remain PNG/MP4 and keep existing invocation contracts.
- Document Management new-presentation flow remains the entry point.
- Hard switch is constrained by feature flag so existing functionality can continue unless rollout toggles enable v2.

## 7. Regression Prevention Strategy

### Test Strategy
- Extend unit tests for:
  - v2 object reducers/validation
  - snap/transform calculations
  - autosave debounce behavior
  - degradation decision logic
- Extend integration tests for:
  - create -> edit -> autosave -> reload consistency
  - conflict path under autosave
  - export warning surfacing with degraded objects
- Add contract tests for client/server v2 payload compatibility and warning-code stability.
- Extend e2e tests for:
  - desktop MVP workflow
  - mobile safe-core workflow
  - tenant boundary and permission regressions
- Add accessibility e2e coverage for keyboard editing flows, focus visibility, and warning-text semantics.
- Add deterministic degradation snapshot tests for warning codes and fallback precedence.
- Add performance gate tests for:
  - <=100 objects target path
  - 200-object stress path with fallback trigger expectations.
- Add template-apply repeatability tests to prevent duplicate object/asset link inflation.

### Canary and Rollout
- Rollout sequence: internal -> selected tenants -> percentage ramp.
- Require release gate checks (regression, consistency, monitoring, rollback readiness).
- Pause rollout automatically on alert threshold breaches.
- Enforce measurable SLO rollout gates:
  - interactive drag/transform p95 <= 120ms on target hardware
  - editing viewport >= 45 FPS in normal path, >= 30 FPS at 200-object stress path
  - autosave mutation p95 <= 1500ms under canary load

### Monitoring and Ownership
- Define launch ownership for conflict/conversion/export incident classes.
- Add alert thresholds for:
  - conflict rate
  - export failure rate
  - queue latency
  - throttle rejection anomalies
  - degradation spike
- Add mobile-mode telemetry:
  - pan/edit mode switch rate
  - accidental-transform cancel events
  - gesture error events.
- Require pre-ramp dashboard checklist covering all rollout gates and alert route tests to on-call recipients.

## 8. Sequencing and Dependencies
1. Foundation and schema contract definition (A, B)
2. Desktop interaction engine and shell integration (C)
3. Mobile safe-core and mode controls (D)
4. Autosave/conflict integration (E)
5. Export degradation contract integration (F)
6. Rollout guardrails, monitoring, and hardening (G)
7. Final release checklist verification and cutover rehearsal

Dependencies:
- B blocks C/E/F
- C and D can partially parallelize after B
- F depends on B and existing export contract validation
- G runs continuously but gates final rollout

## 9. Definition of Done
- Required MVP object editing works on desktop.
- Mobile safe-core path is stable and non-blocking.
- Autosave + conflict behavior is reliable and observable.
- Export compatibility policy works with deterministic warnings.
- Tenant and permission regressions are prevented.
- Feature-flagged rollout and rollback readiness are validated.
- Accessibility verification passes for keyboard focus/edit flows and warning-text semantics.
- Contract and performance rollout gates are green with documented dashboard evidence.

## 10. Applied Uplifts (U1-U8)

### U1: Unsupported-Legacy Deck Handling
- Runtime must reject non-v2 editable sessions with deterministic guidance and structured error logs.
- No silent conversion/write-through of unknown legacy payloads in this release.

### U2: Deterministic Degradation Contract
- Maintain a degradation precedence table for non-renderable constructs.
- Warning output must include stable warning codes and slide references.

### U3: Autosave Conflict Burst Protection
- Introduce cooldown behavior after repeated conflicts.
- Suppress autosave retries when local version is known stale until refresh/user action.

### U4: Mobile Mode Safety Telemetry
- Record mode-switch and accidental-edit indicators to validate safe-core assumptions.

### U5: Render Performance Budget Gates
- Enforce performance acceptance gates before broader rollout.
- Define fallback trigger behavior when stress thresholds are exceeded.

### U6: Template Asset Trust Boundary
- Internal template assets must pass upload-equivalent validation policy.
- Require tenant scope and sanitized SVG/image safety paths before template usage.

### U7: Feature-Flag Cutover Checklist
- Require per-stage verify/abort criteria and rollback commands with named owners.

### U8: Export Warning UX Contract
- Warning UX must define placement, persistence, and dismissibility rules.
- Per-slide warning summary must be accessible during/after export status flow.
