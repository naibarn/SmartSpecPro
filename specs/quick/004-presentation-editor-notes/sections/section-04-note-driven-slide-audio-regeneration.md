# Section 04: Note-Driven Slide Audio Regeneration

## Goal

Let users generate or regenerate a slide's narration audio from that slide's note text, with explicit model and voice selection.

## Scope

- extend `SlideAudioPanel` instead of creating a separate narration UI
- add per-slide generate/regenerate controls
- add audio model / voice selection dialog
- add presentation-scoped mutation/service orchestration for TTS generation and attach
- preserve existing audio until replacement succeeds
- client/server tests for generation, replacement, and failure behavior

## Key Design Decisions

- the source text for narration is the saved `slide.notes` value
- if the note is dirty in the editor, `Regenerate Audio` must not appear as an active action yet
- while dirty, the UI should show `Save Note First` guidance so the user understands why regenerate is unavailable
- `ImageModelCombobox(mediaType="audio")` should handle model/tier selection
- `ModelInputFieldsPanel` should handle provider-specific voice/options and previews
- regeneration replaces the slide's `audioTrack` reference only after the new generated audio is ready

## Implementation Steps

1. Extend the selected-slide note flow so the UI can tell whether the current slide note has unsaved edits
2. Add `Generate from Note` and `Regenerate Audio` actions inside `SlideAudioPanel`
   - `Generate from Note` appears when there is a saved note and no slide audio yet
   - `Regenerate Audio` appears when there is saved note text and existing slide audio
   - if note edits are dirty, replace active generate/regenerate actions with `Save Note First`
3. Add a narration-generation dialog that shows:
   - note preview
   - audio model selector
   - dynamic voice/options fields
   - generation CTA and pending state
4. Add a presentation mutation/service, for example `generateSlideAudioFromNote`, that:
   - validates deck/slide/version access
   - reads the latest saved slide note
   - submits async audio generation
   - polls or orchestrates task completion
   - adds the completed media task to library
   - updates slide audio to point at the new library item
5. Ensure existing slide audio remains unchanged if generation fails or is cancelled
6. Refresh parent deck/audio state after success so playback/export pick up the new slide audio
7. Add tests for:
   - blank-note disabled state
   - dirty-note state hiding/replacing regenerate action until save succeeds
   - model/voice selection UX
   - save-note-before-generate path
   - replacement success
   - replacement failure preserving old track

## Constraints

- do not generate from stale unsaved note text
- do not delete old audio assets automatically
- keep the feature slide-scoped; project audio remains a separate concept

## Done When

- users can generate slide audio directly from slide note text
- users can regenerate a slide with a new selected voice/model
- regenerate is not available until the edited note has been saved
- successful regeneration replaces the slide audio track
- failed regeneration leaves the existing audio intact
