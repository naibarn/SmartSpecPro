# Research Notes

## Planning Scope Verdict

- Scope stays within `deep-plan-quick` and fits `standard` depth
- Work crosses DB, router/service, editor UX, and AI draft flow, but remains one feature family with clear product intent

## Codebase Pattern Scan

### Existing slide note persistence already exists end-to-end

- `apps/web/drizzle/schema.ts`
  - `presentation_slides.notes` already exists as `text("notes")`
- `apps/web/server/services/presentationPersistence.ts`
  - `createPresentationSlide()` already persists `notes`
- `apps/web/server/services/presentationService.ts`
  - `addSlideToDeck()` accepts `notes`
  - `duplicateSlideInDeck()` copies `sourceSlide.notes`
  - `updateSlideInDeck()` updates `notes` when passed
  - version snapshots and restore logic already include `notes`
- `apps/web/server/routers/presentation.ts`
  - `addSlide` and `updateSlide` tRPC inputs already allow `notes`

Conclusion:

- per-slide note storage is already available
- the missing work is editor authoring UX and correct propagation through client save paths

### Deck-level note persistence does not exist yet

- `apps/web/drizzle/schema.ts`
  - `presentation_decks` currently has `title`, `description`, `version`, `slideCount`, `totalAssetBytes`, `projectAudioTrack`, timestamps
  - there is no deck-level `notes` / `presentationNote` field
- `apps/web/server/services/presentationService.ts`
  - `UpdatePresentationDeckMetadataInput` and `updatePresentationDeckMetadata()` only cover `title` and `description`
- `apps/web/server/routers/presentation.ts`
  - `updateDeck` only accepts `title` and `description`

Conclusion:

- deck-level note requires a DB migration plus router/service contract extension

## Editor / UX Scan

### Presentation Editor already knows slide notes conceptually, but does not author/save it

- `apps/web/client/src/pages/PresentationEditor.tsx`
  - local comparison types include `notes`
  - version diff logic already compares `notes`
  - selected saved version views already read `selectedSavedVersionSlide.notes`

### Actual save paths drop slide notes today

- `performSave()` sends `deckId`, `slideId`, `expectedVersion`, `saveMode`, `title`, `slideContent`
  - it does not send `notes`
- auto-layout pre-save path for dirty cached slides also omits `notes`
- any future note editor wired only to local UI would lose data unless these mutation payloads are updated

### Deck-level mutation pattern already exists

- title saves use `updateDeckMutation` through `runDeckMutation(...)`
- this is the natural fit for explicit Presentation Note saving

### Hidden-on-demand UX matches existing component style

- editor already uses `Dialog`, collapsible menus, mobile drawers, and compact header actions
- the note feature can follow the same approach without an always-visible panel

## AI Draft Flow Scan

### Current AI draft schema has no note/source-text field

- `apps/web/shared/presentation/aiTypes.ts`
  - `AIPresentationSlideSchema` includes `templateId`, `title`, `body`, `sections`, `graphicCategory`, `imagePromptKeywords`
  - no `notes` / `speakerNotes` / `sourceExcerpt` field exists

### Current AI draft pipeline already has the data needed

- `apps/web/server/services/aiPresentationService.ts`
  - draft flow generates or receives full `articleText`
  - article-to-slide split happens in the LLM structuring phase
  - final slide insertion calls `addSlideToDeck(...)`
  - `addSlideToDeck(...)` can already persist `notes`

Conclusion:

- AI draft enhancement is mostly mapping/contract work:
  - persist full article text onto the deck
  - carry split-per-slide source text into `slide.notes`

## Slide Audio Infrastructure Scan

### Current slide audio UX is library/upload/trim only

- `apps/web/client/src/components/presentation/SlideAudioPanel.tsx`
  - already supports:
    - browse/select existing library audio
    - upload audio
    - trim / volume
    - remove / preview
  - it does not yet support text-to-speech generation from slide note text

