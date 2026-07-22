# Section 03 — UI and Verification

## Ownership

Episode page state/mutations, workspace prop forwarding, storyboard selectors,
localized copy, component tests, and final verification.

## UI/UX Contract

### Target user / job-to-be-done

Vertical Drama creators need Thai/source-language image prompts and English
video-motion prompts in one sub-episode.

### Surface inventory

- Episode storyboard model/settings row.

### Component map

- `VerticalDramaEpisodePage`: independent state and mutation callbacks.
- `VerticalDramaEpisodeWorkspace`: prop forwarding only.
- `VerticalDramaStoryboardPanel`: two selectors and Option 1 disabled state.
- `LanguageSelect`: reusable `disabled` prop.
- `verticalDramaWorkspaceCopy`: Thai/English labels.

### State matrix

- Option 1: image value “follow synopsis language,” disabled.
- Option 2: image dropdown enabled.
- Video dropdown: always independent and enabled when callback exists.
- Save error: existing toast; no optimistic false success.
- Generated media: unchanged until the user explicitly regenerates.

### Responsive matrix

- 390x844, 768x1024, 1440x900: existing wrapping layout; labels remain
  distinguishable with no horizontal clipping.

### Accessibility acceptance

- Distinct accessible labels.
- Native disabled state on the Option 1 select.
- Existing keyboard focus path retained.
- Explanation does not rely on color.

### Copy contract

- Thai: `ภาษาพรอมต์ภาพ`, `ตามภาษาเรื่องย่อ (อัตโนมัติ)`,
  `ภาษาพรอมต์วิดีโอ`.
- English: `Image prompt language`, `Follow synopsis language (automatic)`,
  `Video prompt language`.
- Existing dialogue/accent copy remains unchanged.

### Browser evidence

Capture or manually verify Option 1 and Option 2 at mobile, tablet, and desktop
viewports when a runnable local app/session is available.

## TDD expectations

Add component tests for independent callbacks, labels, and disabled/enabled
states before implementation.

## Acceptance checks

- Selectors are visually and semantically distinct.
- Changing one does not invoke the other's callback.
- Targeted tests, typecheck, diff check, and relevant browser checks pass or a
  skipped browser check is explicitly reported with reason.

## Implementation result

Completed. The episode settings row now exposes distinct image and video
prompt-language controls. Option 1 renders the image control as a native
disabled “ตามภาษาเรื่องย่อ (อัตโนมัติ)” value; Option 2 enables its independent
language selection. Targeted automated verification is recorded in the task
handoff; authenticated browser evidence requires a runnable signed-in session.
