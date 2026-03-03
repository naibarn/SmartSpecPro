# Implementation Plan: 030-PresentationEditAdditional

## 1. Objectives and Delivery Boundaries

This plan stabilizes Presentation Editor, Play Mode, and MP4 export behavior for dense-media slides with SVG/video content. The primary objective is to remove silent regressions, align renderer capability signaling, and enforce measurable rollout safety.

Delivery boundaries:
- In scope: auto-layout overflow reliability, SVG fallback parity, video path hardening, export readiness timing contract, warning taxonomy alignment, regression automation, and operations runbook updates.
- Out of scope: timeline animation redesign, public share mode rewrite, full exporter re-architecture.

## 2. Current-State Constraints and Design Principles

- Editor preview and dedicated Play Mode are separate render paths; both must be validated to avoid one-path-only fixes.
- Export readiness and pre-roll behavior span Node slide-render and Python worker record/trim logic; changes must be coordinated cross-layer.
- Existing export degradation policy has legacy assumptions that can misreport actual capabilities; warning codes must be reclassified without breaking consumers.
- Determinism is a quality requirement: same seed and same inputs should produce same relayout output.

Design principles:
- Degrade-first, drop-last for layout capacity pressure.
- Explicit warning semantics over implicit behavior.
- Fallback that preserves layout bounds to avoid secondary visual regressions.
- Progressive rollout with hard stop thresholds.

## 3. Implementation Streams

### 3.1 Stream A: Auto Layout Reliability and Determinism

Target files:
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`

Planned changes:
- Introduce explicit preprocessing stage to filter pre-drop candidates (hidden, zero-opacity, zero-size, off-canvas decorative-only).
- Add degrade transformations before drop decisions:
  - remove heavy visual effects
  - flatten eligible groups
  - rasterize SVG/icon decorations when needed for capacity
- Apply fixed keep/drop ranking policy from interview decisions.
- Ensure deterministic ordering before placement (stable sort by priority, pin status, deterministic tie-breakers).
- Enforce overlap guard with threshold checks and deterministic fallback repack when threshold exceeds policy.
- Keep warning outputs for truncation/degradation explicit and machine-readable.
- Preserve required metadata for retained media elements.

Verification intent:
- dense fixture (>=60 and >=80 media cases)
- element-count invariants after relayout
- overlap ratio ceiling assertions
- same-seed replay equality checks

### 3.2 Stream B: SVG Parity and Failure UX

Target files:
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/routes/slideRender.ts`
- export warning surfaces in server/client status mappers

Planned changes:
- Normalize SVG handling for inline and file-based SVG across editor/play/export render paths.
- Introduce unified fallback chain:
  1. rasterize SVG to PNG at 2x target bounds
  2. if rasterization fails, render fixed placeholder tile within original bounds
- Prevent white-block silent artifacts by always surfacing fallback or placeholder state.
- Add warning codes and user-visible messages:
  - `W_SVG_LOAD_FAILED`
  - `W_SVG_PARSE_FAILED`
  - `W_SVG_RASTERIZED`
  - `W_SVG_PLACEHOLDER`
- Ensure fallback outcomes map to "Completed with warnings" instead of "Failed" unless structural render failure occurs.

Verification intent:
- parity fixtures for inline SVG and `.svg` source assets
- snapshot/DOM assertions for placeholder bounds stability (no layout shift)
- export status mapping tests for warning state and code propagation

### 3.3 Stream C: Video Path Regression Hardening

Target files:
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
- `apps/web/server/services/presentationPlaybackExport.ts`
- associated test suites in client/server

Planned changes:
- Preserve current validated behavior while hardening lifecycle transitions.
- Standardize autoplay flow to muted-first with blocked-play fallback handling and event instrumentation.
- Validate slide-enter, slide-leave, next/prev transitions to avoid stale playback-map state.
- Confirm export payload still sets dynamic video behavior when media is present.

Verification intent:
- regression tests on slide transitions and `playing` event window
- payload-level tests for `hasDynamicVideo` and media-source resolution
- maintain compatibility with current Play Mode route behavior

### 3.4 Stream D: Ready-Gate and White Pre-roll Control

Target files:
- `apps/web/server/routes/slideRender.ts`
- `python-backend/app/tasks/presentation_render.py`
- `python-backend/tests/test_presentation_render_task.py`
- `apps/web/server/routes/slideRender.test.ts`

