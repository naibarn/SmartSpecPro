# Section 01: Contracts And UI Entry Point

## Goal

Add the shared contract and Storyboard Review entry point for preview-match browser capture without changing the existing HyperFrames `Render Final Composite` action.

## Scope

- Add engine id `preview_match_browser_capture`.
- Add quality enum `standard | high`.
- Add shared `PreviewMatchCompositionPayload`, projection, status, stage, and failure-code types.
- Extract or introduce a shared payload builder so Live preview and capture use the same resolved composition data.
- Preserve structured `subtitleCues` across UI/API/runtime boundaries.
- Add `Capture Final Composite` / `Capture ตาม Preview` beside the current final render action.
- Add quality selector and capture-specific UI states.

## Files To Review

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/shared/workerRuntime.ts`
- existing shared storyboard or HyperFrames contract modules
- existing Storyboard Review tests or helper test files

## Files To Change

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/shared/storyboardPreviewMatchCapture.ts` if added
- `apps/web/shared/workerRuntime.ts` only for re-export or shared worker compatibility
- focused client/shared tests

## Contract Requirements

The shared payload must include:

- tenant/product/run/storyboard identity
- revision, final config hash, preview composition hash, and timeline hash
- output width, height, fps, duration
- shot ids, source video refs, media start, start/end, duration
- overlay, animation, transition, text motion, font, subtitle, and safe-zone settings
- structured `subtitleCues`
- native audio and approved audio event policy

Rules:

- `subtitleCues` is the render-time source of truth.
- `subtitleText` is display metadata only.
- Hashes include every field that affects pixels, timing, subtitles, media selection, audio policy, and final dimensions.
- Non-rendering UI-only state must not affect hashes.
- Edits to render-facing fields after hash generation mark capture stale or regenerate the payload before queueing.

## UI/UX Contract

### Target User / JTBD

Storyboard Review user preparing a final MP4 from approved source videos. They need the final MP4 to match Live preview for animation, subtitle timing, text layout, and source video playback.

### Surface Inventory

- final composite control panel
- Live preview area
- final output status/projection area

### Component Map

- Existing `Render Final Composite` button remains the HyperFrames render action.
- New `Capture Final Composite` button queues preview-match browser capture.
- Quality selector controls `standard | high`.
- Capture status projection shows queued, active, cancelled, failed, verified, and Library-saved states.
- Existing Live preview surface remains the visual source of truth.

### State Matrix

- disabled: feature off, missing source video assignments, missing product/run, stale preview hash, quota blocked
- loading: create mutation pending
- active: queued/preparing/capturing/encoding/verifying/publishing
- success: verified output ready or saved to Library
- error: failed with user-safe reason and retry guidance
- cancelled: cancellation acknowledged and stale attempt blocked

### Responsive Matrix

- mobile: stack final actions; keep quality selector close to capture action
- tablet/laptop: actions may sit side by side with concise helper copy
- desktop: preserve the existing dense review workflow; no large explanatory panel

### Accessibility Acceptance

- keyboard reachable buttons and selector
- clear focus states
- `aria-label` or accessible text for quality selector
- status updates through existing toast/live-status pattern where available
- UI animation may respect reduced motion; final capture animation must still render

### Copy Contract

- Button: `Capture Final Composite`
- Thai label: `Capture ตาม Preview`
- Helper: `บันทึกจาก preview runtime เพื่อให้ animation และ subtitle เหมือนที่เห็น`
- Standard: `เร็วกว่า เหมาะกับ social video`
- High: `คมกว่า เหมาะกับตัวอักษรเยอะหรือเก็บงาน final`

### Browser Evidence Required

- Screenshot showing both final actions and quality selector.
- Screenshot of disabled/stale capture state.
- Screenshot of active capture state.
- Screenshot of failed capture state with user-safe copy.
- Verify controls do not overlap the preview surface on mobile and desktop.

## Test First

- Test shared enum validation.
- Test hash changes when render-facing fields change.
- Test hash does not change for UI-only state.
- Test payload builder preserves `subtitleCues`.
- Test UI shows both final actions when source assignments are valid.
- Test capture action disables for stale or incomplete state.
- Test quality selector defaults to `standard`.
- Test high option respects the high-quality feature flag.

## Acceptance Criteria

- Existing render action still calls the current HyperFrames path.
- New capture action calls only the new preview-match capture mutation.
- Live preview and capture payloads are shared or byte-equivalent.
- Structured subtitle cues survive the UI boundary.
- Users can tell which action is deterministic render and which is preview-match capture.
