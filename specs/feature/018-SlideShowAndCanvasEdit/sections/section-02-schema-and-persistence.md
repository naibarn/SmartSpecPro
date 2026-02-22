# Section 02: Schema and Persistence

## Objective
Implement additive persistence for presentations/slides/assets with ordering invariants and authoritative deck byte accounting.

## Dependencies
- `section-01-foundation-and-routing`

## Implementation Scope
- Add migration(s) for presentation metadata table, slide table, asset-link table, and source-attachment metadata.
- Enforce ordering invariant with unique `(presentation_id, order_index)` constraint.
- Add data model fields for versions, slide counts, and byte accounting totals.
- Add persistence helpers for asset attach/detach accounting and reconciliation checks.
- Ensure migration strategy follows expand-first, non-destructive sequence.

## Test-First Stubs (Write Before Implementation)
- Test: migration applies additively without destructive schema changes.
- Test: duplicate `(presentation_id, order_index)` writes are rejected.
- Test: reorder persistence operation preserves uniqueness after swap and insert-middle operations.
- Test: deck byte totals update correctly after attach/remove and warning/hard-limit thresholds evaluate correctly.
- Test: reconciliation check identifies inconsistent byte totals.

## Implementation Tasks
1. Create Drizzle migration and schema definitions for new entities.
2. Implement repository-level data access primitives for presentations/slides/assets.
3. Implement transactional reorder persistence helper with bounded updates.
4. Implement byte-accounting update hooks and integrity-check query.
5. Add migration smoke script/checklist details to this section.

## Acceptance Criteria
- New tables/constraints/indexes exist and pass migration smoke checks.
- Reorder invariants are enforced under concurrent attempts.
- Server-side deck size enforcement uses authoritative persisted totals.
- Legacy document schema and behavior remain unchanged.

## Risks and Mitigations
- Risk: race conditions during reorder writes.
- Mitigation: transaction boundaries + uniqueness constraint + conflict tests.

## Out of Scope
- Router-level endpoint behavior.
- UI usage of persisted data.

## As-Built Implementation Notes

### Files Changed
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0032_presentation_schema.sql`
- `apps/web/server/services/presentationPersistence.ts`
- `apps/web/server/services/presentationPersistence.test.ts`

### Delivered Behavior
- Added additive presentation persistence schema:
  - `presentation_decks`
  - `presentation_slides`
  - `presentation_asset_links`
  - `presentation_source_attachments`
- Added uniqueness invariant for slide ordering with `presentation_slides_deck_order_unique` on `(deck_id, order_index)`.
- Added repository helpers for:
  - deck creation/read
  - slide create/list
  - transactional reorder (`reorderPresentationSlides`)
  - asset attach/detach
  - deck byte-total adjustments and reconciliation
- Added byte-threshold evaluation based on shared limits from presentation constants.

### Migration Smoke Checklist
- Migration file `0032_presentation_schema.sql` uses additive `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- No destructive SQL (`DROP TABLE`, `DROP COLUMN`) in migration.
- Required ordering uniqueness index present: `presentation_slides_deck_order_unique`.

### Deviations from Plan
- Section 02 focuses on schema/repository primitives and pure helper coverage; endpoint wiring is deferred to section 03.

### Tests Added/Updated
- `apps/web/server/services/presentationPersistence.test.ts`
  - additive migration safety checks
  - duplicate order-index rejection
  - reorder behavior for insert-middle and move-to-first cases
  - warning/hard-limit threshold evaluation
  - reconciliation mismatch detection