Planned changes:
- Redefine `window.__slideReady` gating to require:
  - layout/text mount+measure complete
  - fonts resolved or timed out
  - non-text assets loaded or marked degraded
  - 2 consecutive stable animation frames
- Implement timing contract:
  - poll every 200ms
  - soft wait to 5000ms
  - 2 retries with 750ms delay
  - hard degrade at 8000ms total per slide
- Degrade path:
  - proceed if base layout/text exists, degrade unresolved non-critical assets with warning codes
- Hard fail path:
  - fail only when base layout/text never mounts or payload invalid
  - emit `E_SLIDE_READY_TIMEOUT`
- Preserve single retry-on-timeout before final degrade to avoid long white clips.

Verification intent:
- unit tests for timeout/retry/degrade branch selection
- chaos-style timeout scenarios (delayed fonts/media, intermittent ready-signal flapping) with convergence checks inside the 8000ms budget
- first-frame non-white threshold checks in export quality tests
- motion detection checks for slides containing video

### 3.5 Stream E: Degradation Policy and Warning Contract Alignment

Target files:
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- shared contracts/status mappers in web/shared + client status views
- related tests in server service suites

Planned changes:
- Replace legacy unsupported-element assumptions for video/SVG with capability-aware warning classification.
- Separate warning categories:
  - unsupported element
  - degraded via fallback
  - timeout/deferred render state
- Ensure warning payloads remain backward-compatible for existing consumers while adding new codes.
- Define warning contract versioning and forward-compatible consumer behavior for unknown/new warning codes.
- Add mixed-version compatibility gate and release-order rule:
  - deploy tolerant readers for new warning codes before enabling strict/new writers
  - require compatibility contract tests to pass in both directions (old reader/new writer and new reader/old writer) before canary promotion
  - block stage promotion when mixed-version matrix coverage is incomplete
- Audit UI status label mapping so warning-only exports remain success-with-warning.
- Verify idempotency and dedupe behavior across export-trigger retries so repeated timeout/retry paths do not create duplicate export artifacts.

Verification intent:
- contract tests for warning payload schema
- version compatibility matrix tests (legacy consumer expectations + new warning-code extensions)
- mixed-version deployment tests across Node route layer and Python worker outputs prior to each canary-stage promotion
- backward-compatibility tests for existing warning consumers
- targeted tests to ensure no false `SLIDE_ELEMENT_UNSUPPORTED` for supported video/SVG paths
- retry idempotency tests for export trigger and worker duplicate suppression behavior

### 3.6 Stream F: Operations Runbook and Rollout Automation

Target files:
- spec/runbook docs under `specs/feature/030-PresentationEditAdditional/`
- operational docs for media/export workers
- monitoring/alert config references where maintained in repo

Planned changes:
- Document restart, status, and logs workflow for `celery-presentation` worker.
- Define rollout stages: dogfood -> 1% -> 5% -> 25% -> 50% -> 100%.
- Enforce stage-hold rule: minimum 24h or 500 exports, whichever is later.
- Require canary cohort composition gate before each promotion:
  - include media-heavy decks (video or SVG) in at least 30% of sampled exports
  - include dense-layout decks (>=20 visible elements per slide) in at least 20% of sampled exports
  - include baseline low-complexity decks to keep control comparison stable
- Add mandatory rollback rehearsal at <=5% stage before promotion to 25%.
- Encode stop conditions and rollback ownership:
  - success rate drop >1.0% vs control
  - `E_SLIDE_READY_TIMEOUT` >0.3% slides
  - `W_SVG_PLACEHOLDER` >0.5% slides
  - p95 export latency regression >15%
  - crash/OOM +0.1% absolute
- Assign operational authority: Canvas Edit FE on-call primary, Export pipeline on-call secondary, PM request allowed, engineering on-call executes rollback.

Verification intent:
- checklist-based dry run in staging
- alert threshold validation before production progression

## 4. Impact Map (Regression Surface)

Likely regression surfaces and safeguards:

1. Editor relayout UX
- Risk: stricter overflow policy may change visual composition unexpectedly.
- Safeguard: deterministic tests, fixture-based visual checks, warning surfacing.

2. Play Mode media behavior
- Risk: autoplay and lifecycle changes can pause wrong video or fail play after transitions.
- Safeguard: transition lifecycle tests and event-based assertions.

3. Export status semantics
- Risk: warning-code refactor can break client status labels.
- Safeguard: schema compatibility tests + UI mapping tests.

