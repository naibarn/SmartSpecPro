# Section 06: Media Studio Gemini Omni UX

## Goal

Replace confusing raw/synced field interaction with a dedicated Gemini Omni suite panel.

## What This Section Must Change

- Detect `gemini-omni-video` selection.
- Render a suite panel with:
  - reference image picker/status
  - source video picker/status
  - character asset picker
  - audio asset picker
  - inline create dialogs for character/audio
  - delivery mode selector
  - reference unit meter
  - credit estimate
  - skill/QA cost indicator when those steps are billed separately
  - QA status areas
- loading, empty, and error states for provider asset pickers
- Keep existing reference images/videos as source of truth.
- Keep `modelInputValues` for generic fields only.
- Hide or demote synced raw provider fields in normal mode.

## Files Likely Touched

- `apps/web/client/src/pages/MediaStudio.tsx`
- possible new components under `apps/web/client/src/components/media`
- provider asset API hooks
- i18n translation files
- UI tests

## UX Rules

- Reference Images and Source Video must be visibly interactive when supported.
- Source Video should cap at one selected video.
- Character picker should cap at 3.
- Quota meter must show why a selection is invalid before Generate is clicked.
- Create Character/Audio should return to Video flow with the new asset selected.
- Advanced/debug mode may reveal provider payload names; normal mode should not.
- Controls must be keyboard-accessible, mobile-safe, and localized in Thai/English.
- Character creation must block reference images larger than 20 MB before submission.
- Storyboard mode must surface per-clip progress and partial failure states.
- Processing status should be understandable whether completion arrives from callback or polling.
- Unsafe/non-public references should show a direct error before generation.
- Character/Audio create dialogs should show policy/consent acknowledgment when tenant policy requires it.
- Storyboard mode should show per-clip and total estimated cost before launch.
- Rate-limit, concurrency, and budget blocks should be disabled/deferred states, not generic failures.

## Tests

- image/video reference controls are interactive
- source video cap works
- over-quota blocks generation
- empty character/audio states show create actions
- newly created asset is selected
- dynamic raw fields are not the primary normal UX
- mobile layout keeps controls usable without overlapping text
- Thai and English strings exist for new labels/errors
- callback/polling processing status does not expose infrastructure internals
- unsafe reference URL errors are visible and actionable
- policy/consent acknowledgment is required before creating reusable character/voice assets when configured
- storyboard cost estimate includes provider, skill, and QA costs when applicable
- budget/rate/concurrency blocks do not submit provider jobs

## Completion Criteria

- A user can understand what to upload/select for Gemini Omni without knowing Kie raw field names.
- A user can recover from asset picker/load/create errors without losing their video setup.
- A user can see why a generation is blocked, deferred, or too expensive before credits are reserved.
