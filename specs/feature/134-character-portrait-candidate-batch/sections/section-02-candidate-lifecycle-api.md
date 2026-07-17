# Section 02 — Candidate Lifecycle and API

## Dependency

Requires Section 01 candidate result/snapshot contract.

## Ownership

- `apps/web/shared/verticalDramaSeries/characterAssets.ts`
- `apps/web/server/services/verticalDramaCharacterStock.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/services/mediaGenerationService.ts` only for candidate provenance allowlist
- focused stock/router tests

## Implementation

Project bounded batch/candidate/task/status fields from server-authored JSONB metadata. Add
stock operations for preview draft creation/supersession, one-time batch claim, submitted/
failed settlement, owned media attachment, and atomic primary/DNA selection. Never expose or
accept candidate DNA from the browser.

Extend prompt preview for eligible candidate mode, storing strict snapshots in draft rows.
Add batch submission by batch ID, exact aggregate credit handling, independent one-image tasks,
immediate partial-failure refunds, provenance, settle, and select procedures. Preserve normal
preview/generation. Use existing tenant/user/series/character ownership patterns and protect
manual imported primaries.

## TDD

Write stock and router failures first, including owner-boundary and race/idempotency cases.
Mock paid/provider calls; never perform live media generation.

## Acceptance

- A candidate can never resolve as an identity reference before selection.
- Preview snapshots are server-stored and submission claims once.
- N means N independent tasks and N-cost reservation (or zero-cost skip).
- Partial submission refunds only unsubmitted units.
- Select atomically aligns media role and Visual Bible while preserving sibling JSON.
- Existing normal router/model/custom-instruction tests remain green.

## Security

Every row query/write repeats owner scope. Wrong batch/character/task/media combinations fail
without revealing another owner's existence.

## UI/UX Contract

### Target User / JTBD
N/A — this section supplies the API/state contract for Section 03.
### Surface Inventory
N/A — no browser component changes.
### Component Map
N/A — tRPC producer contracts only.
### State Matrix
Draft, submitted, completed, failed, selected, superseded, and partial states are verified by
service/router tests and consumed by Section 03.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
N/A — no interactive browser surface.
### Copy Contract
Return bounded error/status codes; Section 03 owns localized user copy.
### Browser Evidence Required
N/A — Section 03/04 own browser evidence.
