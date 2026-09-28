# Section 04 — UI and Preview

## Ownership

Own preset cards, thumbnail/preview states, basic controls, advanced disclosure,
Player/fullscreen behavior, error copy and accessibility. Do not duplicate renderer
logic in CSS/canvas preview.

## Target files

- `apps/web/client/src/components/videoStudio/MotionPanel.tsx`
- `apps/web/client/src/components/videoStudio/RemotionProjectPreview.tsx`
- `apps/web/client/src/components/videoStudio/TimelineStagePanel.tsx`
- `apps/web/client/src/components/videoStudio/videoStudioCopy.ts`
- focused client tests and browser evidence

## UI/UX Contract

### Target user / job-to-be-done

Creator chooses a cinematic visual style, sees it in the real Player, adjusts a few
safe controls and can render without editing JSON.

### Component map

Preset card, selected state, preview thumbnail, Player stage, compact controls,
advanced disclosure, loading/error/unsupported fallback, fullscreen control.

### State matrix

Loading, ready, selected, unsaved, invalid props, missing runtime, Player error and
empty/fallback must each have explicit copy and action.

### Responsive/accessibility

Keyboard selectable cards, semantic labels, focus states, reduced-motion preview option,
moderate default Player size, fullscreen, narrow-screen stacked controls.

### Copy/localization

Thai-first labels for particle, network, sphere, title, density, speed and glow with
English fallback; no raw ids as the primary label.

### Browser evidence

Verify selecting each family, preview playback/scrubbing, fullscreen, control update,
error recovery and narrow layout in the existing Video Studio browser path.

## TDD expectations

Add component tests for selection/control persistence and browser tests for real Player
behavior. Ensure preview loads the same declarative props that the worker receives.

## Risks

Avoid a second CSS approximation of the render. Avoid showing a preview as complete if
the worker contract cannot render it.
