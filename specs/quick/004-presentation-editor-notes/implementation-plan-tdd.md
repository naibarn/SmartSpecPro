# Implementation Plan TDD

## Test-First Order

1. deck-note schema/router/service coverage
2. Presentation Editor hidden note UX and save/copy behavior
3. AI Draft note persistence mapping
4. note-driven slide audio generation/regeneration
5. play/export non-leakage regression

## Expected First Failing Tests

### Deck note persistence

- add service/router tests showing `updateDeck` accepts nullable `notes`
- add a test showing `getDeck` / `getDeckByLibraryItem` return a deck row containing persisted notes
- expected initial failure: no deck `notes` field exists in schema/contracts

### Editor note authoring

- add `PresentationEditor.test.tsx` coverage for:
  - opening Presentation Note on demand
  - opening Slide Note on demand
  - saving edited note text through the correct mutation payload
  - copying note text
- expected initial failure: no note UI exists and slide save payload omits `notes`

### AI Draft note capture

- add service-level coverage proving:
  - full article text is written to deck note
  - slide split text is passed as `notes` when calling `addSlideToDeck(...)`
- expected initial failure: AI slide schema/output has no per-slide note field and deck note cannot be updated

### Note-driven slide audio generation

- add `SlideAudioPanel.test.tsx` coverage for:
  - showing `Generate from Note` when a slide note exists
  - hiding or disabling `Regenerate Audio` while the slide note is dirty / unsaved
  - disabling generation when the note is blank
  - opening an audio model/voice dialog
  - saving dirty note edits before generation
  - preserving existing audio if generation fails
- add router/service tests proving:
  - slide note text is the narration source
  - completed generated audio is added to library and attached to the slide
  - existing audio remains attached until replacement succeeds
- expected initial failure: no presentation-scoped TTS generation path exists and `SlideAudioPanel` has no narration-generation UX

### Runtime isolation

- add negative tests proving persisted notes do not surface in:
  - `presentationSlideshowPayloadSchema` outputs
  - `getPlayDeck` payloads
  - `slideRender` HTML
- expected initial failure: depends on implementation mistakes; this is a guardrail test class

## Regression Matrix

- existing slide `notes` snapshot/restore behavior still works
- title and description deck metadata updates still work
- slide manual save and autosave still work when note text changes
- slide duplication still preserves slide notes
- Presentation Note remains hidden until opened
- Slide Note switches with selected slide
- AI Draft article-backed flow populates both deck note and slide notes
- note-driven audio generation requires a non-empty saved slide note
- dirty note state blocks or replaces regenerate CTA with explicit save guidance
- regenerate replaces slide audio only after successful completion
- audio model/voice selectors reuse the shared media-model components
- play mode, slideshow preview, export render spec, and slide render route remain note-free

## Suggested Commands

```bash
pnpm --dir apps/web test -- \
  client/src/pages/PresentationEditor.test.tsx \
  client/src/components/presentation/__tests__/AIDraftModal.test.tsx \
  client/src/components/presentation/SlideAudioPanel.test.tsx \
  server/routers/presentation.test.ts \
  server/services/presentationService.test.ts \
  server/services/presentationPlaybackExport.test.ts \
  server/routes/slideRender.test.ts
```

## Review Gates

- no slide save path may omit `notes` once note editing is introduced
- deck note updates must respect deck versioning and tenant scope
- AI Draft must not write raw machine-only JSON blobs into note fields
- note-driven audio generation must not run against stale unsaved note text
- regenerate CTA must not appear active for unsaved note edits
- regeneration failure must not clear or replace a working slide audio track
- play/export contracts must remain note-free by design, not by accident
