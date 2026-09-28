# Section 03 — History lifecycle and verification

## Ownership

Own generated replacement linking, primary demotion, and end-to-end focused proof.

## Target files

- `apps/web/server/services/verticalDramaCharacterStock.ts`
- generation/link tests and existing history tests

## Requirements

- Successful new main portrait becomes the only current primary.
- Previous primary remains in history and is not deleted.
- Failure before successful generation/link leaves current primary unchanged.
- Repeated generation is idempotent for same asset and does not create duplicate character/media links.
- Verify persisted task reference parameters and asset role/state, not only UI output.

## TDD

Add success/failure lifecycle tests and history assertions. Reuse existing demotion helpers where correct; change only missing behavior.

## Acceptance checks

- Old asset is retrievable but excluded from current primary auto selection.
- New asset can be generated again without a delete prerequisite.
- No migration or destructive data operation is introduced without evidence.

## Verification

Run focused server/client tests, formatting, and targeted typecheck. Record baseline failures separately. Browser/provider verification is a follow-up proof boundary unless the environment permits it.

## Implemented

- `linkAsset` now demotes approved sibling `primary_portrait` rows transactionally when a successful generated/imported primary is linked.
- Old rows remain in the asset ledger/history and are marked non-current (`approved: false`, metadata state `generated`).
- Added service coverage for replacement demotion and history preservation.
