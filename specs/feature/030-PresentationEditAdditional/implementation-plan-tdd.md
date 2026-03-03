# Implementation Plan (TDD): 030-PresentationEditAdditional

## 1. Objectives and Delivery Boundaries

### Test stubs to write first
- Stub: scope guard test that fails if implementation introduces out-of-scope timeline/public-share rewrites in this feature branch.
- Stub: contract test list asserting this feature only changes relayout, SVG/video fallback, readiness timing, warning taxonomy, and runbook surfaces.

## 2. Current-State Constraints and Design Principles

### Test stubs to write first
- Stub: deterministic replay test harness for relayout (`same input + same seed => same ordering/warnings`).
- Stub: dual-path parity harness validating Editor preview and Play Mode routes against shared expected media behavior.
- Stub: degradation semantics harness ensuring warnings are explicit and machine-readable.

## 3. Implementation Streams

### 3.1 Stream A: Auto Layout Reliability and Determinism

### Test stubs to write first
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`
  - Stub: filters hidden/zero-size/off-canvas decorative candidates before drop phase.
  - Stub: applies degrade transformations before drop decisions.
  - Stub: preserves deterministic keep/drop ranking and tie-break ordering.
  - Stub: overlap-guard ceiling enforcement with deterministic fallback repack.
  - Stub: warning payload emission for truncate/degrade states.
  - Stub: dense fixture replay test for >=60 and >=80 media elements with invariant checks.
- `apps/web/client/src/pages/PresentationEditor.test.tsx` (or nearest existing editor test suite)
  - Stub: relayout result applies without silent disappearance of eligible retained media.

### 3.2 Stream B: SVG Parity and Failure UX

### Test stubs to write first
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
  - Stub: inline SVG renders with expected bounds and no blank fallback.
  - Stub: `.svg` source path renders with same bounds semantics as inline SVG.
  - Stub: rasterize fallback produces bounded PNG fallback with no layout shift.
  - Stub: placeholder fallback preserves original frame bounds on rasterization failure.
- `apps/web/server/routes/slideRender.test.ts`
  - Stub: export HTML path maps SVG failures to warning codes (`W_SVG_LOAD_FAILED`, `W_SVG_PARSE_FAILED`, `W_SVG_RASTERIZED`, `W_SVG_PLACEHOLDER`).
  - Stub: warning-only fallback remains success-with-warning (not failed) for non-structural failures.

### 3.3 Stream C: Video Path Regression Hardening

### Test stubs to write first
- `apps/web/client/src/pages/PresentationPlayMode.test.tsx`
  - Stub: muted-first autoplay attempt on slide enter with blocked-play fallback path.
  - Stub: playback map cleanup on slide-leave/next/prev transitions.
  - Stub: `playing` event observation window validates resumed playback after transition.
- `apps/web/server/services/presentationPlaybackExport.test.ts`
  - Stub: payload sets `hasDynamicVideo=true` when media/video elements exist.
  - Stub: media-source resolution remains stable for export payload generation.

### 3.4 Stream D: Ready-Gate and White Pre-roll Control

### Test stubs to write first
- `apps/web/server/routes/slideRender.test.ts`
  - Stub: `window.__slideReady` requires mount+measure, font resolution/timeout, asset load/degrade state, and two stable frames.
  - Stub: polling and retry contract (`200ms`, soft `5000ms`, `2` retries with `750ms`).
  - Stub: hard degrade branch at `8000ms` when non-critical assets unresolved.
  - Stub: `E_SLIDE_READY_TIMEOUT` emitted only for base layout/text mount failure or invalid payload.
- `python-backend/tests/test_presentation_render_task.py`
  - Stub: worker respects ready-gate timeout/degrade/fail branch outcomes from route layer.
  - Stub: first-frame non-white threshold check on rendered output metadata fixture.
  - Stub: video slide captures motion frames in dynamic record path.

### 3.5 Stream E: Degradation Policy and Warning Contract Alignment

### Test stubs to write first
- `apps/web/server/services/presentationExportDegradation.test.ts` (or nearest suite)
  - Stub: supported video/SVG paths do not emit false `SLIDE_ELEMENT_UNSUPPORTED`.
  - Stub: category separation for unsupported vs fallback-degraded vs timeout/deferred.
  - Stub: unknown/new warning codes are tolerated by consumers via forward-compatible behavior.
- `apps/web/server/services/presentationPlaybackExport.test.ts`
  - Stub: warning contract versioning compatibility matrix (old reader/new writer and new reader/old writer).
  - Stub: mixed-version deployment compatibility gate fails promotion when matrix incomplete.
  - Stub: retry idempotency/dedupe prevents duplicate export artifacts.

### 3.6 Stream F: Operations Runbook and Rollout Automation

### Test stubs to write first
- `specs/feature/030-PresentationEditAdditional` docs validation checklist
  - Stub: runbook contains restart/status/log commands for `celery-presentation`.
  - Stub: rollout stages and hold rule (`24h` or `500` exports) are explicitly documented.
  - Stub: canary cohort composition gates documented (media-heavy, dense-layout, low-complexity baseline).
  - Stub: rollback triggers, ownership, and SLA timings are present and unambiguous.

## 4. Impact Map (Regression Surface)

### Test stubs to write first
- Stub: editor relayout UX regression matrix covering visual composition stability.
- Stub: play mode media lifecycle regression matrix across navigation transitions.
- Stub: export status mapping regression matrix for warning-only success semantics.
- Stub: throughput/latency guard assertions for readiness contract overhead.
- Stub: internal render security regression suite remains green after readiness changes.

## 5. Regression Prevention Strategy

### 5.1 Test layers

### Test stubs to write first
- Service unit gate: run `pnpm --dir apps/web test -- server/services/__tests__/aiPresentationService.test.ts` for relayout stream.
- Route integration gate: run `pnpm --dir apps/web test -- server/routes/slideRender.test.ts` for readiness/security stream.
- Worker gate: run `uv run pytest python-backend/tests/test_presentation_render_task.py` for Python render behaviors.
- UI gate: run targeted Play Mode and canvas test files for lifecycle/fallback parity.
- Fixture quality gate: run media-heavy fixture batch and assert no silent drops + non-white first frame.

### 5.2 Release safety

### Test stubs to write first
- Stub: staged rollout policy evaluator with threshold-breach rollback trigger assertions.
- Stub: canary promotion blocked if required cohort composition is not met.

### 5.3 Monitoring and ownership

### Test stubs to write first
- Stub: alert-window configuration coverage for fast (5m) and stability (30m) checks.
- Stub: rollback SLA checks for acknowledgement/execution timing metadata in runbook.

## 6. Data Safety and Migration Strategy

### Test stubs to write first
- Stub: assertion that no schema migration files are introduced for this scope.
- Stub: guard that warning contract changes remain additive and do not require destructive backfill.
- Stub: rollback validation checklist verifies metric recovery after deploy rollback.

## 7. Compatibility Commitments

### Test stubs to write first
- Stub: backward-compatibility contract test for existing warning consumers.
- Stub: mixed-version compatibility matrix gate across Node route layer and Python worker payload handling.
- Stub: internal auth/token/IP gate tests unchanged and passing post-change.

## 8. Security and Tenant-Isolation Hardening

### Test stubs to write first
- `apps/web/server/routes/slideRender.test.ts`
  - Stub: tenant-cross access attempt is denied.
  - Stub: JWT claim mismatch (`deckId`/`slideIndex`) is denied.
  - Stub: release-blocking marker is raised on any tenant-isolation regression.

## 9. Delivery Sequence

### Test stubs to write first
- Stub: sequence gate tests enforce test-first order (fixture baseline -> Stream A -> B -> C -> D -> E -> F).
- Stub: dependency gate prevents downstream stream implementation until predecessor verification stubs pass.

## 10. Acceptance and Exit Criteria

### Test stubs to write first
- Stub: dense-media no-silent-drop acceptance suite passes.
- Stub: SVG parity acceptance suite passes with no white-block artifacts.
- Stub: Play Mode + MP4 video motion acceptance suite passes.
- Stub: white pre-roll threshold (`<=100ms`) acceptance suite passes.
- Stub: warning taxonomy and status mapping acceptance suite passes.
- Stub: deterministic replay acceptance suite passes for ordering and warning-sequence stability.
- Stub: staged rollout metrics threshold suite remains healthy through simulated stage progression.
