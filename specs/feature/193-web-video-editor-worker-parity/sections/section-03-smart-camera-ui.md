# Section 03 — Smart Camera UI and orchestration

## Objective

Make the Web Smart Camera panel browser-first while keeping Full Scan optional
and preserving legacy project values.

## Implementation status

Implemented in `SmartCameraPanel.tsx`, `videoEditor.ts`, and
`VideoEditorPhase3.tsx`. Face Focus, Face + Activity, Quick browser analysis,
Full Scan handoff, status copy, and legacy labels coexist without gating the
editor on `workerHandoff`.

## Implementation scope

- Extend `apps/web/client/src/types/videoEditor.ts` with explicit modes,
  analysis status/provenance, fingerprints, plan reference/hash, warnings, and
  last job ID while retaining legacy serialization.
- Update `SmartCameraPanel.tsx` with `face_focus` and `face_activity` labels,
  five-point readiness, activity-partial/degraded state, local Quick action,
  optional Full Scan action, and manual marks.
- Add a small accessible capability/status component owned by the editor, not a
  second panel-specific status implementation.
- Update `VideoEditorPhase3.tsx` to normalize legacy modes, start local Quick
  analysis without `workerHandoff`, submit Full Scan with a stable fingerprint
  tuple, and promote only matching Worker results.

## UI/UX contract

Target users edit vertical videos without guaranteed Worker access. Empty,
ready, degraded, running, stale, unsupported, and review states must retain a
usable primary action. Controls need labels, keyboard focus, selected state,
non-color-only status, Thai copy with English fallback, and no overflow on
narrow screens. Reduced motion must disable camera-status animation.

## TDD targets

- Legacy mode migration and authored-mark preservation.
- No-Worker mode selection and local Quick action.
- Status badge/state matrix and accessible labels.
- Idempotent Full Scan request and stale promotion refusal.

## UI/UX Contract

### Target User / JTBD

Creator selects Face Focus or Face + Activity, understands analysis provenance,
and can continue editing without a Worker.

### Surface Inventory

Smart Camera sidebar, player status badge, Full Scan action, and manual keyframe
control.

### Component Map

`SmartCameraPanel` renders controls; shared status component renders state;
`VideoEditorPhase3` owns orchestration and persistence.

### State Matrix

No clip shows selection prompt; ready enables Quick; degraded keeps controls;
Worker-running shows progress; stale offers re-analysis; review preserves manual
mode; unsupported offers Worker/manual fallback.

### Responsive Matrix

Mode controls wrap on narrow screens; status and primary analysis action remain
visible on tablet/laptop/desktop.

### Accessibility Acceptance

Modes expose selected state with `aria-pressed`, labels are programmatically
associated, keyboard focus is visible, and status is not color-only.

### Copy Contract

Thai labels: “ติดตามใบหน้า 5 จุด”, “ใบหน้า + Activity”, “วิเคราะห์ในเครื่อง”,
“วิเคราะห์เต็มรูปแบบใน Worker”; English fallback keys use the same distinctions.

### Browser Evidence Required

Component tests cover no-Worker mode selection, legacy aliases, status badges,
and keyboard activation; browser evidence covers narrow layout and focus.
