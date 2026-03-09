# Implementation Plan

## Objective

Add hidden authoring notes to Presentation Editor so users can store and copy:

- one `Presentation Note` for the whole deck
- one `Slide Note` per slide

The feature must also capture AI Draft source text:

- full article text -> `Presentation Note`
- per-slide split text -> `Slide Note`
- edited `Slide Note` -> optional regenerated slide narration audio

Notes remain author-only metadata and must never appear in play mode or exports.

## Current-Codebase Fit

- slide-level persistence already exists via `presentation_slides.notes`, so the per-slide work should extend current client save flows instead of adding new storage
- deck metadata already has a versioned update path (`updateDeckMutation` / `updatePresentationDeckMetadata`), so deck notes fit naturally there
- play/export contracts are already intentionally minimal and do not contain notes, which gives a clear seam for keeping notes authoring-only
- AI Draft already computes both the full article and the slide split, so note capture is mostly plumbing rather than new generation logic

## Affected Areas

- DB schema and migration for deck-level note storage
- shared/editor types for deck note presence
- presentation router/service deck update contract
- Presentation Editor hidden note UI, local state, save/copy handlers
- slide audio authoring/generation UI
- AI Draft schema/output normalization and slide insertion mapping
- note-driven audio generation orchestration and audio-library attach flow
- regression tests for editor save paths and play/export non-leakage

## Proposed Approach

### 1. Add deck-level note persistence without inventing a parallel storage model

Persist Presentation Note directly on `presentation_decks`.

Implementation direction:

- add a nullable `notes` column to `presentation_decks`
- extend deck metadata input types and tRPC `updateDeck` schema to accept `notes`
- ensure `getDeck` / `getDeckByLibraryItem` naturally return the new field through the deck row

Acceptance:

- a deck can store `notes: string | null`
- deck note updates increment deck version and remain tenant-scoped
- existing title/description update behavior stays intact

### 2. Wire hidden note authoring into Presentation Editor

Add explicit open-on-demand note controls for both note scopes.

Implementation direction:

- add one Presentation Note trigger in the editor header/menu
- add one Slide Note trigger bound to the currently selected slide
- use dialog/drawer/collapsible UI that is closed by default on desktop and mobile
- each note surface should support:
  - viewing current note text
  - editing text
  - saving changes
  - copying note text to clipboard
- slide note editing must feed the same slide mutation path used by the editor so autosave/manual save/conflict handling stays coherent
- deck note editing should use the existing deck mutation flow and maintain correct expected-version behavior

Acceptance:

- notes are hidden until the user opens them
- copy button works for both note scopes
- slide note changes survive slide switches, manual save, and autosave
- deck note changes persist after refresh

### 3. Persist AI Draft source text into notes

Treat notes as provenance/context for generated slides.

Implementation direction:

- save full `articleText` into the deck note when AI Draft completes successfully
- extend the AI split result shape so each generated slide carries a concise per-slide source text / excerpt suitable for `slide.notes`
- pass that per-slide note through `addSlideToDeck(...)`
- prefer storing human-readable split text, not raw JSON or prompt metadata

Acceptance:

- article-based drafts leave the full article in Presentation Note
- each generated slide gets the corresponding split text in Slide Note
- topic-only drafts either store the generated article/plan text when available or leave notes empty by an explicit rule; no ambiguous partial garbage

### 4. Add note-driven slide audio generation and regeneration

Use each slide's note text as the source of truth for slide narration generation.

Implementation direction:

- extend the existing `SlideAudioPanel` with a `Generate from Note` / `Regenerate Audio` action for the selected slide
- open a focused narration-generation dialog from that panel
- in the dialog, provide:
  - current slide note preview / excerpt and character count
  - audio model selection using `ImageModelCombobox` with `mediaType="audio"`
  - provider-specific voice/options using `ModelInputFieldsPanel`
  - clear disabled/empty state when the slide note is blank
- when the note has unsaved edits, do not expose `Regenerate Audio` yet; instead show a `Save Note First` CTA or disabled guidance state
- only show `Generate from Note` / `Regenerate Audio` when the current slide note is already persisted
- add a presentation-scoped mutation/service flow that:
  - validates slide + tenant access
  - reads the saved slide note
  - submits async audio generation
  - polls task completion or otherwise orchestrates completion
  - adds the completed audio task into library storage
  - swaps the slide's `audioTrack` to the new library item
- keep the current slide audio attached until the newly generated audio succeeds
- do not auto-delete the previous audio asset; only replace the slide reference

Acceptance:

- a slide with note text can generate audio directly from that note
- a slide with existing audio can regenerate and replace the slide's audio track
- users can choose model/tier/voice before generation
- slides with dirty unsaved note edits do not show active regenerate controls until save succeeds
- blank-note slides cannot start generation and show actionable guidance
- failed generation leaves the existing slide audio untouched

### 5. Keep notes out of runtime playback/export surfaces

The feature is authoring-only and should not bleed into presentation runtime contracts.

Implementation direction:

- do not extend slideshow, play-deck, render-spec, or slide-render payloads with notes
- add focused regression tests that assert note presence on persisted entities does not appear in:
  - play mode payloads
  - slideshow/export payloads
  - slide render HTML

Acceptance:

- notes are available in editor-authoring APIs only
- play/export behavior remains unchanged
- no rendered output contains note text unless a future feature explicitly adds it

## Risks And Mitigations

### Risk: slide note UI saves inconsistently because current editor mutation payload omits notes

Mitigation:

- make slide notes a first-class part of selected-slide draft state
- update every slide-saving path, not only the main manual save button

### Risk: deck note introduces version conflicts with title edits

Mitigation:

- reuse the existing `runDeckMutation(...)` pattern so deck note updates serialize with deck version handling already used for title changes

### Risk: AI Draft stores unusable or overly verbose per-slide note text

Mitigation:

- define a single normalized source-note field for generated slides
- keep it human-readable and bounded

### Risk: note text leaks into play/export accidentally through broad object spreading

Mitigation:

- keep runtime payload builders schema-driven
- add explicit negative tests for play/export payloads and slide-render HTML

### Risk: note-driven audio generation uses stale note text

Mitigation:

- gate action visibility on saved note state
- show `Save Note First` guidance while note edits are dirty
- test the save-before-generate flow explicitly

### Risk: regeneration removes working audio before replacement succeeds

Mitigation:

- only update `slide.audioTrack` after the new audio task is completed and added to library
- keep the previous track unchanged on failure or cancellation

## Acceptance Criteria

- Presentation Editor exposes hidden-on-demand `Presentation Note` and `Slide Note` authoring surfaces
- both note surfaces support edit, save, and copy
- slide notes persist per slide and deck note persists per presentation
- AI Draft stores the full article in deck note and split-per-slide text in slide notes
- users can generate/regenerate slide audio from slide note text with explicit model/voice selection
- `Regenerate Audio` is only available after the slide note is saved
- notes do not appear in play mode, slideshow preview payloads, export payloads, or rendered export HTML
- existing title save, slide save, version history, and runtime playback/export behavior remain intact

## Rollout / Verification Notes

- requires a DB migration and associated test fixture updates
- verify desktop and mobile note open/close behavior in Presentation Editor
- verify copy interactions with clipboard mocks in client tests
- verify AI Draft with article-backed flows first; topic-only flow should follow an explicit fallback rule during implementation
- verify note-driven audio generation preserves the old track when the new generation fails
