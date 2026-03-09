# Section 01: Deck Note Persistence

## Goal

Create a first-class deck-level `Presentation Note` field that can be loaded and updated through the existing presentation deck APIs.

## Scope

- DB migration for `presentation_decks.notes`
- drizzle schema update
- service input/output extension for deck note updates
- router schema update for `updateDeck`
- targeted service/router tests

## Why This Comes First

- the editor and AI draft work both need a stable deck-level persistence target
- without this section, Presentation Note has nowhere canonical to live

## Implementation Steps

1. Add nullable `notes` column to `presentation_decks`
2. Extend drizzle type inference and any affected fixtures/builders
3. Update `UpdatePresentationDeckMetadataInput` to include `notes?: string | null`
4. Extend `updatePresentationDeckMetadata()` so deck notes save alongside title/description
5. Extend `presentationRouter.updateDeck` input zod schema with `notes`
6. Add service/router tests for saving and returning deck notes

## Constraints

- use the existing deck version increment behavior
- do not overload `description` to act as notes
- keep note length bounded similarly to other text metadata fields

## Done When

- deck rows can persist `notes`
- `updateDeck` supports `notes`
- deck-fetch flows expose `notes`
- tests prove the new field is versioned and tenant-scoped
