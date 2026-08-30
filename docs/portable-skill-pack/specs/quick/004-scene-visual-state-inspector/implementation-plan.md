# Implementation Plan

## Objective

Make the shared Scene Visual State visible and editable in the Location panel,
with a collapsed-by-default Inspector, clear Thai explanatory copy, a
structured sleep-surface constraint, and safe stale propagation to every member
shot.

## Current-codebase fit

Extend the current `VerticalDramaSceneLockRow` instead of introducing a second
scene editor. Keep the existing `planSceneVisualState` and
`updateSceneVisualState` procedures, extending their shared types and mutation
behavior. Use the existing `VdSceneVisualState` parser/render path so legacy
plans remain readable.

## Work packages

### 1. Shared contract and prompt grounding

- Add an optional normalized structured sleep-surface field to
  `VdSceneVisualState`, its view/patch types, and the parser. Use the explicit
  shape `{ type: "long_bed" | "single_bed" | "crib_bassinet" | "sofa" |
  "floor_mattress" | "other"; name: string; occupant?: string;
  placement: string }` with bounded text values.
- Add strict server validation for the field and bounded text lengths.
- Render the field as a high-priority line in `SCENE CONTINUITY LOCK`, before
  general fixed-element prose, with explicit wording that the scripted/user
  value wins over a misleading location image.
- Preserve existing state values and render output for legacy states without the
  new field.

### 2. Transactional mutation invalidation

- Extend `sceneVisualStatePatchSchema` and `updateSceneVisualState` to accept
  the structured sleep-surface field.
- In the existing row-locked transaction, update the shared state and all
  `startFramePlan.frames` whose shot numbers belong to the Location.
- Preserve `approvedMediaAssetId`, `videoStartMediaAssetId`, angle-grid state,
  and other image anchors.
- Set `imageStaleReason: "prompt_changed"` and `imageStaleAt` for affected
  frames; clear `sceneContinuity` QC because it was derived from old state.
- Return the updated plan/state and affected shot numbers for UI confirmation.
- Retain expected-revision conflict behavior and tenant/owner checks.

### 3. Collapsible Inspector UI and copy

- Add a collapsed header in the Location scene row with the title
  `Scene Visual State — ข้อมูลกลางของฉากนี้`, purpose copy, affected-shot count,
  status, and visible expand/collapse text control.
- Move the current dialog fields into the expanded inline Inspector or retain a
  dialog only for the focused edit flow; do not duplicate two conflicting
  editors.
- Add editable list controls for fixed elements/furniture, active props, and
  wardrobe. Add the structured sleep-surface editor with a Thai example.
- Show impact copy before save, success with revision and affected shots, and
  conflict/error recovery actions.
- Surface stale affected-shot status without hiding existing images.
- Keep narrow screens stacked and preserve keyboard/focus/Escape behavior.

### 4. Tests and verification

- Update shared state parser/render tests for legacy compatibility and structured
  sleep-surface serialization.
- Add router tests for patch persistence, all-member-frame invalidation,
  retained image anchors, cleared QC, and revision conflicts.
- Add component tests for collapsed default, explanatory copy, expansion,
  editable furniture/props/wardrobe, save impact, and stale/error status.
- Run focused Vitest suites, a relevant TypeScript check if bounded, and inspect
  the final diff. Browser smoke verification remains required if an authenticated
  browser is available; do not claim it if unavailable.

## Risks and mitigations

- **Prompt drift from free-form text:** use the structured sleep-surface line and
  explicit precedence wording.
- **Accidentally losing paid media:** only set stale metadata; never clear image
  anchors or delete assets.
- **Cross-shot partial update:** perform state and frame updates inside the
  existing transaction and test all member shots.
- **Large Location panel:** collapsed default, progressive sections, and clear
  count/status in the header.
- **Concurrent edits:** keep row lock and `expectedRevision`; show a refresh
  path on conflict.
- **Legacy plans:** optional field and tolerant parser; no migration unless
  actual storage requires it.

## Acceptance checks

- User can locate and expand the Inspector in a Location panel.
- Every editable section explains what it controls in Thai and gives an example.
- Editing the shared sleep surface changes the state used by all member shots.
- Existing images remain available and affected frames visibly need regeneration.
- No credits/provider call occur during manual save.
- AI re-plan does not overwrite manual state without explicit force.
- Focused tests pass for shared, router, UI, stale, and prompt paths.

## Rollout

No deployment, production backfill, or automatic regeneration. The existing
Scene Continuity feature flag remains the gate. After local tests, use the
authenticated browser smoke scenario from the design spec if available.
