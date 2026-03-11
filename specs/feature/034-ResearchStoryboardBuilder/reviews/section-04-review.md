# Section 04 Review

## Scope reviewed

- `apps/web/server/services/agencyDeckCommitService.ts`
- `apps/web/server/services/agencyDeckCommitService.test.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/agency.ts`

## Findings

- No blocking correctness or security findings in the Section 04 slice.

## Checks performed

- Verified deck commits stay idempotent on repeated confirm requests with the same commit token.
- Verified the first placeholder slide is overwritten and remaining slides are appended sequentially with expected version increments.
- Verified library item resolution in presentation services now honors the caller transaction, which is required for atomic deck commits.
- Verified preview expiration still blocks commit before any durable deck writes.

## Residual risk

- Committed deck targets currently serialize `{ deckId, libraryItemId }` into the existing `targetId` field because the artifact index does not yet have separate columns for both identifiers.
- Preview read DTOs still expose the raw stored target string for committed decks; richer parsed target metadata can remain an additive follow-up if UI consumers need it.
