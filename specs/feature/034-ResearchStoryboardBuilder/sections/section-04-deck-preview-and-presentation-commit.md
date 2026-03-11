# Section 04 - Deck Preview And Presentation Commit

## Objective

Use `AIPresentationSlide[]` plus deck-level metadata as the canonical deck preview contract and commit confirmed previews into real presentation decks through existing Node presentation services.

## Prerequisites

- Section 01 complete.
- Section 02 complete.

## Scope

- Define the deck preview DTO around `AIPresentationSlide[]`.
- Translate confirmed preview payloads into actual deck and slide writes.
- Reuse layout and presentation services rather than building a new render pipeline.
- Preserve transactional and idempotent behavior for deck creation.

## Primary files and areas

- `apps/web/shared/presentation/aiTypes.ts`
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationImportService.ts`
- Agency result routing and confirm handlers

## Required implementation work

### 1. Lock the preview payload contract

Deck previews should contain:

- deck-level metadata such as title and summary framing
- `AIPresentationSlide[]` as the canonical preview body
- optional notes and asset suggestions needed for later commit

Do not require preview payloads to produce final `PresentationSlideContent` directly.

### 2. Commit through existing presentation services

On confirm:

- create the backing library item if needed
- create the deck
- translate preview slides through the existing layout/presentation pipeline
- add slides sequentially or through a dedicated transactional helper
- link committed deck records back to the originating run and sources

### 3. Preserve preview on commit failure

If deck commit fails, the preview must remain readable and retryable. Avoid partial duplicate decks by using transactions and commit tokens.

## Tests to write first

- Node test: preview DTO accepts `AIPresentationSlide[]` plus deck metadata.
- Node test: confirmed preview creates a real deck through existing presentation services.
- Node test: slide insertion respects existing ordering/version rules.
- Node test: deck commit failures do not destroy preview visibility.
- Node test: repeated confirm actions do not create duplicate decks.
- Node integration test: committed deck artifact stores deck and library item identifiers back on the run artifact index.

## Risks and safeguards

- Orphan risk if deck creation is not transactional. Reuse existing transaction-safe patterns.
- Contract drift risk if preview schema diverges from layout pipeline expectations. Use the shared AI presentation types.
- Coupling risk if preview emits fully rendered content. Keep preview at the structured slide-data level.

## Exit criteria

- Canonical deck preview uses `AIPresentationSlide[]` plus deck metadata.
- Confirmed deck previews create real presentation decks through existing services.
- Preview survives transient commit failures.
- Duplicate deck creation is suppressed by design and tests.

## Implementation notes

- Added `apps/web/server/services/agencyDeckCommitService.ts` to commit `presentation_deck` previews into real presentation decks while preserving preview lifecycle state on `agency_run_artifacts`.
- Deck commit now creates a backing `presentation` library item with `source = "agency_generated"`, creates or reuses the deck through the existing presentation service path, and renders each `AIPresentationSlide` through the shared layout engine before writing slides.
- The first auto-created placeholder slide is updated with the first preview slide, then remaining slides are appended sequentially with optimistic-version increments to avoid duplicate or out-of-order writes.
- Successful commits persist `targetType = "presentation_deck"` and encode both `deckId` and `libraryItemId` into the stored target identifier so retries remain idempotent and the commit response can return both identifiers.
- Hardened `apps/web/server/services/presentationService.ts` so `createPresentationDeckForLibraryItem` and related helpers resolve library items on the caller-provided DB client, allowing the new deck commit flow to keep library item creation and deck writes in one transaction.
- `apps/web/server/routers/agency.ts` now routes deck previews into the presentation commit service while research/storyboard previews continue through the library-backed markdown commit path from Section 03.

## Tests added and updated

- `apps/web/server/services/agencyDeckCommitService.test.ts`
- `apps/web/server/services/presentationService.test.ts`

## Known follow-ups

- The run artifact index still has only `targetType` and `targetId`, so the committed deck path currently stores `{ deckId, libraryItemId }` as a compact serialized payload inside `targetId`.
- Preview read APIs still expose the raw persisted `targetId` string for committed decks; adding a richer parsed target object can remain an additive follow-up if the UI needs it.
