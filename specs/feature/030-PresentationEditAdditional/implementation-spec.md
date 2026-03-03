# Implementation Spec: 030-PresentationEditAdditional

## 1. Scope and Intent

This implementation covers stabilization work for Presentation Editor/Play/Export focusing on:
- Auto Layout reliability under dense media conditions
- SVG rendering parity and fallback resilience
- Video playback/export regression hardening
- MP4 white pre-roll elimination via readiness contract
- Export warning taxonomy alignment with true renderer capabilities
- Operations runbook and rollout guardrails

Out of scope for this phase:
- timeline/keyframe animation architecture
- public-share play mode redesign
- full export system re-architecture
- video prioritization in overflow policy (deferred to later phase)

## 2. Inputs Used

- `spec.md`
- `research-notes.md` (codebase recon + web research)
- `interview-notes.md` (stakeholder policy decisions)

## 3. Functional Requirements (Finalized)

### 3.1 Auto Layout reliability

- Use degrade-first, drop-last overflow handling.
- Pre-drop candidates first: hidden, zero-opacity, zero-size, off-canvas decorative elements.
- Degradation before any drop: strip heavy effects, flatten groups, rasterize SVG/icons.
- Keep priority (highest to lowest):
  1. text layers
  2. pinned/locked hero media
  3. raster images
  4. SVG/icons (rasterized when needed)
  5. shapes/lines
  6. decorative/background ornaments
- Drop priority is reverse keep order.
- Deterministic result for same seed/input ordering.
- Overlap guard with fallback repack path and explicit warnings.

### 3.2 SVG parity and failure handling

- Support both inline SVG (`svgContent`) and `.svg` source URLs across editor/play/export.
- Normalize renderer assumptions so `currentColor`, transparency, and backgrounds match across paths.
- On load/parse failure, never silently render white block.
- Fallback sequence:
  1. rasterize to PNG at target bounds with 2x scale
  2. if rasterization fails, render fixed-size placeholder tile (no layout shift)
- Export state should be `completed_with_warnings` for fallback/placeholder cases.
- Warning codes:
  - `W_SVG_LOAD_FAILED`
  - `W_SVG_PARSE_FAILED`
  - `W_SVG_RASTERIZED`
  - `W_SVG_PLACEHOLDER`

### 3.3 Video parity and regression protection

- Preserve current validated behavior: video plays in Play Mode and renders as motion in MP4 export.
- Add regression checks for slide lifecycle transitions (enter/leave/next/prev).
- Keep autoplay policy robust via muted-first and explicit blocked-play handling.

### 3.4 Export readiness and pre-roll contract

- `window.__slideReady` may be true only after:
  - layout/text mounted and measured
  - fonts resolved or timeout accepted
  - non-text assets loaded or marked degraded
  - 2 consecutive stable animation frames
- Timing contract per slide:
  - poll interval: 200ms
  - soft wait: 5000ms
  - retries: 2
  - retry delay: 750ms each
  - hard degrade at 8000ms total
- Degrade path allowed if base layout + text exists; unresolved non-critical assets use fallback/placeholder.
- Hard fail only when base layout/text never mounts or slide payload is invalid.
- Hard-fail code: `E_SLIDE_READY_TIMEOUT`.

### 3.5 Export degradation taxonomy alignment

- Update warning/degradation policy so supported video/SVG paths are not reported as unsupported.
- Distinguish unsupported, degraded fallback, and timeout-based degradation.
- Preserve backward-compatible warning payload shape while extending code coverage.

### 3.6 Operations and rollout controls

- Document worker restart/health checks for `presentation_export` queue.
- Progressive rollout sequence:
  - dogfood -> 1% -> 5% -> 25% -> 50% -> 100%
  - stage hold: minimum 24h or 500 exports (whichever is later)
- Stop/rollback thresholds:
  - success rate drop >1.0% vs control
  - `E_SLIDE_READY_TIMEOUT` >0.3% of slides
  - `W_SVG_PLACEHOLDER` >0.5% of slides
  - p95 latency regression >15%
  - crash/OOM increase >0.1% absolute
- Rollback authority:
  - primary: Canvas Edit FE on-call
  - secondary: Export pipeline on-call

## 4. Non-Functional Requirements

- Deterministic auto-layout outputs for reproducibility.
- No silent data loss of layout elements.
- Tenant and internal route security controls unchanged.
- Warning telemetry must be queryable by code and stage.
- Backward compatibility for existing export status consumers.

## 5. Acceptance Mapping

- Wave 1 acceptance: no unintended element loss, overlap controls, deterministic replay.
- Wave 2 acceptance: no SVG white-block artifacts in Play/Export; fallback warnings visible.
- Wave 3 acceptance: keep validated Play Mode video behavior; add automation.
- Wave 4 acceptance: dynamic video render retained; pre-roll <=100ms target with contract and retries.
- Wave 5 acceptance: operational runbook complete with restart/health/triage path.

## 6. Risk Summary

- High risk: readiness/timing regressions affecting export latency and timeout rates.
- Medium risk: warning taxonomy changes breaking UI assumptions.
- Medium risk: auto-layout overflow rules causing visual quality tradeoffs.
- Low risk: schema/data migration impact (logic-centric change set).