### The repo already has reusable model + voice selection UI

- `apps/web/client/src/components/presentation/ImageModelCombobox.tsx`
  - supports `mediaType="audio"` and already formats UVoice tiers
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
  - supports searchable provider-backed voice fields
  - already supports voice preview when model field options provide preview URLs
- `apps/web/client/src/lib/mediaModelInputs.ts`
  - parses dynamic model fields and sync targets

Conclusion:

- audio generation UI should reuse the existing audio model/voice components instead of inventing a custom selector

### The backend already has audio-generation primitives but no presentation-scoped narration endpoint

- `apps/web/server/services/mediaGenerationService.ts`
  - already exposes `generateAudioAsync(...)`
- `apps/web/server/routers/media.ts`
  - already exposes task polling and model-field option discovery
- `apps/web/server/services/aiPresentationService.ts`
  - already demonstrates the end-to-end pattern:
    - build narration text
    - submit async audio generation
    - poll task completion
    - add completed media task to library
    - attach resulting audio to a slide
- `apps/web/server/routers/presentation.ts`
  - currently has `setSlideAudio` and `setDeckAudio`
  - there is no presentation mutation like `generateSlideAudioFromNote`

Conclusion:

- the missing piece is orchestration specific to Presentation Editor:
  - validate note text
  - generate audio from that text
  - add the completed task to library
  - atomically update the slide's audio track

### Save/conflict interaction matters for note-driven audio regeneration

- `SlideAudioPanel` currently writes audio via deck-version optimistic locking only
- the main slide editor conflict system uses `expectedSlideVersion`, `conflictPolicy`, and local draft/cache handling
- if note-driven generation reads persisted `slide.notes` while the user still has unsaved note edits, generated audio can be out of sync with what the user sees

Conclusion:

- regenerate audio should either:
  - require slide note save first, or
  - explicitly send current note text in the request and then reconcile persistence
- the safer fit with current editor semantics is: save note first, then generate

## Playback / Export Isolation Scan

### Existing play/export contracts already exclude notes

- `apps/web/shared/presentation/contracts.ts`
  - `presentationSlideshowSlideSchema` contains `slideId`, `orderIndex`, `title`, `durationMs`, `transition`, `audioTrack`
  - no slide note field exists
- `apps/web/server/services/presentationPlaybackExport.ts`
  - slideshow/export payload builders are based on the minimal slideshow contract above
- `apps/web/server/routes/slideRender.ts`
  - render route embeds only `slide.slideContent`

Conclusion:

- note leakage risk is low if new work keeps notes on deck/slides only and does not extend playback/export payloads
- regression tests should explicitly lock this behavior

## Test Surface Scan

- `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - already mocks slides with `notes: null`
  - suitable place for hidden note UX, save payload, and copy action coverage
- `apps/web/client/src/components/presentation/__tests__/AIDraftModal.test.tsx`
  - good place for AI draft completion and refresh assumptions, but persistence assertions may belong closer to service/router tests
- `apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx`
  - natural home for note-driven audio generation entry point, voice-selection dialog, and regenerate button behavior
- `apps/web/server/services/presentationService.test.ts`
  - already covers slide note presence in snapshot/conflict fixtures
  - natural home for deck-note metadata update coverage
- `apps/web/server/routers/presentation.test.ts`
  - good seam for new `updateDeck` input/output contract coverage
- `apps/web/server/routers/media.ts`
  - existing task polling/model option endpoints can be reused rather than duplicated
- playback/export tests
  - current schemas already avoid notes, but regression coverage should assert that remains true after the feature lands

## Dependency / Config Scan

- No external package or web research needed
- DB migration required in `apps/web/drizzle`
- No infra or feature-flag requirement discovered from current request

## Security / Tenant Boundary Scan

- note mutations should continue using existing tenant-scoped actor enforcement in presentation router/service
- deck note must not be stored in unscoped cache or export payloads
- copy action is client-side only and does not change tenant/security boundaries
