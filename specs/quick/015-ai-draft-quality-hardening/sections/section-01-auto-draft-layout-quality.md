# Section 01: Auto-Draft Layout Quality

## Goal

Improve auto-draft quality for persisted slides by fixing recipe family selection, media-aware fallback, and overlay-heavy long-form defaults.

## Tasks

1. Inspect deck-55-like slides and encode the failure modes as tests.
2. Update family selection/fallback logic so long-form slides can prefer split/article compositions instead of repeated image overlays.
3. Prevent text-only persisted output when generated media exists and the slide should remain visual.
4. Verify the saved note/text path still follows rendered content.

## Done when

- Service tests demonstrate better layout diversity and no accidental visual blank slide in the targeted regression cases.
