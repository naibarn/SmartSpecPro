# Feature 012: Text Clip on T1 Timeline (Only)

> Status: Draft  
> Created: 2026-02-15  
> Spec Path: `specs/feature/012-AddTextClip/spec.md`  
> Scope Lock: Text Clip on `T1` only

---

## 1) Scope

This spec defines **only** the Text Clip feature set on track `T1` in Video Editor.

Included:
1. Add/Edit/Delete text clips on `T1`
2. Text styling controls (font, size, color, preset, alignment, effects)
3. Text transform controls (position, scale, rotation, flip)
4. Text keyframe workflow (add/select/update/delete + interpolation)
5. Timeline behavior for text clips
6. Preview and render parity for text clips
7. Persistence, validation, test coverage for text clips

Excluded:
1. Razor tool
2. Ripple edit
3. Global preview lock/frame semantics
4. Aspect ratio workflow
5. Service restart/HTTP 429 reliability
6. Any non-text clip feature

---

## 2) Product Goals

1. User can add text to timeline quickly via `T1`.
2. User can style text to a production-usable level without external tools.
3. User can animate text with keyframes in a predictable workflow.
4. What user sees in preview for text must match final render output.

---

## 3) User Stories

1. As an editor, I can add a new text clip to `T1` and set its duration.
2. As an editor, I can style the text (font/size/color/effect) and see live preview.
3. As an editor, I can move/scale/rotate text in frame.
4. As an editor, I can set two keyframes with different transforms and get smooth interpolation.
5. As an editor, I can click a keyframe marker, adjust text transform, and update immediately.
6. As an editor, I can delete a keyframe and have interpolation recalculate automatically.

---

## 4) Functional Requirements

## 4.1 Add Text Clip to T1

1. A dedicated action `Add Text` creates a text clip on track `T1`.
2. If `T1` does not exist in a legacy project, create `T1` automatically.
3. New text clip defaults:
   - text: `Your Text Here`
   - duration: `5.0s`
   - centered transform
   - visible in timeline as text-type clip
4. Placement behavior:
   - default: append after last clip in `T1`
   - optional UX improvement: allow insert at current playhead

## 4.2 Text Content and Style Controls

1. Content:
   - multi-line text input
   - immediate live preview
2. Typography:
   - font family
   - font size
   - font weight
   - font style (normal/italic)
   - underline toggle
3. Layout:
   - text alignment (left/center/right)
   - line height
   - letter spacing
4. Colors:
   - text color
   - background color
   - transparency/clear background option
5. Effects (minimum set):
   - none
   - shadow
   - outline
   - glow
6. Presets:
   - at least `Basic` and `Bubble` groups
   - preset applies style bundle without replacing text content

## 4.3 Transform Controls for Text Clip

1. Text clip supports transform properties:
   - `x`, `y` (normalized position)
   - `scaleX`, `scaleY`
   - `rotation`
   - `opacity`
   - `flipX`, `flipY`
2. Transform can be edited by:
   - numeric fields/sliders
   - direct manipulation in preview (if enabled for text)
3. Reset controls:
   - reset per property
   - reset all transform

## 4.4 Text Keyframe Workflow

1. User can add keyframe at current playhead for text transform.
2. Keyframe markers must be visible and selectable.
3. Selecting a keyframe:
   - seeks playhead to marker time
   - enters keyframe edit context
4. Updating transform while keyframe selected updates that keyframe.
5. Adding keyframe at same timestamp updates existing marker (no duplicates).
6. User can delete selected keyframe.
7. Deleting keyframe triggers interpolation recalculation between remaining keyframes.
8. Interpolation between keyframes is automatic and reflected in playback.
9. Easing options (minimum):
   - linear
   - ease-in
   - ease-out
   - ease-in-out

## 4.5 Timeline Behavior for T1 Text Clips

1. Text clips appear only in track `T1`.
2. Text clips support:
   - select
   - move (start time)
   - trim/resize
   - delete
3. Timeline clip label should show text snippet (safe truncated preview).
4. If text clip has keyframes, timeline indicates keyframe presence.

---

## 5) Data Model Requirements

## 5.1 Clip Contract

Text clip must carry:
1. `textConfig`
2. `transform` (base transform and optional keyframes)

