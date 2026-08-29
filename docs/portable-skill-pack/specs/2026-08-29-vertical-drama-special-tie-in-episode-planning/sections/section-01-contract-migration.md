# Section 01 — Contract and migration foundation

## Goal

Create the additive data and shared-type foundation without changing normal episode
behavior.

## Owned files

- `apps/web/drizzle/schema.ts`
- new hand-authored migration under `apps/web/drizzle/migrations/`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- new special validation/sequence shared module and focused tests

## Implementation

- Add `episodeKind` default `normal`, nullable special-only `specialSequence`, and
  nullable versioned `specialData` to the episode schema.
- Add a tenant/series-scoped monotonic special-sequence ledger and an atomic allocator;
  enforce uniqueness for active special sequence values without colliding with normal
  episode numbers. Deleting an episode never decrements the ledger.
- Add idempotent SQL and normal-row backfill. Do not regenerate or rewrite unrelated
  migration metadata.
- Add typed special input, reference, model snapshot, status, result, and resolved-shot
  contracts. Preserve existing normal contracts and JSON readability.
- Add pure validation for idea 5,000, durations 8/10/12/15/20/24/30, 9:16, references
  1–3, selected characters max 4, actual speakers max 3, and shot count 1–5.

## TDD

Write tests first for defaults, bounds, JSON round trips, migration idempotence, atomic
sequence allocation, tenant isolation, special deletion non-reuse, and unchanged normal
duration behavior.

## Acceptance

Schema/types compile; migration checks pass; all new focused tests pass; normal episode
fixtures parse as `normal` without new required input.

## UI/UX Contract

### Target User / JTBD
N/A — persistence and shared contracts only; no browser surface is changed here.

### Existing Pattern Reference
N/A — UI is owned by section 06/07; those sections reference the existing episode UI.

### Surface Inventory
N/A — no route, dialog, form, table, or card changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — no UI state is introduced.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no browser controls are added.

### Copy Contract
N/A — no user-facing copy is added.

### Browser Evidence Required
N/A — browser evidence is owned by sections 06–08.
