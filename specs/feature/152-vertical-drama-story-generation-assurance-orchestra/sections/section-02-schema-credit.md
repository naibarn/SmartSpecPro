# Section 02: Durable Schema and Credit Safety

## Objective

Make the parent story run and credit side effects durable without replacing
existing episode/artifact tables.

## Owned paths

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/02xx_vertical_drama_story_generation.sql`
- `apps/web/server/services/verticalDramaStoryGenerationRepository.ts`
- `apps/web/server/services/creditService.ts` (only reservation/idempotency
  seams required by this feature)
- focused repository and credit tests

## Required behavior

- Add the additive parent table and indexes/unique predicates from spec 10.1:
  tenant/run key, tenant/idempotency key, active-status uniqueness, contract
  and source snapshots, checkpoint/cursor, attempt/lease/fence, final artifact
  and version references, credit state, cancellation, error, and timestamps.
- Link an episode run to its parent while preserving old callers and nullable
  compatibility during rollout.
- Store candidate artifacts separately from active/final versions. Use an
  explicit finalization key for retry-safe commit.
- Add repository methods that always require tenant scope and use transactions
  for admission, checkpoint, approval, and finalization.
- Extend credit reservation creation with an idempotency key and durable
  transaction linkage. Do not double-reserve on duplicate attempt/unit keys.
  Unknown Redis state must become reconciliation-required rather than silently
  charging again.

## Migration safety

Use an additive Drizzle migration and verify the generated SQL and schema
ledger. Do not apply it to production. Local database integration is evidence
only for local schema shape.

## TDD and proof

Test tenant isolation, unique active run, duplicate admission, candidate versus
active visibility, reservation retry, ceiling enforcement, refund/commit
idempotency, and Redis-unavailable behavior.

## UI/UX Contract

### Target User / JTBD
N/A: persistence and billing safety only.

### Existing Pattern Reference
N/A; repository behavior is consumed by existing server APIs.

### Surface Inventory
None.

### Component Map
None.

### State Matrix
N/A; backend states are rendered in section 06.

### Responsive Matrix
N/A; no UI is changed.

### Accessibility Acceptance
N/A; no UI is changed.

### Copy Contract
N/A; user-facing billing copy remains in the existing credits surface.

### Browser Evidence Required
None for this section; use database and service tests.