4. Export throughput/latency
- Risk: tighter readiness checks could increase render time.
- Safeguard: bounded retries/timeouts and rollout p95 stop condition.

5. Internal render security path
- Risk: readiness logic adjustments could accidentally bypass expected internal constraints.
- Safeguard: keep existing internal token/IP checks unchanged and re-run route security tests.

## 5. Regression Prevention Strategy

### 5.1 Test layers

- Service-unit tests:
  - relayout policy, warning taxonomy, payload capability flags
- Route-unit/integration tests:
  - slide-render readiness, timeout/retry behavior, security gates
- Worker-unit tests:
  - record-mode trimming/degrade/fail branches
- UI-level tests:
  - play mode lifecycle + fallback status mapping
- Fixture-based quality tests:
  - dense media deck, SVG variants, video motion deck

### 5.2 Release safety

- Progressive canary rollout by percentage stages.
- Hold-stage evaluation using defined thresholds.
- Immediate rollback trigger when any threshold is breached.

### 5.3 Monitoring and ownership

Required dashboards/alerts:
- export success rate
- `E_SLIDE_READY_TIMEOUT` rate
- `W_SVG_PLACEHOLDER` rate
- p95 export latency
- browser crash/OOM rate
- warning-only export rate
- telemetry dimensions: `warning_code`, `slide_index`, `retry_count`, `ready_wait_ms`, `degrade_reason`
- alert evaluation windows:
  - fast window: 5-minute breach detection for rollback triggers
  - stability window: 30-minute confirmation to prevent noisy single-spike rollback
- rollback timing SLA:
  - engineering on-call acknowledges a confirmed trigger within 10 minutes
  - rollback execution begins within 15 minutes of confirmation

Ownership:
- primary on-call: Canvas Edit FE
- secondary on-call: Export pipeline
- escalation to PM for prioritization; rollback execution by engineering on-call.

## 6. Data Safety and Migration Strategy

Risk classification: `none` (DB schema and persistent data model changes are not required for this scope).

Why backup/restore is not required for this scope:
- planned changes are renderer logic, warning classification, readiness timing, and tests/docs.
- no table shape changes, data backfills, or destructive writes are planned.

Non-destructive migration-first policy (future-proof note):
- if downstream implementation introduces persisted warning fields or schema touches, apply `expand -> migrate/backfill -> contract` with explicit migration checks before contract phase.

Rollback runbook for this scope:
- feature-flag or deployment rollback to prior version when stop conditions trigger.
- verify restoration by checking success-rate recovery, timeout/warning rates, and sample export playback.

## 7. Compatibility Commitments

- Existing presentation editing and playback behavior continues unless explicitly changed by this plan.
- Warning payload contract remains backward-compatible (extensions additive where possible) and explicitly versioned for compatibility testing.
- Internal slide-render auth constraints remain unchanged.
- Existing export queue orchestration remains unchanged except readiness/degradation behavior under defined conditions.

## 8. Security and Tenant-Isolation Hardening

- Add negative-path integration tests for internal render/export:
  - claim mismatch for `deckId` / `slideIndex`
  - tenant-cross access attempts
- Treat any tenant-isolation regression as release-blocking regardless of canary metric health.

## 9. Delivery Sequence

1. Lock fixtures and baseline metrics (Wave 0 guardrails).
2. Implement Stream A (auto-layout reliability) with tests.
3. Implement Stream B (SVG parity/fallback) with tests.
4. Harden Stream C (video regressions) with tests.
5. Implement Stream D (ready-gate/pre-roll contract) with tests.
6. Align Stream E (degradation contract) with compatibility tests.
7. Finalize Stream F (runbook + staged rollout setup).
8. Execute staged rollout with threshold gates and rollback authority.

## 10. Acceptance and Exit Criteria

Exit requires all of the following:
- Auto-layout no-silent-drop criteria pass on dense-media fixtures.
- SVG inline/file parity with no white-block artifacts in play/export.
- Video still plays in Play Mode and appears as motion in MP4 export.
- White pre-roll target met (`<=100ms`) on validation set.
- Warning taxonomy emits expected codes and status mappings.
- Deterministic replay check passes: identical input deck + seed produces identical element ordering and warning-code sequence across repeated runs.
- Runbook is executable and ownership/escalation paths are explicit.
- Rollout metrics remain within thresholds through 100% stage progression.
