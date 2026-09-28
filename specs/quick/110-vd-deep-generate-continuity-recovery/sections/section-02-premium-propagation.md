# Section 02 — Premium propagation

## Ownership

Premium deep-draft chunk state, prompt wiring, and accepted episode-memory reconciliation.

## Targets

- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryBible.deepStoryDrafts.test.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryBible.premiumDeepDraft.test.ts`

## TDD

- Assert canonical IDs appear in the next chunk's prompt.
- Assert revise/recovery paths retain the ID set.
- Assert accepted resolved IDs are removed and new IDs are added.

## Acceptance

Premium and Standard use the same structured canonical-ID contract.

## Risks

Only the accepted winner may update shared state; losing fan-out candidates must not pollute the ledger.