Suggested `textConfig` fields:
1. `text`
2. `fontFamily`
3. `fontSize`
4. `fontWeight`
5. `fontStyle`
6. `underline`
7. `color`
8. `backgroundColor`
9. `textAlign`
10. `lineHeight`
11. `letterSpacing`
12. `effect`
13. `effectColor` (if applicable)

Suggested transform keyframe fields:
1. `time` (normalized 0..1 inside clip duration)
2. `x`
3. `y`
4. `scaleX`
5. `scaleY`
6. `rotation`
7. `opacity`
8. `flipX`
9. `flipY`
10. `easing`

## 5.2 Validation

Validation paths must accept track type `text` and text clip payload.
Validation must reject:
1. missing required text fields
2. invalid ranges (font size, opacity, scale)
3. malformed keyframe timestamps

## 5.3 Persistence

1. Save/load project must preserve full `textConfig` and keyframes.
2. Auto-save must include text clip updates.
3. Backward compatibility:
   - old projects with no `textConfig` remain loadable
   - missing optional text fields are defaulted safely

---

## 6) Render Requirements (Text Only)

1. Final render must include text clips from `T1`.
2. Render pipeline must apply:
   - text content
   - style
   - transform
   - keyframe interpolation over time
3. Render output for text must match preview behavior for the same timestamp.
4. Multiple text clips on `T1` follow timeline order and overlap rules defined by clip time ranges.

---

## 7) UX Requirements

1. Text editing panel must be discoverable from editor sidebar/toolbar.
2. Keyframe controls for text must not be hidden behind unrelated modes.
3. Buttons must have consistent state visuals:
   - default
   - active
   - disabled
   - destructive
4. Any unavailable action must show reason via tooltip.

---

## 8) Acceptance Criteria

### AC-01 Add Text
1. Clicking `Add Text` creates a new clip on `T1`.
2. Clip is visible in timeline and preview.

### AC-02 Style Editing
1. User edits font/size/color/effect and sees immediate preview changes.
2. Save/reload project keeps style unchanged.

### AC-03 Transform
1. User changes position/scale/rotation and preview updates immediately.
2. Export render reflects same transform.

### AC-04 Keyframes
1. User sets two keyframes with different transforms.
2. Playback shows smooth transition between them.
3. Deleting one keyframe recalculates motion using remaining markers.

### AC-05 Timeline Editing
1. User can move/trim/delete text clip on `T1`.
2. Timeline and preview stay in sync after edits.

### AC-06 Render Parity
1. At sampled timestamps, rendered text output matches preview intent.

---

## 9) Test Plan

## 9.1 Unit Tests

1. text config serialization/deserialization
2. text transform resolver
3. keyframe upsert/update/delete for text clips
4. interpolation math with easing
5. validation acceptance of `text` track and rejection of invalid payload

## 9.2 Component Tests

1. TextClipEditor form controls update live preview
2. keyframe marker select/jump/edit/delete
3. timeline text clip label and keyframe indicators

## 9.3 Integration Tests

1. add text clip -> style -> keyframe -> save -> load -> state retained
2. add text clip -> render -> verify text present with expected transform trajectory

## 9.4 Regression Tests

1. existing video/audio/overlay clips continue to load and render unchanged
2. non-text workflows are unaffected by text feature changes

---

## 10) Implementation Boundaries

Primary code areas expected:
1. `apps/web/client/src/components/videoeditor/TextClipEditor.tsx`
2. `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
3. `apps/web/client/src/components/videoeditor/Timeline.tsx`
4. `apps/web/client/src/components/videoeditor/OverlayPanel.tsx` (if shared keyframe UI is reused)
5. `apps/web/client/src/types/videoEditor.ts`
6. `apps/web/client/src/services/projectManager.ts`
7. `apps/web/shared/types/mediaJob.ts`
8. `python-backend/app/tasks/media_job_worker.py`
9. related test files in `apps/web/client/src/components/videoeditor/__tests__/` and `python-backend/tests/`

---

## 11) Out-of-Scope Confirmation

This spec intentionally does **not** include any requirements for:
1. Razor
2. Ripple
3. preview frame lock semantics
4. service restart/429
5. toolbar redesign outside text-related controls

---

## 12) Definition of Done

1. All acceptance criteria in Section 8 pass.
2. Unit/component/integration tests for text clip pass in CI.
3. Text clip feature works end-to-end: add -> style -> animate -> save/load -> render.
4. No regressions in non-text timeline behavior.

