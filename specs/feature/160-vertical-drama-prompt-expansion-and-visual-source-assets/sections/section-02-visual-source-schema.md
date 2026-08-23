# Section 02 — Visual Source Schema and Migration

## Objective

Persist Feature 160 source segments, immutable visual snapshots, news evidence revisions, and shot B-roll bindings while preserving existing source packs, managed media, and image-reference rows.

## Dependencies

- Section 01 shared contracts.
- Existing vertical_drama_source_packs, vertical_drama_source_assets, vertical_drama_source_slots, media_assets, and vertical_drama_shot_references.

## Ownership

- Extend apps/web/drizzle/schema.ts.
- Add one hand-authored migration under apps/web/drizzle/ following the repository migration/journal convention.
- Add apps/web/drizzle/__tests__/feature160VisualSourceSchema.test.ts.
- Do not edit release artifacts or unrelated migrations.

## Tables and fields

Add:

1. vertical_drama_source_media_segments: tenant/user, pack/source asset, stable segment key, revision, media type, finite in/out or still display duration, label/description, evidence scope, capture/location/source metadata, audio policy, status, timestamps.
2. vertical_drama_visual_source_snapshots: tenant/user, pack/series/profile, immutable revision/fingerprint, snapshot JSON, coverage JSON, status, timestamps.
3. vertical_drama_news_claims: tenant/user/series/profile, stable claim key, claim text/type/scope/geography, as-of/validity/freshness, status, attribution, correction lineage, visual refs, revision/timestamps.
4. vertical_drama_news_evidence_revisions: tenant/user/series/claim, revision, source URL/title/publisher/published/accessed timestamps, supported scope, evidence status, contradiction/correction metadata, immutable audit timestamps.
5. vertical_drama_shot_broll_bindings: tenant/user/series/episode/shot, source slot/asset/media/segment IDs, snapshot revision/fingerprint, segment revision, order, still duration or video in/out, fit/audio/label/attribution policies, active/status, timestamps.

Use foreign keys to the narrowest existing parent and avoid cascading deletes into media_assets. Add tenant+owner+parent lookup indexes, idempotency uniqueness, active binding/order indexes, snapshot fingerprint lookup, and claim/evidence revision lookup. Preserve historical rows when stale/corrected/deactivated.

## Migration rules

- Existing source rows remain valid when new fields are absent.
- Do not auto-convert image references or source slots into video segments/B-roll.
- Do not infer verified evidence from existing source kind or AI output.
- New writes under feature flags require complete modality/origin/evidence metadata.
- Migration is additive and reversible by disabling flags; no destructive data cleanup.
- If drizzle-kit generation conflicts with the existing journal, use a hand-authored migration and keep ORM schema synchronized.

## Tests-first requirements

Write tests before implementation for schema exports, migration table/column/index/FK presence, defaults, nullability, active uniqueness/idempotency, no media cascade, and legacy row compatibility. If a test DB fixture exists, verify a transaction rolls back a snapshot/binding mutation atomically.

## Acceptance

- check-sections.py can see this file and the migration is named/documented.
- Drizzle schema typechecks.
- Migration tests prove no destructive backfill/drop.
- Existing source-pack and shot-reference tests remain green.
- All new rows carry tenant/user ownership and immutable revision/fingerprint fields where required.

## Implementation record

- Added migration 0243_vertical_drama_visual_sources.sql for source segments, visual snapshots, news claims/evidence, and B-roll bindings.
- Added matching Drizzle schema exports and ownership/index constraints.
- Added feature160VisualSourceSchema.test.ts covering additive tables, indexes, no destructive operations, canonical media SET NULL behavior, and ORM alignment.
- Focused schema/core tests passed (9 tests) and apps/web typecheck passed.

## UI/UX Contract

### Target User / JTBD
N/A — database schema and migration have no direct browser surface.

### Existing Pattern Reference
N/A — reuse is enforced through existing source-pack/media/shot-reference tables.

### Surface Inventory
N/A — later UI sections consume the persisted projections.

### Component Map
N/A — this section owns schema/migration/test files only.

### State Matrix
N/A — schema statuses are exercised by service and UI sections.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — no user-facing control is added here.

### Copy Contract
N/A — no user-facing copy is added here.

### Browser Evidence Required
N/A — migration/schema tests are the applicable proof.
